import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  applySessionDbMigrations,
  DEFAULT_MAX_EVENT_BYTES,
  DEFAULT_MAX_JSON_BYTES,
  safeJsonDecode,
  safeJsonEncode,
  safeStateText,
  type LineageRelation,
  type MemoryKind,
  type MemoryProvenance,
  type MemoryStatus,
  type MessageRole,
  type RunStatus,
  type StateSessionIdentity,
  type SubagentStatus,
  type ToolInvocationStatus,
} from "./schema";
import { searchState, type StateSearchInput, type StateSearchResult } from "./search";

export interface SessionDbOptions {
  filename: string;
  busyTimeoutMs: number;
  maxJsonBytes: number;
  maxEventBytes: number;
  now?: () => string;
  database?: DatabaseSync;
  testOnly?: boolean;
}

export interface SessionDbHealth {
  filename: string;
  basename: string;
  schemaVersion: number;
  journalMode: string;
  foreignKeys: boolean;
  fts5: boolean;
  open: boolean;
}

export interface SessionRecord extends StateSessionIdentity {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  lastRunId?: string;
}

export interface CreateSessionInput extends StateSessionIdentity {}

export interface MessageWriteInput {
  id?: string;
  sequence?: number;
  role: MessageRole;
  content: string;
  kind?: string;
  idempotencyKey?: string;
  metadata?: unknown;
  createdAt?: string;
}

export interface AppendMessagesInput {
  sessionId: string;
  messages: readonly MessageWriteInput[];
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  sequence: number;
  role: MessageRole;
  content: string;
  contentHash: string;
  kind: string;
  idempotencyKey?: string;
  metadata?: unknown;
  createdAt: string;
}

export interface LoadMessagesInput {
  sessionId: string;
  afterSequence?: number;
  limit?: number;
}

export interface CreateRunInput {
  runId: string;
  sessionId: string;
  idempotencyKey: string;
  status?: RunStatus;
  inputHash?: string;
  startedAt?: string;
}

export interface RunRecord {
  runId: string;
  sessionId: string;
  idempotencyKey: string;
  status: RunStatus;
  inputHash?: string;
  final?: unknown;
  startedAt: string;
  finalizedAt?: string;
}

export interface RunTransitionInput {
  runId: string;
  status: RunStatus;
  final?: unknown;
  finalizedAt?: string;
}

