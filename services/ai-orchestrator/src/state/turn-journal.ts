import {
  TurnJournal,
  TurnJournalConflictError,
  type BeginExecutionInput,
  type BeginExecutionResult,
  type TurnJournalRecord,
  type TurnJournalSnapshot,
  type TurnJournalStatus,
} from "../agent/turn-state";
import type { SessionDB } from "./session-db";

/** Restart-safe adapter that keeps the Phase 3 TurnJournal API and transition rules. */
export class DurableTurnJournal extends TurnJournal {
  constructor(private readonly db: SessionDB, private readonly durableTurnId: string, now: () => string = () => new Date().toISOString()) {
    super(() => Date.parse(now()), durableTurnId);
  }

  override beginExecution(input: BeginExecutionInput): BeginExecutionResult {
    if (input.turnId !== this.durableTurnId) throw new TurnJournalConflictError("journal turn identity conflict");
    const existing = this.db.getToolInvocation(input.invocationId) ?? this.db.getToolInvocation(input.idempotencyKey);
    if (existing) {
      const same = existing.idempotencyKey === input.idempotencyKey && existing.runId === input.runId && existing.toolCallId === input.toolCallId && existing.name === input.name && existing.inputHash === input.inputHash;
      return same ? { kind: "replay", record: this.toJournalRecord(existing) } : { kind: "conflict", existing: this.toJournalRecord(existing) };
    }
    const record = this.db.appendToolInvocation({
      invocationId: input.invocationId,
      turnId: input.turnId,
      runId: input.runId,
      sequence: this.db.listToolInvocations(input.runId).length,
      idempotencyKey: input.idempotencyKey,
      toolCallId: input.toolCallId,
      name: input.name,
      inputHash: input.inputHash,
      status: "queued",
      createdAt: input.now,
    });
    return { kind: "started", record: this.toJournalRecord(record) };
  }

  override transition(invocationId: string, status: TurnJournalStatus, patch: Partial<Pick<TurnJournalRecord, "approvalId" | "result" | "summary" | "errorCode">> = {}): TurnJournalRecord {
    const record = this.db.transitionToolInvocation({ invocationId, status, ...patch });
    return this.toJournalRecord(record);
  }

  override get(invocationId: string): TurnJournalRecord | undefined {
    const record = this.db.getToolInvocation(invocationId);
    return record ? this.toJournalRecord(record) : undefined;
  }

  override findByIdempotencyKey(idempotencyKey: string): TurnJournalRecord | undefined {
    const record = this.db.getToolInvocation(idempotencyKey);
    return record ? this.toJournalRecord(record) : undefined;
  }

  override list(): TurnJournalRecord[] {
    return this.db.listToolInvocations(this.durableTurnId).map((record) => this.toJournalRecord(record));
  }

  override snapshot(turnId = this.durableTurnId, capturedAt = new Date().toISOString()): TurnJournalSnapshot {
    const entries = this.list().map((record) => Object.freeze({ ...record }));
    return Object.freeze({ turnId, version: entries.length, nextSequence: entries.length, entries: Object.freeze(entries), capturedAt: new Date(capturedAt).toISOString() });
  }

  private toJournalRecord(record: import("./session-db").ToolInvocationRecord): TurnJournalRecord {
    return {
      invocationId: record.invocationId,
      sequence: record.sequence,
      idempotencyKey: record.idempotencyKey,
      runId: record.runId,
      toolCallId: record.toolCallId,
      name: record.name,
      inputHash: record.inputHash,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.approvalId ? { approvalId: record.approvalId } : {}),
      ...(record.result !== undefined ? { result: record.result as Record<string, unknown> } : {}),
      ...(record.summary ? { summary: record.summary } : {}),
      ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    };
  }
}
