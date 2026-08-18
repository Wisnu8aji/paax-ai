import { describe, expect, it } from "vitest";
import {
  canonicalSessionKey,
  InMemorySessionStore,
  SessionBindingError,
  SqliteSessionStore,
  type SessionSource,
} from "../../src/gateway/session";
import { SessionDB } from "../../src/state/session-db";

const source: SessionSource = {
  channel: "command_room",
  tenantId: "tenant-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  projectId: "project-1",
  threadId: "thread-1",
  workspaceId: "workspace-1",
  snapshotId: "snapshot-1",
  documentRevisionId: "revision-1",
};

describe("InMemorySessionStore", () => {
  it("reuses a deterministic record for the same normalized source", async () => {
    const store = new InMemorySessionStore();
    const first = await store.resolve({ ...source, conversationId: " conversation-1 " });
    const second = await store.resolve(source);

    expect(second).toEqual(first);
    expect(first.sessionId).toMatch(/^session-[0-9a-f]{64}$/);
    expect(first.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.source).toEqual(source);
  });

  it.each([
    "channel",
    "tenantId",
    "actorId",
    "projectId",
    "conversationId",
    "threadId",
    "workspaceId",
  ] as const)("isolates a changed %s", async (field) => {
    const store = new InMemorySessionStore();
    const first = await store.resolve(source);
    const changed = { ...source, [field]: field === "channel" ? "agent_runs" : `${source[field]}-other` } as SessionSource;
    const second = await store.resolve(changed);

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.keyFingerprint).not.toBe(first.keyFingerprint);
  });

  it("attaches a run only after binding checks and rejects a mismatch", async () => {
    const store = new InMemorySessionStore();
    const record = await store.resolve(source);
    const attached = await store.attachRun(record.sessionId, "run-1");

    expect(attached.lastRunId).toBe("run-1");
    await expect(store.assertBinding(record.sessionId, source)).resolves.toMatchObject({ lastRunId: "run-1" });
    await expect(store.assertBinding(record.sessionId, { ...source, projectId: "project-2" })).rejects.toMatchObject({ status: 409 });
    await expect(store.attachRun("missing-session", "run-2")).rejects.toBeInstanceOf(SessionBindingError);
  });

  it("keeps snapshot and document revision metadata out of the session identity key", () => {
    const withMetadata = canonicalSessionKey(source);
    const withoutMetadata = canonicalSessionKey({ ...source, snapshotId: undefined, documentRevisionId: undefined });

    expect(withMetadata).toBe(withoutMetadata);
  });
});

describe("SqliteSessionStore", () => {
  it("reopens the same durable session and rejects cross-binding access", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 8_000, maxEventBytes: 8_000, busyTimeoutMs: 100 });
    const store = new SqliteSessionStore(db);
    const first = await store.resolve(source);
    await store.attachRun(first.sessionId, "run-1");
    const reopened = new SqliteSessionStore(db);
    await expect(reopened.get(first.sessionId)).resolves.toMatchObject({ sessionId: first.sessionId, lastRunId: "run-1" });
    await expect(reopened.assertBinding(first.sessionId, { ...source, tenantId: "tenant-b" })).rejects.toMatchObject({ status: 409 });
    db.close();
  });
});
