import { createHash } from "node:crypto";

export type TurnJournalStatus = "queued" | "awaiting_approval" | "running" | "completed" | "failed" | "rejected" | "aborted";

export interface TurnJournalRecord {
  invocationId: string;
  sequence: number;
  idempotencyKey: string;
  runId: string;
  toolCallId: string;
  name: string;
  inputHash: string;
  status: TurnJournalStatus;
  createdAt: string;
  updatedAt: string;
  approvalId?: string;
  result?: Record<string, unknown>;
  summary?: string;
  errorCode?: string;
}

export type ToolInvocationRecord = TurnJournalRecord;

export interface TurnJournalSnapshot {
  turnId: string;
  version: number;
  nextSequence: number;
  entries: readonly ToolInvocationRecord[];
  capturedAt: string;
}

export interface TurnJournalInput {
  runId: string;
  toolCallId: string;
  name: string;
  inputHash: string;
  idempotencyKey?: string;
}

export interface BeginExecutionInput {
  turnId: string;
  invocationId: string;
  idempotencyKey: string;
  runId: string;
  toolCallId: string;
  name: string;
  inputHash: string;
  now?: string;
}

export type BeginExecutionResult =
  | { kind: "started"; record: TurnJournalRecord }
  | { kind: "replay"; record: TurnJournalRecord }
  | { kind: "conflict"; existing: TurnJournalRecord };

export class TurnJournalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnJournalConflictError";
  }
}

const TRANSITIONS: Record<TurnJournalStatus, readonly TurnJournalStatus[]> = {
  queued: ["awaiting_approval", "running", "failed", "rejected", "aborted"],
  awaiting_approval: ["running", "failed", "rejected", "aborted"],
  running: ["completed", "failed", "aborted"],
  completed: [],
  failed: [],
  rejected: [],
  aborted: [],
};

function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("tool input contains a non-finite number");
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") throw new Error("tool input contains an unsupported value");
    return value;
  }
  if (Array.isArray(value)) return value.map(stableValue);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
}

export function hashToolInput(runId: string, toolCallId: string, name: string, args: Record<string, unknown>): string {
  const material = JSON.stringify(stableValue({ runId, toolCallId, name, args }));
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function copy<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export class TurnJournal {
  private readonly records = new Map<string, TurnJournalRecord>();
  private readonly byIdempotency = new Map<string, string>();
  private sequence = 0;
  private version = 0;
  private turnId?: string;

  constructor(private readonly now: () => number = Date.now, turnId?: string) {
    this.turnId = turnId?.trim() || undefined;
  }

  enqueue(input: TurnJournalInput): { record: TurnJournalRecord; replayed: boolean } {
    const idempotencyKey = input.idempotencyKey ?? `${input.runId}:${input.toolCallId}:${input.inputHash}`;
    const result = this.beginExecution({
      turnId: input.runId,
      invocationId: `invocation-${this.sequence}`,
      idempotencyKey,
      runId: input.runId,
      toolCallId: input.toolCallId,
      name: input.name,
      inputHash: input.inputHash,
    });
    if (result.kind === "conflict") throw new TurnJournalConflictError("tool invocation idempotency conflict");
    return { record: copy(result.record), replayed: result.kind === "replay" };
  }

  /**
   * Atomic in-memory check-and-record gate. It orders the journal write before
   * any approval wait or handler side effect. It is not durable across a
   * process crash and does not provide exactly-once semantics for externals.
   */
  beginExecution(input: BeginExecutionInput): BeginExecutionResult {
    const turnId = input.turnId.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    const invocationId = input.invocationId.trim();
    if (!turnId || !idempotencyKey || !invocationId) throw new Error("journal execution identity is required");
    if (this.turnId && this.turnId !== turnId) {
      const existing = this.records.values().next().value as TurnJournalRecord | undefined;
      if (existing) return { kind: "conflict", existing: copy(existing) };
      throw new TurnJournalConflictError("journal turn identity conflict");
    }
    this.turnId = this.turnId ?? turnId;

    const existingByInvocation = this.records.get(invocationId);
    if (existingByInvocation) {
      return this.sameInvocation(existingByInvocation, input)
        ? { kind: "replay", record: copy(existingByInvocation) }
        : { kind: "conflict", existing: copy(existingByInvocation) };
    }
    const existingId = this.byIdempotency.get(idempotencyKey);
    if (existingId) {
      const existing = this.records.get(existingId)!;
      return this.sameInvocation(existing, input, false)
        ? { kind: "replay", record: copy(existing) }
        : { kind: "conflict", existing: copy(existing) };
    }

    const now = input.now ?? new Date(this.now()).toISOString();
    const record: TurnJournalRecord = {
      invocationId,
      sequence: this.sequence++,
      idempotencyKey,
      runId: input.runId,
      toolCallId: input.toolCallId,
      name: input.name,
      inputHash: input.inputHash,
      status: "queued",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.records.set(record.invocationId, record);
    this.byIdempotency.set(idempotencyKey, record.invocationId);
    this.version += 1;
    return { kind: "started", record: copy(record) };
  }

  transition(invocationId: string, status: TurnJournalStatus, patch: Partial<Pick<TurnJournalRecord, "approvalId" | "result" | "summary" | "errorCode">> = {}): TurnJournalRecord {
    const record = this.records.get(invocationId);
    if (!record) throw new Error("tool invocation journal record not found");
    if (!TRANSITIONS[record.status].includes(status)) throw new Error(`invalid journal transition: ${record.status} -> ${status}`);
    record.status = status;
    record.updatedAt = new Date(this.now()).toISOString();
    if (patch.approvalId !== undefined) record.approvalId = patch.approvalId;
    if (patch.result !== undefined) record.result = copy(patch.result);
    if (patch.summary !== undefined) record.summary = patch.summary.slice(0, 16_000);
    if (patch.errorCode !== undefined) record.errorCode = patch.errorCode.slice(0, 256);
    this.version += 1;
    return copy(record);
  }

  get(invocationId: string): TurnJournalRecord | undefined {
    const record = this.records.get(invocationId);
    return record ? copy(record) : undefined;
  }

  findByIdempotencyKey(idempotencyKey: string): TurnJournalRecord | undefined {
    const id = this.byIdempotency.get(idempotencyKey);
    return id ? this.get(id) : undefined;
  }

  list(): TurnJournalRecord[] {
    return [...this.records.values()].map(copy);
  }

  snapshot(turnId = this.turnId ?? "unknown", capturedAt = new Date(this.now()).toISOString()): TurnJournalSnapshot {
    const entries = this.list().map((record) => deepFreeze(record));
    return Object.freeze({
      turnId,
      version: this.version,
      nextSequence: this.sequence,
      entries: Object.freeze(entries),
      capturedAt: new Date(capturedAt).toISOString(),
    });
  }

  private sameInvocation(existing: TurnJournalRecord, input: BeginExecutionInput, includeInvocationId = true): boolean {
    return (!includeInvocationId || existing.invocationId === input.invocationId)
      && existing.idempotencyKey === input.idempotencyKey
      && existing.runId === input.runId
      && existing.toolCallId === input.toolCallId
      && existing.name === input.name
      && existing.inputHash === input.inputHash;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
