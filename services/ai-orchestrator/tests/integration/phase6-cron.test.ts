import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/index";
import { loadConfig } from "../../src/config";
import { AIAgent } from "../../src/agent/runtime";
import { SessionDB } from "../../src/state/session-db";
import { SqliteSessionStore } from "../../src/gateway/session";

describe("Phase 6 durable cron composition", () => {
  it("claims one occurrence and invokes the canonical gateway runner once", async () => {
    const root = mkdtempSync(join(tmpdir(), "paax-phase6-cron-"));
    const config = loadConfig({
      PAAX_RUNTIME_HOME: root,
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "test-provider", model: "test-model", transport: "openai-compatible", supportsThinking: true } }),
      PAAX_CRON_ENABLED: "1",
      PAAX_CRON_TICK_MS: "3600000",
    });
    const db = new SessionDB({ filename: join(root, "sessions", "session.db"), busyTimeoutMs: 100, maxJsonBytes: 32_000, maxEventBytes: 32_000 });
    const sessionStore = new SqliteSessionStore(db);
    const session = await sessionStore.resolve({ channel: "command_room", tenantId: "tenant-cron", actorId: "actor-cron", conversationId: "conversation-cron", projectId: "project-cron" });
    const providerCalls = { count: 0 };
    const app = createApp({
      config,
      sessionDb: db,
      sessionStore,
      gateway: {
        config,
        sessionDb: db,
        sessionStore,
        createAgent: () => new AIAgent({
          config,
          resolveProfile: (alias) => config.modelProfiles[alias],
          tools: [],
          transport: {
            id: "cron-fake",
            capabilities: new Set(["complete"]),
            async complete() { providerCalls.count += 1; return { content: "cron response", finishReason: "stop" }; },
            async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
          },
        }),
      },
    });
    const locals = (app as typeof app & { locals: { paaxCronStore: { put: (job: unknown) => void }; paaxCronHost: { tick: (now: string) => Promise<readonly unknown[]> }; paaxShutdown: () => Promise<void> } }).locals;
    const scheduledAt = "2026-08-18T01:00:00.000Z";
    locals.paaxCronStore.put({ jobId: "cron-once", bindingId: "project-cron", tenantId: "tenant-cron", actorId: "actor-cron", sessionId: session.sessionId, schedule: { kind: "once", at: scheduledAt }, prompt: "Run the bounded background review", enabled: true, nextRunAt: scheduledAt, createdAt: scheduledAt, updatedAt: scheduledAt });
    try {
      const receipts = await locals.paaxCronHost.tick("2026-08-18T02:00:00.000Z");
      expect(receipts).toMatchObject([{ jobId: "cron-once", status: "dispatched", code: "due" }]);
      expect(providerCalls.count).toBe(1);
      expect(db.database.prepare("select status from cron_runs where job_id = ?").get("cron-once")).toMatchObject({ status: "completed" });
    } finally {
      await locals.paaxShutdown();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
