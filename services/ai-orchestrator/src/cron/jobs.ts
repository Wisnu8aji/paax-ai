import type { SessionDB } from "../state/session-db";
import { scanSecurityContent } from "../security/redaction";

export interface CronSchedule {
  kind: "once" | "interval";
  at?: string;
  intervalMs?: number;
}

export interface CronJob {
  jobId: string;
  bindingId: string;
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
  schedule: CronSchedule;
  prompt: string;
  enabled: boolean;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CronJobStore {
  put(job: CronJob): void;
  get(jobId: string): CronJob | undefined;
  list(): readonly CronJob[];
  disable(jobId: string): void;
  remove?(jobId: string): void;
}

export interface DurableCronClaim {
  claimed: boolean;
  runId?: string;
}

export interface DurableCronJobStore extends CronJobStore {
  claim(jobId: string, occurrenceKey: string, leaseOwner: string, leaseMs: number, now: string): DurableCronClaim;
  complete(runId: string, status: "completed" | "failed", result?: unknown, now?: string): { runId: string; status: string; result?: unknown };
  recover(now: string, limit?: number): number;
}

export type CronJobValidationCode = "invalid_schedule" | "binding_missing" | "prompt_invalid";

function cloneJob(job: CronJob): CronJob {
  return {
    ...job,
    schedule: { ...job.schedule },
  };
}

function persistedConfig(job: CronJob): Record<string, unknown> {
  return { bindingId: job.bindingId, nextRunAt: job.nextRunAt, schedule: { ...job.schedule } };
}

function fromDurableRecord(record: import("../state/session-db").CronJobRecord): CronJob {
  const config = record.config && typeof record.config === "object" && !Array.isArray(record.config) ? record.config as Record<string, unknown> : {};
  const schedule = config.schedule && typeof config.schedule === "object" && !Array.isArray(config.schedule) ? config.schedule as CronSchedule : undefined;
  const bindingId = typeof config.bindingId === "string" ? config.bindingId : "";
  const nextRunAt = typeof config.nextRunAt === "string" ? config.nextRunAt : "";
  return {
    jobId: record.jobId,
    bindingId,
    tenantId: record.tenantId,
    actorId: record.actorId,
    sessionId: record.sessionId,
    schedule: schedule ?? { kind: "once", at: nextRunAt },
    prompt: record.prompt,
    enabled: record.enabled,
    nextRunAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

const SECRET_PROMPT = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+|authorization\s*:\s*bearer\s+[^\s,;]+/iu;

export function validateCronJob(job: CronJob): CronJobValidationCode | undefined {
  if (!job || typeof job !== "object" || typeof job.jobId !== "string" || !job.jobId.trim()) return "invalid_schedule";
  if (typeof job.bindingId !== "string" || !job.bindingId.trim()) return "binding_missing";
  if (typeof job.prompt !== "string" || !job.prompt.trim() || job.prompt.length > 16_000 || SECRET_PROMPT.test(job.prompt) || scanSecurityContent(job.prompt).includes("secret_exfiltration")) return "prompt_invalid";
  if (!validDate(job.nextRunAt)) return "invalid_schedule";
  if (job.schedule?.kind === "once") {
    if (!validDate(job.schedule.at)) return "invalid_schedule";
  } else if (job.schedule?.kind === "interval") {
    const intervalMs = job.schedule.intervalMs;
    if (typeof intervalMs !== "number" || !Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs > 365 * 24 * 60 * 60 * 1_000) return "invalid_schedule";
  } else {
    return "invalid_schedule";
  }
  return undefined;
}

/** Phase 4 storage is intentionally process-local and is not a durability claim. */
export class InMemoryCronJobStore implements CronJobStore {
  private readonly jobs = new Map<string, CronJob>();

  put(job: CronJob): void {
    this.jobs.set(job.jobId, cloneJob(job));
  }

  get(jobId: string): CronJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? cloneJob(job) : undefined;
  }

  list(): readonly CronJob[] {
    return [...this.jobs.values()].sort((left, right) => left.jobId.localeCompare(right.jobId)).map(cloneJob);
  }

  disable(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.enabled = false;
  }

  remove(jobId: string): void {
    this.jobs.delete(jobId);
  }
}

export interface SqliteCronJobStoreOptions {
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
}

/** Durable cron projection over the composition-root SessionDB. */
export class SqliteCronJobStore implements DurableCronJobStore {
  constructor(private readonly db: SessionDB, private readonly options: SqliteCronJobStoreOptions = {}) {}

  put(job: CronJob): void {
    const validation = validateCronJob(job);
    if (validation) throw new Error(`cron job ${validation}`);
    const tenantId = job.tenantId ?? this.options.tenantId;
    const actorId = job.actorId ?? this.options.actorId;
    if (!tenantId || !actorId) throw new Error("cron tenant and actor binding are required");
    const existing = this.db.listCronJobs({ tenantId }).find((item) => item.jobId === job.jobId);
    if (existing) {
      this.db.updateCronJob({ jobId: job.jobId, name: job.jobId, prompt: job.prompt, config: persistedConfig(job), enabled: job.enabled });
      return;
    }
    this.db.createCronJob({ jobId: job.jobId, tenantId, actorId, sessionId: job.sessionId ?? this.options.sessionId, name: job.jobId, scheduleType: job.schedule.kind, scheduleValue: job.schedule.kind === "once" ? job.schedule.at! : String(job.schedule.intervalMs), prompt: job.prompt, config: persistedConfig(job), enabled: job.enabled, createdAt: job.createdAt });
  }

  get(jobId: string): CronJob | undefined {
    return this.list().find((job) => job.jobId === jobId);
  }

  list(): readonly CronJob[] {
    const jobs = this.db.listCronJobs(this.options.tenantId ? { tenantId: this.options.tenantId } : {});
    return jobs.map(fromDurableRecord).sort((left, right) => left.jobId.localeCompare(right.jobId)).map(cloneJob);
  }

  disable(jobId: string): void {
    const job = this.get(jobId);
    if (job) this.db.updateCronJob({ jobId, enabled: false });
  }

  remove(jobId: string): void {
    this.disable(jobId);
  }

  claim(jobId: string, occurrenceKey: string, leaseOwner: string, leaseMs: number, now: string): DurableCronClaim {
    const result = this.db.claimCronOccurrence({ jobId, occurrenceKey, scheduledAt: occurrenceKey, leaseOwner, leaseMs, now, idempotencyKey: `${jobId}:${occurrenceKey}` });
    return { claimed: result.claimed, ...(result.run ? { runId: result.run.runId } : {}) };
  }

  complete(runId: string, status: "completed" | "failed", result?: unknown, now?: string): { runId: string; status: string; result?: unknown } {
    return this.db.completeCronOccurrence({ runId, status, result, now });
  }

  recover(now: string, limit?: number): number {
    return this.db.recoverExpiredCronClaims({ now, limit });
  }
}
