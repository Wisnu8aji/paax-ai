import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";
import { DurableWorkEventStore } from "../../src/state/work-events";

describe("DurableWorkEventStore", () => {
  it("appends before delivery and replays after a sequence without duplicates", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const session = db.createOrGetSession({ sessionId: "s-1", keyFingerprint: "fp-1", tenantId: "tenant-a", actorId: "actor-a", channel: "command_room", conversationId: "c-1" });
    const run = db.appendRun({ runId: "run-1", sessionId: session.sessionId, idempotencyKey: "run-1" });
    const store = new DurableWorkEventStore(db);
    const first = store.append({ runId: run.runId, sessionId: session.sessionId, sequence: 0, eventId: "run-1:0", type: "turn.started", payload: { phase: "starting" }, timestamp: "2026-08-18T00:00:00.000Z" });
    store.append({ runId: run.runId, sessionId: session.sessionId, sequence: 1, eventId: "run-1:1", type: "status.update", payload: { phase: "context" }, timestamp: "2026-08-18T00:00:01.000Z" });
    expect(store.append(first)).toEqual(first);
    expect(store.replay({ runId: run.runId, sessionId: session.sessionId, afterSequence: 0 })).toEqual([expect.objectContaining({ sequence: 1 })]);
    expect(() => store.replay({ runId: run.runId, sessionId: "other-session", afterSequence: 0 })).toThrow(/binding/i);
    db.close();
  });
});
