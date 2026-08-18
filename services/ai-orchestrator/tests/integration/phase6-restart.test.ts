import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../../src/index";
import { loadConfig } from "../../src/config";
import { AIAgent } from "../../src/agent/runtime";
import { SessionDB } from "../../src/state/session-db";
import { SqliteSessionStore } from "../../src/gateway/session";
import { ApprovalService } from "../../src/agentic/approval-service";

const originalEnv = {
  TESTING: process.env.TESTING,
  INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY,
  PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT: process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT,
  PAAX_TENANT_ID: process.env.PAAX_TENANT_ID,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function makeApp(config: ReturnType<typeof loadConfig>, db: SessionDB, providerCalls: { count: number }) {
  const sessionStore = new SqliteSessionStore(db);
  const approvals = new ApprovalService();
  return createApp({
    config,
    sessionDb: db,
    sessionStore,
    gateway: {
      config,
      sessionDb: db,
      sessionStore,
      approvalService: approvals,
      createAgent: () => new AIAgent({
        config,
        resolveProfile: (alias) => config.modelProfiles[alias],
        tools: [],
        approvalService: approvals,
        transport: {
          id: "phase6-restart-fake",
          capabilities: new Set(["complete"]),
          async complete() { providerCalls.count += 1; return { content: "restart-safe response", finishReason: "stop" }; },
          async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
        },
      }),
    },
  });
}

describe("Phase 6 durable restart path", () => {
  it("reopens one WAL SessionDB and reuses the bound session without rerunning the prior turn", async () => {
    process.env.TESTING = "1";
    process.env.INTERNAL_SERVICE_KEY = "phase6-test-key";
    process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = "1";
    process.env.PAAX_TENANT_ID = "tenant-restart";
    const root = mkdtempSync(join(tmpdir(), "paax-phase6-restart-"));
    const config = loadConfig({
      PAAX_RUNTIME_HOME: resolve(root),
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "test-provider", model: "test-model", transport: "openai-compatible", supportsThinking: true } }),
      PAAX_CRON_ENABLED: "0",
    });
    const source = { channel: "command_room" as const, tenantId: "tenant-restart", actorId: "actor-restart", conversationId: "conversation-restart", projectId: "project-restart" };
    const firstCalls = { count: 0 };
    const db1 = new SessionDB({ filename: join(root, "sessions", "session.db"), busyTimeoutMs: 100, maxJsonBytes: 32_000, maxEventBytes: 32_000 });
    const app1 = makeApp(config, db1, firstCalls);
    const server1 = app1.listen(0);
    const port1 = (server1.address() as { port: number }).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port1}/gateway/command-room/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": "phase6-test-key", "X-User-Id": "actor-restart" },
        body: JSON.stringify({ mode: "work", runId: "restart-run-1", session: { channel: "command_room", conversationId: source.conversationId, projectId: source.projectId }, messages: [{ role: "user", content: "first durable turn" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" }),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("turn.completed");
      expect(firstCalls.count).toBe(1);
      expect(db1.health()).toMatchObject({ journalMode: "wal", fts5: true });
      const firstSession = await new SqliteSessionStore(db1).resolve(source);
      expect(db1.getRun("restart-run-1")).toMatchObject({ sessionId: firstSession.sessionId, status: "completed" });
      expect(db1.readWorkEvents({ runId: "restart-run-1", sessionId: firstSession.sessionId })).not.toHaveLength(0);
      expect(db1.loadMessages({ sessionId: firstSession.sessionId, limit: 10 }).some((message) => message.content === "first durable turn")).toBe(true);
    } finally {
      await new Promise<void>((resolveClose) => server1.close(() => resolveClose()));
      await (app1 as typeof app1 & { locals: { paaxShutdown: () => Promise<void> } }).locals.paaxShutdown();
    }

    const secondCalls = { count: 0 };
    const db2 = new SessionDB({ filename: join(root, "sessions", "session.db"), busyTimeoutMs: 100, maxJsonBytes: 32_000, maxEventBytes: 32_000 });
    const app2 = makeApp(config, db2, secondCalls);
    const restored = await new SqliteSessionStore(db2).resolve(source);
    expect(restored.sessionId).toMatch(/^session-[0-9a-f]{64}$/);
    const server2 = app2.listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${(server2.address() as { port: number }).port}/gateway/command-room/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": "phase6-test-key", "X-User-Id": "actor-restart" },
        body: JSON.stringify({ mode: "work", runId: "restart-run-2", session: { channel: "command_room", conversationId: source.conversationId, projectId: source.projectId }, messages: [{ role: "user", content: "second durable turn" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" }),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("turn.completed");
      expect(secondCalls.count).toBe(1);
      expect((await new SqliteSessionStore(db2).resolve(source)).sessionId).toBe(restored.sessionId);
      expect(db2.loadMessages({ sessionId: restored.sessionId, limit: 20 }).filter((message) => message.role === "user")).toHaveLength(2);
    } finally {
      await new Promise<void>((resolveClose) => server2.close(() => resolveClose()));
      await (app2 as typeof app2 & { locals: { paaxShutdown: () => Promise<void> } }).locals.paaxShutdown();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
