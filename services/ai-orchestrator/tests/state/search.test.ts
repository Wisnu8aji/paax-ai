import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";

describe("SessionDB FTS search", () => {
  it("filters tenant/session scope in SQL and returns stable evidence", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const one = db.createOrGetSession({ sessionId: "s-a", keyFingerprint: "fp-a", tenantId: "tenant-a", actorId: "actor-a", channel: "command_room", conversationId: "c-a" });
    const two = db.createOrGetSession({ sessionId: "s-b", keyFingerprint: "fp-b", tenantId: "tenant-b", actorId: "actor-b", channel: "command_room", conversationId: "c-b" });
    db.appendMessages({ sessionId: one.sessionId, messages: [{ id: "m-a", role: "user", content: "foundation wall detail" }] });
    db.appendMessages({ sessionId: two.sessionId, messages: [{ id: "m-b", role: "user", content: "foundation wall detail" }] });
    db.putMemory({ tenantId: "tenant-a", sessionId: one.sessionId, kind: "semantic", key: "wall", value: "foundation wall detail", provenance: { source: "manual", sourceId: "evidence-a" }, evidenceRefs: ["evidence-a"] });

    expect(db.search({ query: "foundation OR wall", tenantId: "tenant-a", sessionId: one.sessionId })).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: "m-a", tenantId: "tenant-a" }),
      expect.objectContaining({ kind: "semantic", tenantId: "tenant-a" }),
    ]));
    expect(db.search({ query: "foundation OR wall", tenantId: "tenant-a", sessionId: one.sessionId }).every((item) => item.tenantId === "tenant-a" && item.sessionId === one.sessionId)).toBe(true);
    expect(db.search({ query: "foundation wall", tenantId: "tenant-b" }).map((item) => item.recordId)).toEqual(["m-b"]);
    expect(() => db.search({ query: '" OR *', tenantId: "tenant-a" })).toThrow(/query/i);
    db.close();
  });

  it("marks superseded memory as inactive for recall", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const old = db.putMemory({ tenantId: "tenant-a", kind: "semantic", key: "risk", value: "old risk", provenance: { source: "manual" }, evidenceRefs: [] });
    const newer = db.putMemory({ tenantId: "tenant-a", kind: "semantic", key: "risk", value: "new risk", provenance: { source: "manual" }, evidenceRefs: [], supersedesId: old.id });
    expect(db.listMemory({ tenantId: "tenant-a", includeSuperseded: false })).toEqual([expect.objectContaining({ id: newer.id, status: "active" })]);
    expect(db.listMemory({ tenantId: "tenant-a", includeSuperseded: true })).toEqual(expect.arrayContaining([expect.objectContaining({ id: old.id, status: "superseded" })]));
    db.close();
  });
});
