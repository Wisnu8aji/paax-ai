import {
  InMemoryCronJobStore,
  validateCronJob,
  type CronJob,
  type CronJobStore,
  type DurableCronJobStore,
} from "./jobs";
import { observeSafely, type RuntimeObservation } from "../agent/monitoring";

export interface SchedulerRunReceipt {
  jobId: string;
  runId: string;
  status: "dispatched" | "skipped" | "rejected" | "failed";
  code:
    | "due"
    | "not_due"
    | "disabled"
    | "invalid_schedule"
    | "binding_missing"
    | "prompt_invalid"
    | "already_claimed"
    | "scheduler_not_persistent";
  at: string;
}

export interface CronRunInput {
  job: CronJob;
  runId: string;
  at: string;
}

export interface CronSchedulerOptions {
  store?: CronJobStore;
  runTurn: (input: CronRunInput) => Promise<unknown> | unknown;
  now?: () => string;
  allowedBindingIds?: readonly string[];
  isBindingAllowed?: (bindingId: string) => boolean;
  leaseOwner?: string;
  claimLeaseMs?: number;
  observation?: Pick<RuntimeObservation, "onBackground">;
}

export interface CronSchedulerContract {
  tick(now: string): Promise<readonly SchedulerRunReceipt[]>;
  add(job: CronJob): void;
  remove(jobId: string): void;
}

function runIdFor(job: CronJob): string {
  return `cron:${job.jobId}:${job.nextRunAt}`;
}

function nextIntervalAt(job: CronJob, nowMs: number): string {
  const dueMs = Date.parse(job.nextRunAt);
  const intervalMs = job.schedule.intervalMs!;
  const steps = Math.max(1, Math.floor(Math.max(0, nowMs - dueMs) / intervalMs) + 1);
  return new Date(dueMs + steps * intervalMs).toISOString();
}

/**
 * Explicit-tick scheduler. It never starts a timer or a daemon and its store is
 * process-local unless a future phase injects another implementation.
 */
export class CronScheduler implements CronSchedulerContract {
  private readonly store: CronJobStore;
  private readonly now: () => string;
  private readonly allowedBindingIds?: ReadonlySet<string>;

  constructor(private readonly options: CronSchedulerOptions) {
    this.store = options.store ?? new InMemoryCronJobStore();
    this.now = options.now ?? (() => new Date().toISOString());
    this.allowedBindingIds = options.allowedBindingIds ? new Set(options.allowedBindingIds) : undefined;
  }

  add(job: CronJob): void {
    this.store.put({ ...job, schedule: { ...job.schedule } });
  }

  remove(jobId: string): void {
    if (this.store.remove) this.store.remove(jobId);
    else this.store.disable(jobId);
  }

  async tick(now = this.now()): Promise<readonly SchedulerRunReceipt[]> {
    const atMs = Date.parse(now);
    const at = Number.isFinite(atMs) ? new Date(atMs).toISOString() : now;
    const receipts: SchedulerRunReceipt[] = [];
    for (const job of this.store.list()) {
      if (!job.enabled) {
        receipts.push({ jobId: job.jobId, runId: runIdFor(job), status: "skipped", code: "disabled", at });
        continue;
      }
      const validation = validateCronJob(job);
      if (validation) {
        receipts.push({ jobId: job.jobId, runId: runIdFor(job), status: "rejected", code: validation, at });
        continue;
      }
      if (this.allowedBindingIds && !this.allowedBindingIds.has(job.bindingId)) {
        receipts.push({ jobId: job.jobId, runId: runIdFor(job), status: "rejected", code: "binding_missing", at });
        continue;
      }
      if (this.options.isBindingAllowed && !this.options.isBindingAllowed(job.bindingId)) {
        receipts.push({ jobId: job.jobId, runId: runIdFor(job), status: "rejected", code: "binding_missing", at });
        continue;
      }
      if (Date.parse(job.nextRunAt) > atMs) {
        receipts.push({ jobId: job.jobId, runId: runIdFor(job), status: "skipped", code: "not_due", at });
        continue;
      }

      const durableStore = this.store as Partial<DurableCronJobStore>;
      const durableClaim = typeof durableStore.claim === "function"
        ? durableStore.claim(job.jobId, job.nextRunAt, this.options.leaseOwner ?? "cron-host", this.options.claimLeaseMs ?? 300_000, at)
        : undefined;
      if (durableClaim && !durableClaim.claimed) {
        receipts.push({ jobId: job.jobId, runId: durableClaim.runId ?? runIdFor(job), status: "skipped", code: "already_claimed", at });
        continue;
      }
      const runId = durableClaim?.runId ?? runIdFor(job);
      if (job.schedule.kind === "once") {
        this.store.put({ ...job, enabled: false, updatedAt: at, schedule: { ...job.schedule } });
      } else {
        this.store.put({
          ...job,
          nextRunAt: nextIntervalAt(job, atMs),
          updatedAt: at,
          schedule: { ...job.schedule },
        });
      }

      try {
        const result = await this.options.runTurn({ job: { ...job, schedule: { ...job.schedule } }, runId, at });
        if (durableClaim && typeof durableStore.complete === "function") durableStore.complete(runId, "completed", result, at);
        receipts.push({ jobId: job.jobId, runId, status: "dispatched", code: "due", at });
      } catch {
        if (durableClaim && typeof durableStore.complete === "function") durableStore.complete(runId, "failed", undefined, at);
        receipts.push({ jobId: job.jobId, runId, status: "failed", code: "due", at });
      }
    }
    await Promise.all(receipts.map((receipt) => observeSafely(this.options.observation?.onBackground, {
      jobId: receipt.jobId,
      runId: receipt.runId,
      status: receipt.status,
      code: receipt.code,
      at: receipt.at,
    })));
    return receipts;
  }
}

export class InMemoryCronScheduler extends CronScheduler {}
