import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";
import { ContextEngine } from "../../src/agent/context-engine";
import type { SessionRecord } from "../../src/gateway/session";

const session: SessionRecord = {
  sessionId: "session-a",
  keyFingerprint: "fingerprint-a",
  source: { channel: "command_room", tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-a", projectId: "project-a" },
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("ContextEngine", () => {
  it("merges scoped durable history and memory with a bounded receipt", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    db.createOrGetSession({ sessionId: session.sessionId, keyFingerprint: session.keyFingerprint, ...session.source });
    db.appendMessages({ sessionId: session.sessionId, messages: [{ id: "m-1", role: "user", content: "review foundation" }, { id: "m-2", role: "assistant", content: "foundation reviewed" }] });
    db.putMemory({ tenantId: "tenant-a", projectId: "project-a", sessionId: session.sessionId, kind: "semantic", key: "focus", value: "foundation review", provenance: { source: "manual", sourceId: "evidence-1" }, evidenceRefs: ["evidence-1"] });
    const engine = new ContextEngine({ db, maxMessages: 10 });
    const result = engine.build({ session, messages: [{ role: "user", content: "review foundation" }], maxChars: 500 });
    expect(result.receipt.tokenEstimate).toBeGreaterThan(0);
    expect(result.receipt.sourceIds).toEqual(expect.arrayContaining(["m-1", "m-2"]));
    expect(result.snippets.some((snippet) => snippet.text.includes("foundation review"))).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(500);
    db.close();
  });

  it("returns manual fallback for optional retrieval failure without leaking another tenant", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const engine = new ContextEngine({ db, maxMessages: 10 });
    db.close();
    const result = engine.build({ session, messages: [{ role: "user", content: "current intent" }], maxChars: 128 });
    expect(result.receipt.failures.length).toBeGreaterThan(0);
    expect(result.text).toContain("current intent");
    expect(result.text).not.toContain("tenant-b");
  });
});
