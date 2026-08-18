import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionDB, type CreateSessionInput } from "../../src/state/session-db";

const identity: CreateSessionInput = {
  sessionId: "session-1",
  keyFingerprint: "fingerprint-1",
  tenantId: "tenant-a",
  actorId: "actor-a",
  channel: "command_room",
  conversationId: "conversation-1",
  projectId: "project-1",
  threadId: "thread-1",
};

describe("SQLite SessionDB", () => {
  it("persists state across close/reopen in one WAL database", () => {
    const root = mkdtempSync(join(tmpdir(), "paax-session-db-"));
    const filename = join(root, "session.db");
    const first = new SessionDB({ filename, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 500 });
    const session = first.createOrGetSession(identity);
    const message = first.appendMessages({ sessionId: session.sessionId, messages: [{ id: "message-1", role: "user", content: "Find the project context", idempotencyKey: "message-key" }] })[0];
    const run = first.appendRun({ runId: "run-1", sessionId: session.sessionId, idempotencyKey: "run-key" });
    const memory = first.putMemory({ tenantId: "tenant-a", projectId: "project-1", sessionId: session.sessionId, kind: "semantic", key: "preference", value: "Use scoped context", provenance: { source: "test", sourceId: "source-1" }, evidenceRefs: [message.id] });
    const lineage = first.recordLineage({ relation: "branch", parentId: session.sessionId, childId: run.runId, metadata: { source: "test" } });
    const event = first.appendWorkEvent({ runId: run.runId, sequence: 0, eventId: "run-1:0", type: "turn.started", payload: { phase: "starting", apiKey: "FAKE_API_KEY_FOR_TEST_ONLY" }, timestamp: "2026-08-18T00:00:00.000Z" });
    first.recordAudit({ tenantId: "tenant-a", sessionId: session.sessionId, runId: run.runId, type: "state.created", metadata: { secret: "FAKE_API_KEY_FOR_TEST_ONLY" }, createdAt: "2026-08-18T00:00:00.000Z" });
    first.close();

    const reopened = new SessionDB({ filename, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 500 });
    expect(reopened.health()).toMatchObject({ schemaVersion: 1, foreignKeys: true, fts5: true, journalMode: "wal" });
    expect(reopened.getSession(session.sessionId)).toMatchObject({ sessionId: session.sessionId, tenantId: "tenant-a" });
    expect(reopened.loadMessages({ sessionId: session.sessionId })).toEqual([expect.objectContaining({ id: message.id, content: "Find the project context" })]);
    expect(reopened.getRun(run.runId)).toMatchObject({ runId: run.runId, status: "queued" });
    expect(reopened.listMemory({ tenantId: "tenant-a", sessionId: session.sessionId })).toEqual([expect.objectContaining({ id: memory.id, value: "Use scoped context" })]);
    expect(reopened.getLineage(lineage.id)).toMatchObject({ relation: "branch" });
    expect(reopened.readWorkEvents({ runId: run.runId })).toEqual([expect.objectContaining({ eventId: event.eventId, payload: { phase: "starting", apiKey: "[REDACTED]" } })]);
    expect(JSON.stringify(reopened.listAudit({ tenantId: "tenant-a" }))).not.toContain("FAKE_API_KEY_FOR_TEST_ONLY");
    reopened.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("replays exact idempotency and rejects conflicting sequence/payload", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 8_000, maxEventBytes: 8_000, busyTimeoutMs: 100 });
    const session = db.createOrGetSession(identity);
    const first = db.appendRun({ runId: "run-2", sessionId: session.sessionId, idempotencyKey: "same" });
    const replay = db.appendRun({ runId: "run-2", sessionId: session.sessionId, idempotencyKey: "same" });
    expect(replay).toEqual(first);
    expect(() => db.appendRun({ runId: "run-3", sessionId: session.sessionId, idempotencyKey: "same" })).toThrow(/idempotency/i);
    const event = db.appendWorkEvent({ runId: first.runId, sequence: 1, eventId: "run-2:1", type: "status.update", payload: { phase: "one" }, timestamp: "2026-08-18T00:00:00.000Z" });
    expect(db.appendWorkEvent({ runId: first.runId, sequence: 1, eventId: event.eventId, type: event.type, payload: { phase: "one" }, timestamp: event.timestamp })).toEqual(event);
    expect(() => db.appendWorkEvent({ runId: first.runId, sequence: 1, eventId: event.eventId, type: event.type, payload: { phase: "different" }, timestamp: event.timestamp })).toThrow(/sequence|conflict/i);
    db.close();
  });

  it("rolls back a multi-message append when one item is invalid", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 8_000, maxEventBytes: 8_000, busyTimeoutMs: 100 });
    const session = db.createOrGetSession(identity);
    expect(() => db.appendMessages({ sessionId: session.sessionId, messages: [{ role: "user", content: "kept" }, { role: "invalid" as never, content: "bad" }] })).toThrow(/role/i);
    expect(db.loadMessages({ sessionId: session.sessionId })).toHaveLength(0);
    db.close();
  });

  it("keeps mature agent-run state in the same SessionDB with optimistic versioning", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 8_000, maxEventBytes: 8_000, busyTimeoutMs: 100 });
    const state = { runId: "mature-1", status: "queued", version: 0, createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", secret: "FAKE_API_KEY_FOR_TEST_ONLY" };
    db.createAgentRun(state);
    expect(db.getAgentRun("mature-1")).toMatchObject({ runId: "mature-1", secret: "[REDACTED]" });
    db.updateAgentRun({ runId: "mature-1", expectedVersion: 0, state: { ...state, status: "running", version: 1 } });
    expect(db.getAgentRun("mature-1")).toMatchObject({ status: "running", version: 1 });
    expect(() => db.updateAgentRun({ runId: "mature-1", expectedVersion: 0, state })).toThrow(/stale/i);
    expect(db.listAgentRuns()).toHaveLength(1);
    db.close();
  });
});