export interface AppendWorkEventInput {
  runId: string;
  sessionId?: string;
  sequence: number;
  eventId: string;
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface StoredWorkEvent extends AppendWorkEventInput {
  sessionId: string;
}

export interface ReadWorkEventsInput {
  runId: string;
  sessionId?: string;
  afterSequence?: number;
  limit?: number;
}

export interface ToolInvocationInput {
  invocationId: string;
  turnId: string;
  runId: string;
  sequence: number;
  idempotencyKey: string;
  toolCallId: string;
  name: string;
  inputHash: string;
  status?: ToolInvocationStatus;
  approvalId?: string;
  result?: unknown;
  summary?: string;
  errorCode?: string;
  createdAt?: string;
}

export interface ToolInvocationRecord extends ToolInvocationInput {
  status: ToolInvocationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ToolInvocationTransitionInput {
  invocationId: string;
  status: ToolInvocationStatus;
  approvalId?: string;
  result?: unknown;
  summary?: string;
  errorCode?: string;
}

export interface LineageInput {
  id?: string;
  relation: LineageRelation;
  parentId: string;
  childId: string;
  metadata?: unknown;
  createdAt?: string;
}

export interface LineageRecord extends LineageInput {
  id: string;
  createdAt: string;
}

export interface CompressionLeaseInput {
  id?: string;
  sessionId: string;
  lockKey?: string;
  holderId: string;
  leaseMs: number;
  now?: string;
}

export interface CompressionLease {
  acquired: boolean;
  id: string;
  sessionId: string;
  lockKey: string;
  holderId: string;
  leaseUntil: string;
}

export interface CompressionReceiptInput {
  id?: string;
  sessionId: string;
  lockKey?: string;
  holderId?: string;
  sourceHash: string;
  strategy: string;
  receipt: unknown;
  createdAt?: string;
}

export interface CompressionRecord {
  id: string;
  sessionId: string;
  lockKey: string;
  createdAt: string;
  holderId: string;
  sourceHash?: string;
  strategy?: string;
  receipt?: unknown;
}

export interface MemoryWriteInput {
  id?: string;
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  kind: MemoryKind;
  key: string;
  value: string;
  provenance: MemoryProvenance;
  evidenceRefs: readonly string[];
  confidence?: number;
  status?: MemoryStatus;
  supersedesId?: string;
  createdAt?: string;
}

export interface MemoryRecord extends MemoryWriteInput {
  id: string;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryListInput {
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  kind?: MemoryKind;
  includeSuperseded?: boolean;
  limit?: number;
}

export interface CronJobInput {
  jobId?: string;
  tenantId: string;
  actorId: string;
  sessionId?: string;
  name: string;
  scheduleType: string;
  scheduleValue: string;
  prompt: string;
  config?: unknown;
  enabled?: boolean;
  createdAt?: string;
}

export interface CronJobRecord extends CronJobInput {
  jobId: string;
  config: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CronClaimInput {
  jobId: string;
  occurrenceKey: string;
  scheduledAt: string;
  leaseOwner: string;
  leaseMs: number;
  idempotencyKey?: string;
  now?: string;
}

export interface CronClaimResult {
  claimed: boolean;
  run?: CronRunRecord;
}

export interface CronCompletionInput {
  runId: string;
  status: "completed" | "failed";
  result?: unknown;
  now?: string;
}

export interface CronRunRecord {
  runId: string;
  jobId: string;
  occurrenceKey: string;
  scheduledAt: string;
  status: "claimed" | "completed" | "failed" | "recovered";
  leaseOwner?: string;
  leaseUntil?: string;
  idempotencyKey: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CronRecoveryInput {
  now?: string;
  limit?: number;
}

export interface SubagentCreateInput {
  subagentId: string;
  parentRunId: string;
  parentSessionId: string;
  childSessionId?: string;
  tenantId: string;
  depth: number;
  status?: SubagentStatus;
  budget: unknown;
  requestedTools: readonly string[];
  idempotencyKey: string;
  createdAt?: string;
}

export interface SubagentRecord extends SubagentCreateInput {
  status: SubagentStatus;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SubagentTransitionInput {
  subagentId: string;
  status: SubagentStatus;
  result?: unknown;
}

export interface AuditEventInput {
  id?: string;
  tenantId?: string;
  sessionId?: string;
  runId?: string;
  type: string;
  metadata: unknown;
  createdAt?: string;
}

export interface AuditEventRecord extends AuditEventInput {
  id: string;
  createdAt: string;
}

export interface SessionDbApi {
  readonly filename: string;
  readonly schemaVersion: number;
  health(): SessionDbHealth;
  createOrGetSession(input: CreateSessionInput): SessionRecord;
  getSession(sessionId: string): SessionRecord | undefined;
  attachRun(sessionId: string, runId: string): SessionRecord;
  appendMessages(input: AppendMessagesInput): MessageRecord[];
  loadMessages(input: LoadMessagesInput): MessageRecord[];
  appendRun(input: CreateRunInput): RunRecord;
  getRun(runId: string): RunRecord | undefined;
  transitionRun(input: RunTransitionInput): RunRecord;
  appendWorkEvent(input: AppendWorkEventInput): StoredWorkEvent;
  readWorkEvents(input: ReadWorkEventsInput): StoredWorkEvent[];
  appendToolInvocation(input: ToolInvocationInput): ToolInvocationRecord;
  getToolInvocation(invocationKey: string): ToolInvocationRecord | undefined;
  transitionToolInvocation(input: ToolInvocationTransitionInput): ToolInvocationRecord;
  listToolInvocations(runId: string): ToolInvocationRecord[];
  recordLineage(input: LineageInput): LineageRecord;
  getLineage(id: string): LineageRecord | undefined;
  acquireCompressionLease(input: CompressionLeaseInput): CompressionLease;
  saveCompression(input: CompressionReceiptInput): CompressionRecord;
  search(input: StateSearchInput): StateSearchResult[];
  putMemory(input: MemoryWriteInput): MemoryRecord;
  listMemory(input: MemoryListInput): MemoryRecord[];
  createAgentRun(state: unknown): void;
  getAgentRun(runId: string): unknown | undefined;
  listAgentRuns(): unknown[];
  updateAgentRun(input: { runId: string; expectedVersion: number; state: unknown }): void;
  createCronJob(input: CronJobInput): CronJobRecord;
  updateCronJob(input: Partial<CronJobInput> & { jobId: string }): CronJobRecord;
  listCronJobs(input?: { tenantId?: string }): CronJobRecord[];
  claimCronOccurrence(input: CronClaimInput): CronClaimResult;
  completeCronOccurrence(input: CronCompletionInput): CronRunRecord;
  recoverExpiredCronClaims(input: CronRecoveryInput): number;
  recordSubagent(input: SubagentCreateInput): SubagentRecord;
  getSubagent(subagentId: string): SubagentRecord | undefined;
  transitionSubagent(input: SubagentTransitionInput): SubagentRecord;
  recordAudit(input: AuditEventInput): void;
  listAudit(input?: { tenantId?: string; sessionId?: string; runId?: string }): AuditEventRecord[];
  close(): void;
}

function required(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}

function optional(value: unknown, field: string, max = 256): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return required(value, field, max);
}

function iso(value: string | undefined, now: () => string): string {
  const result = value ?? now();
  if (!Number.isFinite(Date.parse(result))) throw new Error("state timestamp is invalid");
  return new Date(result).toISOString();
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function copy<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function rowValue(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

function parseOptional(encoded: unknown): unknown {
  return typeof encoded === "string" ? safeJsonDecode(encoded) : undefined;
}

function asLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error("state result limit is invalid");
  return Math.min(value, max);
}

const TOOL_TRANSITIONS: Record<ToolInvocationStatus, readonly ToolInvocationStatus[]> = {
  queued: ["awaiting_approval", "running", "failed", "rejected", "aborted"],
  awaiting_approval: ["running", "failed", "rejected", "aborted"],
  running: ["completed", "failed", "aborted"],
  completed: [], failed: [], rejected: [], aborted: [],
};

const SUBAGENT_TRANSITIONS: Record<SubagentStatus, readonly SubagentStatus[]> = {
  queued: ["running", "failed", "rejected", "aborted"],
  running: ["completed", "failed", "aborted"],
  completed: [], failed: [], rejected: [], aborted: [],
};

export class SessionDB implements SessionDbApi {
  readonly filename: string;
  readonly schemaVersion = 1;
  private readonly db: DatabaseSync;
  private readonly ownsDatabase: boolean;
  private readonly maxJsonBytes: number;
  private readonly maxEventBytes: number;
  private readonly now: () => string;
  private closed = false;

  constructor(options: SessionDbOptions | string) {
    const normalized: SessionDbOptions = typeof options === "string"
      ? { filename: options, busyTimeoutMs: 5_000, maxJsonBytes: DEFAULT_MAX_JSON_BYTES, maxEventBytes: DEFAULT_MAX_EVENT_BYTES, testOnly: options === ":memory:" }
      : options;
    this.filename = required(normalized.filename, "session database filename", 4_096);
    if (this.filename === ":memory:" && !normalized.testOnly && !normalized.database) throw new Error("in-memory SessionDB is test-only");
    this.maxJsonBytes = Math.max(1_024, Math.floor(normalized.maxJsonBytes ?? DEFAULT_MAX_JSON_BYTES));
    this.maxEventBytes = Math.max(1_024, Math.floor(normalized.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES));
    this.now = normalized.now ?? (() => new Date().toISOString());
    if (normalized.database) {
      this.db = normalized.database;
      this.ownsDatabase = false;
    } else {
      if (this.filename !== ":memory:") mkdirSync(dirname(this.filename), { recursive: true });
      this.db = new DatabaseSync(this.filename);
      this.ownsDatabase = true;
    }
    applySessionDbMigrations(this.db, { filename: this.filename, busyTimeoutMs: normalized.busyTimeoutMs, maxJsonBytes: this.maxJsonBytes });
  }

  health(): SessionDbHealth {
    this.assertOpen();
    const journal = this.db.prepare("pragma journal_mode").get() as { journal_mode?: string };
    const fk = this.db.prepare("pragma foreign_keys").get() as { foreign_keys?: number };
    let fts5 = false;
    try { this.db.prepare("select count(*) as n from state_fts where state_fts match ?").get("health"); fts5 = true; } catch { fts5 = false; }
    return { filename: this.filename, basename: basename(this.filename), schemaVersion: this.schemaVersion, journalMode: String(journal.journal_mode ?? ""), foreignKeys: fk.foreign_keys === 1, fts5, open: !this.closed };
  }

  createOrGetSession(input: CreateSessionInput): SessionRecord {
    this.assertOpen();
    const identity = this.normalizeIdentity(input);
    const existing = this.db.prepare("select * from sessions where key_fingerprint = ?").get(identity.keyFingerprint) as Record<string, unknown> | undefined;
    if (existing) return this.sessionFromRow(existing);
    const sessionId = optional(identity.sessionId, "sessionId") ?? `session-${identity.keyFingerprint}`;
    const createdAt = iso(identity.createdAt, this.now);
    try {
      this.db.prepare(`insert into sessions(session_id, key_fingerprint, tenant_id, actor_id, channel, project_id, conversation_id, thread_id, workspace_id, snapshot_id, document_revision_id, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sessionId, identity.keyFingerprint, identity.tenantId, identity.actorId, identity.channel, identity.projectId ?? null,
        identity.conversationId, identity.threadId ?? null, identity.workspaceId ?? null, identity.snapshotId ?? null,
        identity.documentRevisionId ?? null, createdAt, createdAt,
      );
    } catch (error) {
      throw new Error(error instanceof Error && /unique/i.test(error.message) ? "session identity conflicts with an existing record" : "session could not be persisted");
    }
    return this.getSession(sessionId)!;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    this.assertOpen();
    const row = this.db.prepare("select * from sessions where session_id = ?").get(required(sessionId, "sessionId")) as Record<string, unknown> | undefined;
    return row ? this.sessionFromRow(row) : undefined;
  }

  attachRun(sessionId: string, runId: string): SessionRecord {
    this.assertOpen();
    const id = required(sessionId, "sessionId");
    const current = this.getSession(id);
    if (!current) throw new Error("session not found");
    this.db.prepare("update sessions set last_run_id = ?, updated_at = ? where session_id = ?").run(required(runId, "runId"), iso(undefined, this.now), id);
    return this.getSession(id)!;
  }

  appendMessages(input: AppendMessagesInput): MessageRecord[] {
    this.assertOpen();
    const sessionId = required(input.sessionId, "sessionId");
    if (!this.getSession(sessionId)) throw new Error("session not found");
    const output: MessageRecord[] = [];
    this.transaction(() => {
      let sequence = Number((this.db.prepare("select coalesce(max(sequence), -1) as value from messages where session_id = ?").get(sessionId) as { value: number }).value) + 1;
      for (const message of input.messages) {
        if (!(["user", "assistant", "tool", "system", "summary"] as string[]).includes(message.role)) throw new Error("message role is invalid");
        const content = safeStateText(message.content);
        const contentHash = hash(content);
        const idempotencyKey = optional(message.idempotencyKey, "message idempotency key");
        if (idempotencyKey) {
          const existing = this.db.prepare("select * from messages where session_id = ? and idempotency_key = ?").get(sessionId, idempotencyKey) as Record<string, unknown> | undefined;
          if (existing) {
            if (existing.content_hash !== contentHash || existing.role !== message.role) throw new Error("message idempotency conflict");
            output.push(this.messageFromRow(existing));
            continue;
          }
        }
        const requestedSequence = message.sequence;
        if (requestedSequence !== undefined && (!Number.isInteger(requestedSequence) || requestedSequence < 0)) throw new Error("message sequence is invalid");
        const actualSequence = requestedSequence ?? sequence;
        if (actualSequence >= sequence) sequence = actualSequence + 1;
        const id = optional(message.id, "message id") ?? `message-${hash(`${sessionId}:${actualSequence}:${contentHash}`).slice(0, 32)}`;
        const metadataJson = message.metadata === undefined ? null : safeJsonEncode(message.metadata, this.maxJsonBytes);
        const createdAt = iso(message.createdAt, this.now);
        this.db.prepare(`insert into messages(id, session_id, sequence, role, content, content_hash, kind, idempotency_key, metadata_json, created_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, sessionId, actualSequence, message.role, content, contentHash, optional(message.kind, "message kind", 64) ?? "message", idempotencyKey ?? null, metadataJson, createdAt);
        this.indexFts({ recordId: id, scopeType: "message", tenantId: this.getSession(sessionId)!.tenantId, sessionId, projectId: this.getSession(sessionId)!.projectId, kind: message.kind ?? "message", content, createdAt });
        output.push(this.getMessage(id)!);
      }
    });
    return output;
  }

  loadMessages(input: LoadMessagesInput): MessageRecord[] {
    this.assertOpen();
    const limit = asLimit(input.limit, 200, 2_000);
    const after = input.afterSequence ?? -1;
    if (!Number.isInteger(after) || after < -1) throw new Error("message sequence cursor is invalid");
    const rows = this.db.prepare("select * from messages where session_id = ? and sequence > ? order by sequence asc limit ?").all(required(input.sessionId, "sessionId"), after, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.messageFromRow(row));
  }

  appendRun(input: CreateRunInput): RunRecord {
    this.assertOpen();
    const runId = required(input.runId, "runId");
    const sessionId = required(input.sessionId, "sessionId");
    const idempotencyKey = required(input.idempotencyKey, "run idempotency key");
    if (!this.getSession(sessionId)) throw new Error("session not found");
    const existingByKey = this.db.prepare("select * from runs where session_id = ? and idempotency_key = ?").get(sessionId, idempotencyKey) as Record<string, unknown> | undefined;
    if (existingByKey) {
      if (existingByKey.run_id !== runId) throw new Error("run idempotency conflict");
      return this.runFromRow(existingByKey);
    }
    if (this.db.prepare("select run_id from runs where run_id = ?").get(runId)) throw new Error("run identity conflict");
    const startedAt = iso(input.startedAt, this.now);
    this.db.prepare("insert into runs(run_id, session_id, idempotency_key, status, input_hash, started_at) values (?, ?, ?, ?, ?, ?)").run(runId, sessionId, idempotencyKey, input.status ?? "queued", optional(input.inputHash, "inputHash", 256) ?? null, startedAt);
    return this.getRun(runId)!;
  }

  getRun(runId: string): RunRecord | undefined {
    this.assertOpen();
    const row = this.db.prepare("select * from runs where run_id = ?").get(required(runId, "runId")) as Record<string, unknown> | undefined;
    return row ? this.runFromRow(row) : undefined;
  }

  transitionRun(input: RunTransitionInput): RunRecord {
    this.assertOpen();
    const existing = this.getRun(input.runId);
    if (!existing) throw new Error("run not found");
    const allowed: Record<RunStatus, readonly RunStatus[]> = { queued: ["running", "completed", "failed", "aborted", "rejected"], running: ["completed", "failed", "aborted"], completed: [], failed: [], aborted: [], rejected: [] };
    if (existing.status !== input.status && !allowed[existing.status].includes(input.status)) throw new Error("invalid run transition");
    const finalizedAt = input.finalizedAt ? iso(input.finalizedAt, this.now) : (input.status === "completed" || input.status === "failed" || input.status === "aborted" || input.status === "rejected" ? this.now() : undefined);
    const finalJson = input.final === undefined ? undefined : safeJsonEncode(input.final, this.maxJsonBytes);
    this.db.prepare("update runs set status = ?, final_json = coalesce(?, final_json), finalized_at = coalesce(?, finalized_at) where run_id = ?").run(input.status, finalJson ?? null, finalizedAt ?? null, existing.runId);
    return this.getRun(existing.runId)!;
  }

  appendWorkEvent(input: AppendWorkEventInput): StoredWorkEvent {
    this.assertOpen();
    const run = this.getRun(input.runId);
    if (!run) throw new Error("run not found");
    const sessionId = input.sessionId ? required(input.sessionId, "sessionId") : run.sessionId;
    if (sessionId !== run.sessionId) throw new Error("work event binding mismatch");
    if (!Number.isInteger(input.sequence) || input.sequence < 0) throw new Error("work event sequence is invalid");
    const eventId = required(input.eventId, "eventId");
    const type = required(input.type, "event type", 128);
    const timestamp = iso(input.timestamp, this.now);
    const payloadJson = safeJsonEncode(input.payload, this.maxEventBytes);
    const existing = this.db.prepare("select * from run_events where run_id = ? and sequence = ?").get(run.runId, input.sequence) as Record<string, unknown> | undefined;
    if (existing) {
      const same = existing.event_id === eventId && existing.type === type && existing.payload_json === payloadJson && existing.timestamp === timestamp;
      if (!same) throw new Error("work event sequence conflict");
      return this.eventFromRow(existing);
    }
    this.db.prepare("insert into run_events(run_id, session_id, sequence, event_id, type, payload_json, timestamp) values (?, ?, ?, ?, ?, ?, ?)").run(run.runId, sessionId, input.sequence, eventId, type, payloadJson, timestamp);
    return { runId: run.runId, sessionId, sequence: input.sequence, eventId, type, payload: safeJsonDecode(payloadJson), timestamp };
  }

  readWorkEvents(input: ReadWorkEventsInput): StoredWorkEvent[] {
    this.assertOpen();
    const run = this.getRun(input.runId);
    if (!run) throw new Error("run not found");
    if (input.sessionId && input.sessionId !== run.sessionId) throw new Error("work event binding mismatch");
    const after = input.afterSequence ?? -1;
    const limit = asLimit(input.limit, 1_000, 10_000);
    const rows = this.db.prepare("select * from run_events where run_id = ? and sequence > ? order by sequence asc limit ?").all(run.runId, after, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.eventFromRow(row));
  }

  appendToolInvocation(input: ToolInvocationInput): ToolInvocationRecord {
    this.assertOpen();
    const existing = this.db.prepare("select * from tool_invocations where run_id = ? and idempotency_key = ?").get(required(input.runId, "runId"), required(input.idempotencyKey, "idempotency key")) as Record<string, unknown> | undefined;
    if (existing) {
      if (existing.invocation_id !== input.invocationId || existing.input_hash !== input.inputHash) throw new Error("tool invocation idempotency conflict");
      return this.toolFromRow(existing);
    }
    const now = iso(input.createdAt, this.now);
    const resultJson = input.result === undefined ? null : safeJsonEncode(input.result, this.maxJsonBytes);
    this.db.prepare(`insert into tool_invocations(invocation_id, turn_id, run_id, sequence, idempotency_key, tool_call_id, name, input_hash, status, approval_id, result_json, summary, error_code, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      required(input.invocationId, "invocationId"), required(input.turnId, "turnId"), required(input.runId, "runId"), input.sequence,
      required(input.idempotencyKey, "idempotency key"), required(input.toolCallId, "toolCallId"), required(input.name, "tool name", 256), required(input.inputHash, "inputHash", 256), input.status ?? "queued", optional(input.approvalId, "approvalId") ?? null, resultJson, optional(input.summary, "summary", 16_000) ?? null, optional(input.errorCode, "errorCode", 256) ?? null, now, now,
    );
    return this.getToolInvocation(input.invocationId)!;
  }

  getToolInvocation(invocationKey: string): ToolInvocationRecord | undefined {
    this.assertOpen();
    const value = required(invocationKey, "invocation key");
    const row = this.db.prepare("select * from tool_invocations where invocation_id = ? or idempotency_key = ?").get(value, value) as Record<string, unknown> | undefined;
    return row ? this.toolFromRow(row) : undefined;
  }

  transitionToolInvocation(input: ToolInvocationTransitionInput): ToolInvocationRecord {
    const existing = this.getToolInvocation(input.invocationId);
    if (!existing) throw new Error("tool invocation not found");
    if (existing.status !== input.status && !TOOL_TRANSITIONS[existing.status].includes(input.status)) throw new Error("invalid tool invocation transition");
    const resultJson = input.result === undefined ? null : safeJsonEncode(input.result, this.maxJsonBytes);
    this.db.prepare("update tool_invocations set status = ?, approval_id = coalesce(?, approval_id), result_json = coalesce(?, result_json), summary = coalesce(?, summary), error_code = coalesce(?, error_code), updated_at = ? where invocation_id = ?").run(input.status, optional(input.approvalId, "approvalId") ?? null, resultJson, optional(input.summary, "summary", 16_000) ?? null, optional(input.errorCode, "errorCode", 256) ?? null, this.now(), existing.invocationId);
    return this.getToolInvocation(existing.invocationId)!;
  }

  listToolInvocations(runId: string): ToolInvocationRecord[] {
    const rows = this.db.prepare("select * from tool_invocations where run_id = ? order by sequence asc").all(required(runId, "runId")) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toolFromRow(row));
  }

  recordLineage(input: LineageInput): LineageRecord {
    this.assertOpen();
    const relation = input.relation;
    if (!["branch", "compression", "delegate"].includes(relation)) throw new Error("lineage relation is invalid");
    const parentId = required(input.parentId, "lineage parent");
    const childId = required(input.childId, "lineage child");
    const existing = this.db.prepare("select * from lineage where relation = ? and parent_id = ? and child_id = ?").get(relation, parentId, childId) as Record<string, unknown> | undefined;
    if (existing) return this.lineageFromRow(existing);
    const id = optional(input.id, "lineage id") ?? `lineage-${randomUUID()}`;
    const createdAt = iso(input.createdAt, this.now);
    const metadataJson = input.metadata === undefined ? null : safeJsonEncode(input.metadata, this.maxJsonBytes);
    this.db.prepare("insert into lineage(id, relation, parent_id, child_id, metadata_json, created_at) values (?, ?, ?, ?, ?, ?)").run(id, relation, parentId, childId, metadataJson, createdAt);
    return this.getLineage(id)!;
  }

  getLineage(id: string): LineageRecord | undefined {
    const row = this.db.prepare("select * from lineage where id = ?").get(required(id, "lineage id")) as Record<string, unknown> | undefined;
    return row ? this.lineageFromRow(row) : undefined;
  }

  acquireCompressionLease(input: CompressionLeaseInput): CompressionLease {
    this.assertOpen();
    const sessionId = required(input.sessionId, "sessionId");
    if (!this.getSession(sessionId)) throw new Error("session not found");
    const lockKey = optional(input.lockKey, "compression lock key") ?? "context";
    const holderId = required(input.holderId, "compression holder");
    if (!Number.isInteger(input.leaseMs) || input.leaseMs <= 0 || input.leaseMs > 3_600_000) throw new Error("compression lease is invalid");
    const now = iso(input.now, this.now);
    const until = new Date(Date.parse(now) + input.leaseMs).toISOString();
    const existing = this.db.prepare("select * from compression_runs where session_id = ? and lock_key = ?").get(sessionId, lockKey) as Record<string, unknown> | undefined;
    if (existing && String(existing.lease_until) > now && existing.holder_id !== holderId) return { acquired: false, id: String(existing.id), sessionId, lockKey, holderId: String(existing.holder_id), leaseUntil: String(existing.lease_until) };
    const id = existing ? String(existing.id) : (optional(input.id, "compression lease id") ?? `compression-${randomUUID()}`);
    this.db.prepare(`insert into compression_runs(id, session_id, lock_key, holder_id, lease_until, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(session_id, lock_key) do update set holder_id = excluded.holder_id, lease_until = excluded.lease_until, updated_at = excluded.updated_at`).run(id, sessionId, lockKey, holderId, until, now, now);
    return { acquired: true, id, sessionId, lockKey, holderId, leaseUntil: until };
  }

  saveCompression(input: CompressionReceiptInput): CompressionRecord {
    this.assertOpen();
    const sessionId = required(input.sessionId, "sessionId");
    if (!this.getSession(sessionId)) throw new Error("session not found");
    const id = optional(input.id, "compression id") ?? `compression-${randomUUID()}`;
    const lockKey = optional(input.lockKey, "compression lock key") ?? "context";
    const createdAt = iso(input.createdAt, this.now);
    const receiptJson = safeJsonEncode(input.receipt, this.maxJsonBytes);
    this.db.prepare("update compression_runs set source_hash = ?, strategy = ?, receipt_json = ?, updated_at = ? where session_id = ? and lock_key = ?").run(required(input.sourceHash, "compression source hash", 256), required(input.strategy, "compression strategy", 64), receiptJson, createdAt, sessionId, lockKey);
    const existing = this.db.prepare("select * from compression_runs where session_id = ? and lock_key = ?").get(sessionId, lockKey) as Record<string, unknown> | undefined;
    if (existing) return this.compressionFromRow(existing);
    this.db.prepare("insert into compression_runs(id, session_id, lock_key, holder_id, lease_until, source_hash, strategy, receipt_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, sessionId, lockKey, input.holderId ?? "system", createdAt, input.sourceHash, input.strategy, receiptJson, createdAt, createdAt);
    return this.compressionFromRow(this.db.prepare("select * from compression_runs where id = ?").get(id) as Record<string, unknown>);
  }

  search(input: StateSearchInput): StateSearchResult[] {
    this.assertOpen();
    return searchState(this.db, input);
  }

  putMemory(input: MemoryWriteInput): MemoryRecord {
    this.assertOpen();
    const tenantId = required(input.tenantId, "tenantId");
    const key = required(input.key, "memory key", 256);
    const value = safeStateText(input.value);
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) throw new Error("memory confidence is invalid");
    if (input.supersedesId) this.db.prepare("update memory_records set status = 'superseded', updated_at = ? where id = ? and tenant_id = ?").run(this.now(), input.supersedesId, tenantId);
    const id = optional(input.id, "memory id") ?? `memory-${randomUUID()}`;
    const createdAt = iso(input.createdAt, this.now);
    const provenanceJson = safeJsonEncode(input.provenance, this.maxJsonBytes);
    const evidenceJson = safeJsonEncode([...input.evidenceRefs].slice(0, 256).map((item) => required(item, "evidence reference", 512)), this.maxJsonBytes);
    this.db.prepare(`insert into memory_records(id, tenant_id, project_id, session_id, kind, memory_key, value, provenance_json, evidence_refs_json, confidence, status, supersedes_id, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, optional(input.projectId, "projectId") ?? null, optional(input.sessionId, "sessionId") ?? null, input.kind, key, value, provenanceJson, evidenceJson, input.confidence ?? null, input.status ?? "active", input.supersedesId ?? null, createdAt, createdAt);
    this.indexFts({ recordId: id, scopeType: "memory", tenantId, sessionId: input.sessionId, projectId: input.projectId, kind: input.kind, content: `${key}\n${value}`, createdAt });
    return this.getMemory(id)!;
  }

  listMemory(input: MemoryListInput): MemoryRecord[] {
    this.assertOpen();
    const clauses = ["tenant_id = ?"];
    const args: (string | number)[] = [required(input.tenantId, "tenantId")];
    if (!input.includeSuperseded) clauses.push("status = 'active'");
    if (input.projectId) { clauses.push("project_id = ?"); args.push(required(input.projectId, "projectId")); }
    if (input.sessionId) { clauses.push("session_id = ?"); args.push(required(input.sessionId, "sessionId")); }
    if (input.kind) { clauses.push("kind = ?"); args.push(input.kind); }
    args.push(asLimit(input.limit, 200, 2_000));
    const rows = this.db.prepare(`select * from memory_records where ${clauses.join(" and ")} order by updated_at desc, id asc limit ?`).all(...args) as Array<Record<string, unknown>>;
    return rows.map((row) => this.memoryFromRow(row));
  }

  createAgentRun(state: unknown): void {
    this.assertOpen();
    const record = state && typeof state === "object" && !Array.isArray(state) ? state as Record<string, unknown> : {};
    const runId = required(record.runId, "agent run id");
    const status = required(record.status, "agent run status", 64);
    const version = record.version;
    if (!Number.isInteger(version) || (version as number) < 0) throw new Error("agent run version is invalid");
    const numericVersion = version as number;
    const createdAt = iso(typeof record.createdAt === "string" ? record.createdAt : undefined, this.now);
    const updatedAt = iso(typeof record.updatedAt === "string" ? record.updatedAt : undefined, this.now);
    const stateJson = safeJsonEncode(state, this.maxJsonBytes);
    this.db.prepare("insert into agent_runs(run_id, status, version, state_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?)").run(runId, status, numericVersion, stateJson, createdAt, updatedAt);
  }

  getAgentRun(runId: string): unknown | undefined {
    this.assertOpen();
    const row = this.db.prepare("select state_json from agent_runs where run_id = ?").get(required(runId, "agent run id")) as { state_json?: string } | undefined;
    return row?.state_json ? safeJsonDecode(row.state_json) : undefined;
  }

  listAgentRuns(): unknown[] {
    this.assertOpen();
    const rows = this.db.prepare("select state_json from agent_runs order by created_at asc, run_id asc").all() as Array<{ state_json: string }>;
    return rows.map((row) => safeJsonDecode(row.state_json));
  }

  updateAgentRun(input: { runId: string; expectedVersion: number; state: unknown }): void {
    this.assertOpen();
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("agent run version is invalid");
    const current = this.db.prepare("select version from agent_runs where run_id = ?").get(required(input.runId, "agent run id")) as { version?: number } | undefined;
    if (!current) throw new Error("agent run not found");
    if (current.version !== input.expectedVersion) throw new Error(`stale agent run: expected ${input.expectedVersion}, actual ${current.version}`);
    const record = input.state && typeof input.state === "object" && !Array.isArray(input.state) ? input.state as Record<string, unknown> : {};
    const status = required(record.status, "agent run status", 64);
    const version = record.version;
    if (!Number.isInteger(version) || (version as number) < 0) throw new Error("agent run version is invalid");
    const numericVersion = version as number;
    const updatedAt = iso(typeof record.updatedAt === "string" ? record.updatedAt : undefined, this.now);
    const stateJson = safeJsonEncode(input.state, this.maxJsonBytes);
    this.db.prepare("update agent_runs set status = ?, version = ?, state_json = ?, updated_at = ? where run_id = ? and version = ?").run(status, numericVersion, stateJson, updatedAt, input.runId, input.expectedVersion);
    const changed = this.db.prepare("select changes() as changes").get() as { changes?: number } | undefined;
    if (changed?.changes !== 1) throw new Error("agent run update failed");
  }

  createCronJob(input: CronJobInput): CronJobRecord {
    const id = optional(input.jobId, "jobId") ?? `job-${randomUUID()}`;
    const now = iso(input.createdAt, this.now);
    const prompt = safeStateText(input.prompt, 16_000);
    const configJson = safeJsonEncode(input.config ?? {}, this.maxJsonBytes);
    this.db.prepare("insert into cron_jobs(job_id, tenant_id, actor_id, session_id, name, schedule_type, schedule_value, prompt, config_json, enabled, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, required(input.tenantId, "tenantId"), required(input.actorId, "actorId"), optional(input.sessionId, "sessionId") ?? null, required(input.name, "job name", 256), required(input.scheduleType, "schedule type", 32), required(input.scheduleValue, "scheduleValue", 256), prompt, configJson, input.enabled === false ? 0 : 1, now, now);
    return this.getCronJob(id)!;
  }

  updateCronJob(input: Partial<CronJobInput> & { jobId: string }): CronJobRecord {
    const existing = this.getCronJob(input.jobId);
    if (!existing) throw new Error("cron job not found");
    const next = { ...existing, ...input, config: input.config ?? existing.config, enabled: input.enabled ?? existing.enabled } as CronJobInput & { jobId: string; config: unknown; enabled: boolean };
    this.db.prepare("update cron_jobs set name = ?, prompt = ?, config_json = ?, enabled = ?, updated_at = ? where job_id = ?").run(required(next.name, "job name", 256), safeStateText(next.prompt, 16_000), safeJsonEncode(next.config, this.maxJsonBytes), next.enabled ? 1 : 0, this.now(), existing.jobId);
    return this.getCronJob(existing.jobId)!;
  }

  listCronJobs(input: { tenantId?: string } = {}): CronJobRecord[] {
    const rows = input.tenantId
      ? this.db.prepare("select * from cron_jobs where tenant_id = ? order by created_at asc").all(required(input.tenantId, "tenantId"))
      : this.db.prepare("select * from cron_jobs order by created_at asc").all();
    return (rows as Array<Record<string, unknown>>).map((row) => this.cronJobFromRow(row));
  }

  claimCronOccurrence(input: CronClaimInput): CronClaimResult {
    this.assertOpen();
    const job = this.getCronJob(input.jobId);
    if (!job || !job.enabled) return { claimed: false };
    const now = iso(input.now, this.now);
    if (!Number.isInteger(input.leaseMs) || input.leaseMs <= 0 || input.leaseMs > 3_600_000) throw new Error("cron lease is invalid");
    const occurrenceKey = required(input.occurrenceKey, "cron occurrence key");
    const scheduledAt = iso(input.scheduledAt, this.now);
    const leaseOwner = required(input.leaseOwner, "cron lease owner");
    const idempotencyKey = required(input.idempotencyKey ?? `${job.jobId}:${occurrenceKey}`, "cron idempotency key");
    const existing = this.db.prepare("select * from cron_runs where job_id = ? and occurrence_key = ?").get(job.jobId, occurrenceKey) as Record<string, unknown> | undefined;
    if (existing && ["completed", "failed"].includes(String(existing.status))) return { claimed: false, run: this.cronRunFromRow(existing) };
    if (existing && existing.lease_until && String(existing.lease_until) > now && existing.lease_owner !== leaseOwner) return { claimed: false, run: this.cronRunFromRow(existing) };
    const runId = existing ? String(existing.run_id) : `cron-run-${randomUUID()}`;
    const leaseUntil = new Date(Date.parse(now) + input.leaseMs).toISOString();
    if (existing) {
      this.db.prepare("update cron_runs set status = 'claimed', lease_owner = ?, lease_until = ?, updated_at = ? where run_id = ?").run(leaseOwner, leaseUntil, now, runId);
    } else {
      this.db.prepare("insert into cron_runs(run_id, job_id, occurrence_key, scheduled_at, status, lease_owner, lease_until, idempotency_key, created_at, updated_at) values (?, ?, ?, ?, 'claimed', ?, ?, ?, ?, ?)").run(runId, job.jobId, occurrenceKey, scheduledAt, leaseOwner, leaseUntil, idempotencyKey, now, now);
    }
    return { claimed: true, run: this.getCronRun(runId)! };
  }

  completeCronOccurrence(input: CronCompletionInput): CronRunRecord {
    const existing = this.getCronRun(input.runId);
    if (!existing) throw new Error("cron run not found");
    if (existing.status === "completed" || existing.status === "failed") return existing;
    const now = iso(input.now, this.now);
    const resultJson = input.result === undefined ? null : safeJsonEncode(input.result, this.maxJsonBytes);
    this.db.prepare("update cron_runs set status = ?, result_json = ?, lease_until = null, updated_at = ? where run_id = ?").run(input.status, resultJson, now, existing.runId);
    return this.getCronRun(existing.runId)!;
  }

  recoverExpiredCronClaims(input: CronRecoveryInput): number {
    const now = iso(input.now, this.now);
    const limit = asLimit(input.limit, 100, 1_000);
    const rows = this.db.prepare("select run_id from cron_runs where status = 'claimed' and lease_until <= ? order by updated_at asc limit ?").all(now, limit) as Array<{ run_id: string }>;
    for (const row of rows) this.db.prepare("update cron_runs set status = 'recovered', lease_owner = null, lease_until = null, updated_at = ? where run_id = ? and status = 'claimed'").run(now, row.run_id);
    return rows.length;
  }

  recordSubagent(input: SubagentCreateInput): SubagentRecord {
    const existing = this.db.prepare("select * from subagent_runs where parent_run_id = ? and idempotency_key = ?").get(required(input.parentRunId, "parentRunId"), required(input.idempotencyKey, "subagent idempotency key")) as Record<string, unknown> | undefined;
    if (existing) return this.subagentFromRow(existing);
    const now = iso(input.createdAt, this.now);
    this.db.prepare("insert into subagent_runs(subagent_id, parent_run_id, parent_session_id, child_session_id, tenant_id, depth, status, budget_json, requested_tools_json, idempotency_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(required(input.subagentId, "subagentId"), required(input.parentRunId, "parentRunId"), required(input.parentSessionId, "parentSessionId"), optional(input.childSessionId, "childSessionId") ?? null, required(input.tenantId, "tenantId"), input.depth, input.status ?? "queued", safeJsonEncode(input.budget, this.maxJsonBytes), safeJsonEncode([...input.requestedTools], this.maxJsonBytes), required(input.idempotencyKey, "subagent idempotency key"), now, now);
    return this.getSubagent(input.subagentId)!;
  }

  getSubagent(subagentId: string): SubagentRecord | undefined {
    const row = this.db.prepare("select * from subagent_runs where subagent_id = ?").get(required(subagentId, "subagentId")) as Record<string, unknown> | undefined;
    return row ? this.subagentFromRow(row) : undefined;
  }

  transitionSubagent(input: SubagentTransitionInput): SubagentRecord {
    const existing = this.getSubagent(input.subagentId);
    if (!existing) throw new Error("subagent not found");
    if (existing.status !== input.status && !SUBAGENT_TRANSITIONS[existing.status].includes(input.status)) throw new Error("invalid subagent transition");
    this.db.prepare("update subagent_runs set status = ?, result_json = coalesce(?, result_json), updated_at = ? where subagent_id = ?").run(input.status, input.result === undefined ? null : safeJsonEncode(input.result, this.maxJsonBytes), this.now(), existing.subagentId);
    return this.getSubagent(existing.subagentId)!;
  }

  recordAudit(input: AuditEventInput): void {
    this.assertOpen();
    const metadataJson = safeJsonEncode(input.metadata, Math.min(this.maxJsonBytes, 32_000));
    this.db.prepare("insert into audit_events(id, tenant_id, session_id, run_id, type, metadata_json, created_at) values (?, ?, ?, ?, ?, ?, ?)").run(optional(input.id, "audit id") ?? `audit-${randomUUID()}`, optional(input.tenantId, "tenantId") ?? null, optional(input.sessionId, "sessionId") ?? null, optional(input.runId, "runId") ?? null, required(input.type, "audit type", 128), metadataJson, iso(input.createdAt, this.now));
  }

  listAudit(input: { tenantId?: string; sessionId?: string; runId?: string } = {}): AuditEventRecord[] {
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (input.tenantId) { clauses.push("tenant_id = ?"); args.push(required(input.tenantId, "tenantId")); }
    if (input.sessionId) { clauses.push("session_id = ?"); args.push(required(input.sessionId, "sessionId")); }
    if (input.runId) { clauses.push("run_id = ?"); args.push(required(input.runId, "runId")); }
    const rows = this.db.prepare(`select * from audit_events${clauses.length ? ` where ${clauses.join(" and ")}` : ""} order by created_at asc`).all(...args) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), tenantId: optional(row.tenant_id, "tenantId"), sessionId: optional(row.session_id, "sessionId"), runId: optional(row.run_id, "runId"), type: String(row.type), metadata: safeJsonDecode(String(row.metadata_json)), createdAt: String(row.created_at) }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.ownsDatabase) this.db.close();
  }

  get database(): DatabaseSync {
    this.assertOpen();
    return this.db;
  }

  private normalizeIdentity(input: CreateSessionInput): CreateSessionInput {
    return {
      sessionId: optional(input.sessionId, "sessionId"), keyFingerprint: required(input.keyFingerprint, "keyFingerprint", 256),
      tenantId: required(input.tenantId, "tenantId"), actorId: required(input.actorId, "actorId"), channel: required(input.channel, "channel", 64),
      projectId: optional(input.projectId, "projectId"), conversationId: required(input.conversationId, "conversationId"), threadId: optional(input.threadId, "threadId"), workspaceId: optional(input.workspaceId, "workspaceId"), snapshotId: optional(input.snapshotId, "snapshotId"), documentRevisionId: optional(input.documentRevisionId, "documentRevisionId"), createdAt: input.createdAt,
    };
  }

  private indexFts(input: { recordId: string; scopeType: string; tenantId: string; sessionId?: string; projectId?: string; kind: string; content: string; createdAt: string }): void {
    this.db.prepare("insert or replace into state_fts_source(record_id, scope_type, tenant_id, session_id, project_id, kind, content, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)").run(input.recordId, input.scopeType, input.tenantId, input.sessionId ?? null, input.projectId ?? null, input.kind, input.content, input.createdAt);
    this.db.prepare("delete from state_fts where record_id = ?").run(input.recordId);
    this.db.prepare("insert into state_fts(record_id, scope_type, tenant_id, session_id, project_id, kind, content, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)").run(input.recordId, input.scopeType, input.tenantId, input.sessionId ?? null, input.projectId ?? null, input.kind, input.content, input.createdAt);
  }

  private getMessage(id: string): MessageRecord | undefined {
    const row = this.db.prepare("select * from messages where id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.messageFromRow(row) : undefined;
  }

  private getMemory(id: string): MemoryRecord | undefined {
    const row = this.db.prepare("select * from memory_records where id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.memoryFromRow(row) : undefined;
  }

  private getCronJob(id: string): CronJobRecord | undefined {
    const row = this.db.prepare("select * from cron_jobs where job_id = ?").get(required(id, "jobId")) as Record<string, unknown> | undefined;
    return row ? this.cronJobFromRow(row) : undefined;
  }

  private getCronRun(id: string): CronRunRecord | undefined {
    const row = this.db.prepare("select * from cron_runs where run_id = ?").get(required(id, "cron run id")) as Record<string, unknown> | undefined;
    return row ? this.cronRunFromRow(row) : undefined;
  }

  private transaction(fn: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try { fn(); this.db.exec("COMMIT"); } catch (error) { try { this.db.exec("ROLLBACK"); } catch { /* preserve original error */ } throw error; }
  }

  private assertOpen(): void { if (this.closed) throw new Error("session database is closed"); }

  private sessionFromRow(row: Record<string, unknown>): SessionRecord {
    return { sessionId: String(row.session_id), keyFingerprint: String(row.key_fingerprint), tenantId: String(row.tenant_id), actorId: String(row.actor_id), channel: String(row.channel), projectId: optional(row.project_id, "projectId"), conversationId: String(row.conversation_id), threadId: optional(row.thread_id, "threadId"), workspaceId: optional(row.workspace_id, "workspaceId"), snapshotId: optional(row.snapshot_id, "snapshotId"), documentRevisionId: optional(row.document_revision_id, "documentRevisionId"), createdAt: String(row.created_at), updatedAt: String(row.updated_at), lastRunId: optional(row.last_run_id, "lastRunId") };
  }

  private messageFromRow(row: Record<string, unknown>): MessageRecord {
    return { id: String(row.id), sessionId: String(row.session_id), sequence: Number(row.sequence), role: String(row.role) as MessageRole, content: String(row.content), contentHash: String(row.content_hash), kind: String(row.kind), idempotencyKey: optional(row.idempotency_key, "idempotencyKey"), metadata: parseOptional(row.metadata_json), createdAt: String(row.created_at) };
  }

  private runFromRow(row: Record<string, unknown>): RunRecord {
    return { runId: String(row.run_id), sessionId: String(row.session_id), idempotencyKey: String(row.idempotency_key), status: String(row.status) as RunStatus, inputHash: optional(row.input_hash, "inputHash"), final: parseOptional(row.final_json), startedAt: String(row.started_at), finalizedAt: optional(row.finalized_at, "finalizedAt") };
  }

  private eventFromRow(row: Record<string, unknown>): StoredWorkEvent {
    return { runId: String(row.run_id), sessionId: String(row.session_id), sequence: Number(row.sequence), eventId: String(row.event_id), type: String(row.type), payload: safeJsonDecode(String(row.payload_json)), timestamp: String(row.timestamp) };
  }

  private toolFromRow(row: Record<string, unknown>): ToolInvocationRecord {
    return { invocationId: String(row.invocation_id), turnId: String(row.turn_id), runId: String(row.run_id), sequence: Number(row.sequence), idempotencyKey: String(row.idempotency_key), toolCallId: String(row.tool_call_id), name: String(row.name), inputHash: String(row.input_hash), status: String(row.status) as ToolInvocationStatus, approvalId: optional(row.approval_id, "approvalId"), result: parseOptional(row.result_json), summary: optional(row.summary, "summary", 16_000), errorCode: optional(row.error_code, "errorCode", 256), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  private lineageFromRow(row: Record<string, unknown>): LineageRecord {
    return { id: String(row.id), relation: String(row.relation) as LineageRelation, parentId: String(row.parent_id), childId: String(row.child_id), metadata: parseOptional(row.metadata_json), createdAt: String(row.created_at) };
  }

  private compressionFromRow(row: Record<string, unknown>): CompressionRecord {
    return { id: String(row.id), sessionId: String(row.session_id), lockKey: String(row.lock_key), holderId: String(row.holder_id), sourceHash: optional(row.source_hash, "sourceHash"), strategy: optional(row.strategy, "strategy", 64), receipt: parseOptional(row.receipt_json), createdAt: String(row.created_at) };
  }

  private memoryFromRow(row: Record<string, unknown>): MemoryRecord {
    return { id: String(row.id), tenantId: String(row.tenant_id), projectId: optional(row.project_id, "projectId"), sessionId: optional(row.session_id, "sessionId"), kind: String(row.kind) as MemoryKind, key: String(row.memory_key), value: String(row.value), provenance: safeJsonDecode(String(row.provenance_json)) as MemoryProvenance, evidenceRefs: safeJsonDecode(String(row.evidence_refs_json)) as string[], confidence: row.confidence === null ? undefined : Number(row.confidence), status: String(row.status) as MemoryStatus, supersedesId: optional(row.supersedes_id, "supersedesId"), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  private cronJobFromRow(row: Record<string, unknown>): CronJobRecord {
    return { jobId: String(row.job_id), tenantId: String(row.tenant_id), actorId: String(row.actor_id), sessionId: optional(row.session_id, "sessionId"), name: String(row.name), scheduleType: String(row.schedule_type), scheduleValue: String(row.schedule_value), prompt: String(row.prompt), config: safeJsonDecode(String(row.config_json)), enabled: Number(row.enabled) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  private cronRunFromRow(row: Record<string, unknown>): CronRunRecord {
    return { runId: String(row.run_id), jobId: String(row.job_id), occurrenceKey: String(row.occurrence_key), scheduledAt: String(row.scheduled_at), status: String(row.status) as CronRunRecord["status"], leaseOwner: optional(row.lease_owner, "leaseOwner"), leaseUntil: optional(row.lease_until, "leaseUntil"), idempotencyKey: String(row.idempotency_key), result: parseOptional(row.result_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  private subagentFromRow(row: Record<string, unknown>): SubagentRecord {
    return { subagentId: String(row.subagent_id), parentRunId: String(row.parent_run_id), parentSessionId: String(row.parent_session_id), childSessionId: optional(row.child_session_id, "childSessionId"), tenantId: String(row.tenant_id), depth: Number(row.depth), status: String(row.status) as SubagentStatus, budget: safeJsonDecode(String(row.budget_json)), requestedTools: safeJsonDecode(String(row.requested_tools_json)) as string[], idempotencyKey: String(row.idempotency_key), result: parseOptional(row.result_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
}

export type { StateSearchInput, StateSearchResult } from "./search";
