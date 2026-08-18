import { describe, expect, it } from "vitest";
import { TurnJournal, TurnJournalConflictError, hashToolInput } from "../../src/agent/turn-state";

describe("in-memory TurnJournal", () => {
  it("records queued state before a handler can run and enforces legal transitions", () => {
    const journal = new TurnJournal();
    const queued = journal.enqueue({ runId: "run-1", toolCallId: "call-1", name: "file_read", inputHash: "hash-1" });
    expect(queued.record.status).toBe("queued");
    expect(journal.get(queued.record.invocationId)?.status).toBe("queued");

    journal.transition(queued.record.invocationId, "running");
    journal.transition(queued.record.invocationId, "completed", { result: { ok: true }, summary: "done" });
    expect(journal.get(queued.record.invocationId)).toMatchObject({ status: "completed", result: { ok: true }, summary: "done" });
    expect(() => journal.transition(queued.record.invocationId, "running")).toThrow(/transition/i);
  });

  it("replays identical idempotency keys and rejects input conflicts", () => {
    const journal = new TurnJournal();
    const first = journal.enqueue({ runId: "run-1", toolCallId: "call-1", name: "file_read", inputHash: "hash-1", idempotencyKey: "run-1:call-1" });
    const replay = journal.enqueue({ runId: "run-1", toolCallId: "call-1", name: "file_read", inputHash: "hash-1", idempotencyKey: "run-1:call-1" });
    expect(replay.replayed).toBe(true);
    expect(replay.record.invocationId).toBe(first.record.invocationId);

    expect(() => journal.enqueue({ runId: "run-1", toolCallId: "call-1", name: "file_read", inputHash: "hash-2", idempotencyKey: "run-1:call-1" })).toThrow(TurnJournalConflictError);
  });

  it("hashes object input deterministically without volatile timestamps", () => {
    expect(hashToolInput("run-1", "call-1", "tool", { b: 2, a: 1 })).toBe(hashToolInput("run-1", "call-1", "tool", { a: 1, b: 2 }));
    expect(hashToolInput("run-1", "call-1", "tool", { a: 1 })).not.toBe(hashToolInput("run-1", "call-1", "tool", { a: 2 }));
  });

  it("uses an atomic begin gate with replay/conflict outcomes and immutable snapshots", () => {
    const journal = new TurnJournal(() => Date.parse("2026-08-18T00:00:00.000Z"));
    const input = {
      turnId: "turn-1",
      invocationId: "invocation-1",
      idempotencyKey: "turn-1:call-1",
      runId: "run-1",
      toolCallId: "call-1",
      name: "file_read",
      inputHash: "hash-1",
    };

    const started = journal.beginExecution(input);
    expect(started.kind).toBe("started");
    if (started.kind !== "started") throw new Error("expected started result");
    expect(started.record).toMatchObject({ status: "queued", sequence: 0 });

    const replay = journal.beginExecution(input);
    expect(replay).toMatchObject({ kind: "replay", record: { invocationId: "invocation-1" } });
    const conflict = journal.beginExecution({ ...input, inputHash: "hash-2" });
    expect(conflict).toMatchObject({ kind: "conflict", existing: { invocationId: "invocation-1", inputHash: "hash-1" } });

    const snapshot = journal.snapshot();
    expect(snapshot).toMatchObject({ turnId: "turn-1", nextSequence: 1, entries: [{ sequence: 0, status: "queued" }] });
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    expect(journal.get("invocation-1")?.status).toBe("queued");
  });

  it("records aborted as a terminal state without allowing a second transition", () => {
    const journal = new TurnJournal();
    const started = journal.beginExecution({
      turnId: "turn-1",
      invocationId: "invocation-abort",
      idempotencyKey: "turn-1:abort",
      runId: "run-1",
      toolCallId: "abort",
      name: "tool",
      inputHash: "hash",
    });
    if (started.kind !== "started") throw new Error("expected started result");

    journal.transition(started.record.invocationId, "aborted", { errorCode: "aborted" });
    expect(journal.get(started.record.invocationId)).toMatchObject({ status: "aborted", errorCode: "aborted" });
    expect(() => journal.transition(started.record.invocationId, "running")).toThrow(/transition/i);
  });
});
