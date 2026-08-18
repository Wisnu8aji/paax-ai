import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { AIAgent } from "../../src/agent/runtime";
import { AgentRunStore } from "../../src/agentic/runtime-store";
import { createApp } from "../../src/index";
import { InMemorySessionStore } from "../../src/gateway/session";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const runStorePath = resolve(process.cwd(), ".test-data/command-room-gateway-integration.json");
const originalTesting = process.env.TESTING;
const originalTenant = process.env.PAAX_TENANT_ID;
const originalLegacyCompat = process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT;
const originalInternalKey = process.env.INTERNAL_SERVICE_KEY;

afterEach(async () => {
  if (originalTesting === undefined) delete process.env.TESTING;
  else process.env.TESTING = originalTesting;
  if (originalTenant === undefined) delete process.env.PAAX_TENANT_ID;
  else process.env.PAAX_TENANT_ID = originalTenant;
  if (originalLegacyCompat === undefined) delete process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT;
  else process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = originalLegacyCompat;
  if (originalInternalKey === undefined) delete process.env.INTERNAL_SERVICE_KEY;
  else process.env.INTERNAL_SERVICE_KEY = originalInternalKey;
  await rm(runStorePath, { force: true });
});

describe("Command Room gateway app integration", () => {
  it("prepares through auth/session/runtime/prompt, fails closed, and preserves agent-runs", async () => {
    process.env.TESTING = "1";
    process.env.PAAX_TENANT_ID = "tenant-integration";
    process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = "1";
    process.env.INTERNAL_SERVICE_KEY = "integration-internal-key";
    const config = loadConfig({
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({
        lucent: {
          provider: "test-provider",
          model: "test-model",
          transport: "openai-compatible",
          supportsThinking: true,
        },
      }),
      PAAX_RUNTIME_HOME: resolve(process.cwd(), ".test-data/runtime-integration"),
    });
    const sessionStore = new InMemorySessionStore();
    const providerCalls = { complete: 0, stream: 0 };
    const agentRunStore = new AgentRunStore(runStorePath);
    const app = createApp({
      config,
      sessionStore,
      agentRunStore,
      gateway: {
        config,
        sessionStore,
        createAgent: () => new AIAgent({
          config,
          resolveProfile: (alias) => config.modelProfiles[alias],
          tools: [],
          transport: {
            id: "integration-transport",
            capabilities: new Set(["complete", "stream"]),
            async complete() { providerCalls.complete += 1; return { content: "not called" }; },
            async *stream() { providerCalls.stream += 1; yield { type: "delta" as const, delta: "not called" }; },
          },
          now: () => "2026-08-17T00:00:00.000Z",
        }),
        findRunBinding: async (runId) => runId === "attached-run" ? {
          tenantId: "tenant-integration",
          projectId: "project-original",
          actorId: "actor-integration",
          conversationId: "conversation-1",
          allowedToolScopes: [],
          issuedAt: "2026-08-17T00:00:00.000Z",
        } : null,
        now: () => "2026-08-17T00:00:00.000Z",
      },
    });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Key": "integration-internal-key",
      "X-User-Id": "actor-integration",
    };
    const body = {
      mode: "work",
      runId: "fresh-run",
      session: { channel: "command_room", conversationId: "conversation-1", projectId: "project-1" },
      messages: [{ role: "user", content: "Review project evidence" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    };

    try {
      const prepared = await fetch(`http://127.0.0.1:${port}/gateway/command-room/turn/prepare`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      expect(prepared.status).toBe(200);
      const json = await prepared.json();
      expect(json.protocolVersion).toBe("command-room.gateway.v1");
      expect(json.sessionId).toMatch(/^session-[0-9a-f]{64}$/);
      expect(json.sessionKeyFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(json.profile).toMatchObject({ alias: "lucent", model: "test-model" });
      expect(json.prompt.sectionSizes).toEqual({ stable: expect.any(Number), context: expect.any(Number), volatile: expect.any(Number) });
      expect(json.handoff).toBe("service-conversation-loop");
      expect(json.prompt.systemPrompt).toBeUndefined();
      expect(providerCalls).toEqual({ complete: 0, stream: 0 });

      const conflict = await fetch(`http://127.0.0.1:${port}/gateway/command-room/turn/prepare`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, runId: "attached-run", session: { ...body.session, projectId: "project-other" } }),
      });
      expect(conflict.status).toBe(409);

      const unknownProfile = await fetch(`http://127.0.0.1:${port}/gateway/command-room/turn/prepare`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, modelAlias: "missing" }),
      });
      expect(unknownProfile.status).toBe(503);

      const missingAuth = await fetch(`http://127.0.0.1:${port}/gateway/command-room/turn/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(missingAuth.status).toBe(401);

      const legacyRuns = await fetch(`http://127.0.0.1:${port}/agent-runs`, { headers });
      expect(legacyRuns.status).toBe(200);
      expect(await legacyRuns.json()).toEqual([]);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});
