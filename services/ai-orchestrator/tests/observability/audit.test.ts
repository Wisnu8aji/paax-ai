import { describe, expect, it } from "vitest";
import { SessionDB } from "../../src/state/session-db";
import { SanitizedAuditSink } from "../../src/observability/audit";

describe("sanitized audit sink", () => {
  it("persists bounded redacted lifecycle metadata and reopens from SQLite", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 32_000, maxEventBytes: 32_000, busyTimeoutMs: 100 });
    const exported: unknown[] = [];
    const sink = new SanitizedAuditSink({ db, exporter: async (event) => { exported.push(event); } });
    await sink.record({ type: "approval.rejected", tenantId: "tenant-a", sessionId: "session-a", runId: "run-a", metadata: { reason: "authorization: Bearer audit-secret", content: "raw prompt", nested: { apiKey: "hidden" } } });
    const records = db.listAudit({ tenantId: "tenant-a" });
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain("audit-secret");
    expect(JSON.stringify(records)).not.toContain("raw prompt");
    expect(JSON.stringify(exported)).not.toContain("hidden");
    db.close();
  });

  it("does not let exporter failure change the canonical operation and can fail closed on DB error", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 8_000, maxEventBytes: 8_000, busyTimeoutMs: 100 });
    const sink = new SanitizedAuditSink({ db, exporter: async () => { throw new Error("exporter secret"); } });
    await expect(sink.record({ type: "turn.completed", metadata: { status: "completed" } })).resolves.toBeUndefined();
    db.close();
    const failClosed = new SanitizedAuditSink({ db, failClosed: true });
    await expect(failClosed.record({ type: "security.blocked", metadata: { status: "blocked" } })).rejects.toThrow(/audit/i);
  });
});
