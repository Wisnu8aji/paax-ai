import { describe, expect, it } from "vitest";
import { createSessionManager } from "../../src/gateway/session-manager";
import { InMemorySessionStore } from "../../src/gateway/session";

describe("PAAX Session Manager (paax-session)", () => {
  it("resumes an existing session correctly", async () => {
    const store = new InMemorySessionStore();
    const session = await store.resolve({
      channel: "command_room",
      tenantId: "tenant-1",
      actorId: "actor-1",
      conversationId: "conv-1",
    });

    const manager = createSessionManager(store);
    const resume = await manager.resumeSession(session.sessionId);

    expect(resume.canResume).toBe(true);
    expect(resume.session.sessionId).toBe(session.sessionId);
  });

  it("creates an archival snapshot manifest of a session", async () => {
    const store = new InMemorySessionStore();
    const session = await store.resolve({
      channel: "command_room",
      tenantId: "tenant-1",
      actorId: "actor-1",
      conversationId: "conv-2",
    });

    const manager = createSessionManager(store);
    const archive = await manager.archiveSession(session.sessionId);

    expect(archive.archiveId).toBeDefined();
    expect(archive.sessionId).toBe(session.sessionId);
    expect(archive.data.session.keyFingerprint).toBe(session.keyFingerprint);
  });
});
