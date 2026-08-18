import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { AIAgent } from "../../src/agent/runtime";
import { ApprovalService } from "../../src/agentic/approval-service";
import { createApp } from "../../src/index";
import { InMemorySessionStore } from "../../src/gateway/session";
import type { ProviderRequest } from "../../src/providers/base";

const originalTesting = process.env.TESTING;
const originalKey = process.env.INTERNAL_SERVICE_KEY;
const originalTenant = process.env.PAAX_TENANT_ID;
const originalCompat = process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT;

afterEach(() => {
  if (originalTesting === undefined) delete process.env.TESTING; else process.env.TESTING = originalTesting;
  if (originalKey === undefined) delete process.env.INTERNAL_SERVICE_KEY; else process.env.INTERNAL_SERVICE_KEY = originalKey;
  if (originalTenant === undefined) delete process.env.PAAX_TENANT_ID; else process.env.PAAX_TENANT_ID = originalTenant;
  if (originalCompat === undefined) delete process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT; else process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = originalCompat;
});

describe("canonical Command Room service stream", () => {
  it("runs the service loop and emits the exact WorkEvent envelope", async () => {
    process.env.TESTING = "1";
    process.env.INTERNAL_SERVICE_KEY = "stream-test-key";
    process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = "1";
    process.env.PAAX_TENANT_ID = "tenant-stream";
    const config = loadConfig({
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", requestStyle: "chat-completions", supportsThinking: true } }),
    });
    const sessionStore = new InMemorySessionStore();
    const approvals = new ApprovalService();
    let providerCalls = 0;
    let providerRequest: ProviderRequest | undefined;
    const app = createApp({
      config,
      sessionStore,
      gateway: {
        config,
        sessionStore,
        approvalService: approvals,
        createAgent: () => new AIAgent({
          config,
          resolveProfile: (alias) => config.modelProfiles[alias],
          tools: [],
          approvalService: approvals,
          transportFactory: () => ({
            id: "fake-stream-provider",
            capabilities: new Set(["complete"]),
            async complete(request) { providerCalls += 1; providerRequest = request; return { content: "Jawaban service", finishReason: "stop" }; },
            async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
          }),
        }),
      },
    });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/gateway/command-room/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": "stream-test-key", "X-User-Id": "actor-stream" },
        body: JSON.stringify({ mode: "work", session: { channel: "command_room", conversationId: "conversation-stream" }, messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" }),
      });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
      expect(body).toContain("event: message\n");
      const events = body.split("\n\n").filter(Boolean).map((frame) => JSON.parse(frame.split("data: ")[1]));
      expect(events.map((event) => event.type)).toEqual(["turn.started", "status.update", "status.update", "assistant.delta", "turn.completed"]);
      expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4]);
      expect(body).not.toContain("stable server prompt");
      expect(providerCalls).toBe(1);
      expect(providerRequest?.systemPrompt).not.toContain("tenant-stream");
      expect(providerRequest?.messages).toEqual([{ role: "user", content: "hello" }]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
