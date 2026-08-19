import { describe, expect, it } from "vitest";
import { createSessionIndex } from "../../src/gateway/session-index";
import type { SessionRecord } from "../../src/gateway/session";

describe("PAAX Session Index (paax-session)", () => {
  const sampleSession: SessionRecord = {
    sessionId: "sess-123",
    keyFingerprint: "fingerprint-abc",
    source: {
      channel: "command_room",
      tenantId: "tenant-1",
      actorId: "actor-1",
      projectId: "project-1",
      conversationId: "conv-1",
    },
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T01:00:00.000Z",
  };

  it("appends and queries indexed sessions in-memory", async () => {
    const index = createSessionIndex();
    await index.append(sampleSession, "Initial consultation on AHSP");

    const entries = await index.list({ projectId: "project-1" });
    expect(entries.length).toBe(1);
    expect(entries[0].sessionId).toBe("sess-123");
    expect(entries[0].summary).toBe("Initial consultation on AHSP");
  });

  it("finds session entry by fingerprint and id", async () => {
    const index = createSessionIndex();
    await index.append(sampleSession);

    const byId = await index.findBySessionId("sess-123");
    expect(byId).toBeDefined();
    expect(byId?.keyFingerprint).toBe("fingerprint-abc");

    const byFingerprint = await index.findByFingerprint("fingerprint-abc");
    expect(byFingerprint).toBeDefined();
    expect(byFingerprint?.sessionId).toBe("sess-123");
  });
});
