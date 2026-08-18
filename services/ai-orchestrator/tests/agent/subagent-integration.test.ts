import { describe, expect, it } from "vitest";
import { AIAgent } from "../../src/agent/runtime";
import { loadConfig } from "../../src/config";
import { InMemorySessionStore } from "../../src/gateway/session";
import type { SubagentLifecycle } from "../../src/agent/subagent-lifecycle";

describe("canonical runtime sub-agent boundary", () => {
  it("binds a per-turn delegate tool to the parent run and session", async () => {
    const config = loadConfig({
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "test-provider", model: "test-model", transport: "openai-compatible", supportsThinking: true } }),
      PAAX_SUBAGENT_ENABLED: "1",
    });
    const session = await new InMemorySessionStore().resolve({
      channel: "command_room",
      tenantId: "tenant-a",
      actorId: "actor-a",
      conversationId: "conversation-a",
      projectId: "project-a",
    });
    const calls: Array<Record<string, unknown>> = [];
    const lifecycle: SubagentLifecycle = {
      guard: () => ({ allowed: true, code: "allowed" }),
      request: async (request) => {
        calls.push({ request });
        return { subagentId: "subagent-1", request, status: "queued", createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z" };
      },
      get: () => undefined,
      transition: async () => { throw new Error("unused"); },
      execute: async () => ({ status: "completed", summary: "bounded child", stopReason: "completed", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, evidenceRefs: [] }),
    };
    const agent = new AIAgent({
      config,
      resolveProfile: (alias) => config.modelProfiles[alias],
      tools: [],
      subagentFactory: (input) => {
        calls.push({ runId: input.runId, sessionId: input.session.sessionId, binding: input.binding });
        return lifecycle;
      },
    });

    const prepared = await agent.initializeTurn({
      runId: "run-parent",
      session,
      messages: [{ role: "user", content: "Delegate a bounded inspection" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    });
    const delegate = prepared.tools.find((tool) => tool.declaration.name === "delegate_task");
    expect(delegate).toBeDefined();
    await expect(delegate!.execute({ task: "Inspect only the approved scope", requested_scopes: [], requested_tools: [], idempotency_key: "delegate-1" })).resolves.toMatchObject({ available: true, executed: true, status: "completed" });
    expect(calls[0]).toMatchObject({ runId: "run-parent", sessionId: session.sessionId, binding: { tenantId: "tenant-a", projectId: "project-a", actorId: "actor-a", conversationId: "conversation-a" } });
    expect(calls[1]).toMatchObject({ request: { parentRunId: "run-parent", parentTurnId: "run-parent", bindingId: expect.any(String) } });
  });
});
