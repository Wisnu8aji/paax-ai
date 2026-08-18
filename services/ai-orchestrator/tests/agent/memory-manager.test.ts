import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";
import { MemoryManager } from "../../src/agent/memory-manager";

describe("durable MemoryManager", () => {
  it("keeps proposal separate from explicit commit and preserves provenance/scope", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const manager = new MemoryManager(db);
    const proposal = manager.propose({ tenantId: "tenant-a", projectId: "project-1", sessionId: "session-a", kind: "semantic", key: "working-mode", value: "review first", provenance: { source: "agent", sourceId: "message-1", model: "fake" }, evidenceRefs: ["message-1"], confidence: 0.9 });
    expect(db.listMemory({ tenantId: "tenant-a", sessionId: "session-a" })).toHaveLength(0);
    const record = manager.commit(proposal);
    expect(record).toMatchObject({ value: "review first", status: "active", tenantId: "tenant-a" });
    expect(manager.recall({ tenantId: "tenant-a", sessionId: "session-a", query: "review" })).toMatchObject({ status: "matched", records: [expect.objectContaining({ id: record.id, evidenceRefs: ["message-1"] })] });
    expect(manager.recall({ tenantId: "tenant-b", sessionId: "session-a", query: "review" }).records).toHaveLength(0);
    db.close();
  });

  it("supersedes prior memory and redacts secret-like values", () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const manager = new MemoryManager(db);
    const first = manager.commit(manager.propose({ tenantId: "tenant-a", kind: "review", key: "note", value: "old", provenance: { source: "manual" }, evidenceRefs: [] }));
    const next = manager.supersede({ tenantId: "tenant-a", previousId: first.id, value: "new", provenance: { source: "manual", sourceId: "evidence-2" }, evidenceRefs: ["evidence-2"] });
    expect(next.status).toBe("active");
    expect(db.listMemory({ tenantId: "tenant-a", includeSuperseded: false })).toEqual([expect.objectContaining({ id: next.id })]);
    const secret = manager.commit(manager.propose({ tenantId: "tenant-a", kind: "semantic", key: "credential", value: "apiKey=FAKE_API_KEY_FOR_TEST_ONLY", provenance: { source: "agent" }, evidenceRefs: [] }));
    expect(secret.value).not.toContain("FAKE_API_KEY_FOR_TEST_ONLY");
    db.close();
  });
});
