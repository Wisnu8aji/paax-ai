import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";
import { DurableTurnJournal } from "../../src/state/turn-journal";

describe("DurableTurnJournal", () => {
  it("reopens queued invocation state and preserves terminal transition rules", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const journal = new DurableTurnJournal(db, "run-1", () => "2026-08-18T00:00:00.000Z");
    const started = journal.beginExecution({ turnId: "run-1", invocationId: "invocation-1", idempotencyKey: "key-1", runId: "run-1", toolCallId: "call-1", name: "tool", inputHash: "hash-1" });
    expect(started.kind).toBe("started");
    if (started.kind !== "started") throw new Error("expected started");
    journal.transition(started.record.invocationId, "running");
    journal.transition(started.record.invocationId, "completed", { result: { ok: true }, summary: "done" });
    const reopened = new DurableTurnJournal(db, "run-1", () => "2026-08-18T00:00:00.000Z");
    expect(reopened.get(started.record.invocationId)).toMatchObject({ status: "completed", result: { ok: true } });
    expect(reopened.beginExecution({ turnId: "run-1", invocationId: "invocation-1", idempotencyKey: "key-1", runId: "run-1", toolCallId: "call-1", name: "tool", inputHash: "hash-1" })).toMatchObject({ kind: "replay" });
    expect(() => reopened.transition(started.record.invocationId, "running")).toThrow(/transition/i);
    db.close();
  });
});
