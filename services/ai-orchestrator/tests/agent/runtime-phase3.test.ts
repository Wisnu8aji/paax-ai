import { describe, expect, it, vi } from "vitest";
import { loadConfig, type ModelProfile } from "../../src/config";
import { AIAgent } from "../../src/agent/runtime";
import { InMemorySessionStore } from "../../src/gateway/session";
import type { ProviderTransport } from "../../src/providers/base";
import type { ToolDefinition } from "../../src/tools/types";
import { finalizeTurn } from "../../src/agent/turn-finalizer";
import { TurnJournal } from "../../src/agent/turn-state";
import type { LoopHookContext } from "../../src/agent/loop-hooks";
import type { ContextFileSnapshot } from "../../src/agent/context-files";

const profile: ModelProfile = { alias: "lucent", provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", requestStyle: "chat-completions", supportsThinking: true };
const readTool: ToolDefinition = {
  declaration: { name: "read", description: "read", parameters: { type: "OBJECT", properties: {} } },
  policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe" },
  execute: async () => ({ ok: true }),
};

async function session() {
  return new InMemorySessionStore().resolve({ channel: "command_room", tenantId: "tenant-1", actorId: "actor-1", conversationId: "conversation-1", projectId: "project-1" });
}

describe("AIAgent canonical Phase 3 execution", () => {
  it("builds TurnContext during preparation and runs exactly one injected canonical loop", async () => {
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }), PAAX_GATEWAY_MAX_ITERATIONS: "2" });
    let calls = 0;
    const transport: ProviderTransport = {
      id: "fake-canonical",
      capabilities: new Set(["complete"]),
      async complete() { calls += 1; return { content: "Jawaban final", finishReason: "stop" }; },
      async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
    };
    const agent = new AIAgent({ config, resolveProfile: (alias) => alias === "lucent" ? profile : undefined, tools: [readTool], transportFactory: () => transport });
    const prepared = await agent.initializeTurn({ runId: "run-1", session: await session(), messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });
    expect(prepared.context.snapshot().internal.tenantId).toBe("tenant-1");
    expect(prepared.context.snapshot().prompt.systemPrompt).not.toContain("tenant-1");

    const result = await agent.runPreparedTurn(prepared, new AbortController().signal);
    expect(result).toMatchObject({ status: "completed", content: "Jawaban final" });
    expect(calls).toBe(1);
  });

  it("finalizes a canonical turn exactly once and observes usage after envelope creation", async () => {
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }), PAAX_GATEWAY_MAX_ITERATIONS: "2" });
    const transport: ProviderTransport = {
      id: "fake-finalizer",
      capabilities: new Set(["complete"]),
      async complete() { return { content: "finalized answer", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }; },
      async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
    };
    const finalizer = vi.fn((input) => finalizeTurn(input));
    const usages: unknown[] = [];
    const agent = new AIAgent({
      config,
      resolveProfile: (alias) => alias === "lucent" ? profile : undefined,
      tools: [readTool],
      transportFactory: () => transport,
      journalFactory: () => new TurnJournal(),
      finalizer,
      onUsage: (usage) => { usages.push(usage); },
    });
    const prepared = await agent.initializeTurn({ runId: "run-finalizer", session: await session(), messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });

    const result = await agent.runPreparedTurn(prepared, new AbortController().signal);

    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(result.envelope).toMatchObject({ protocol: "command-room.turn-result.v1", status: "completed", partial: false, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } });
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
  });

  it("isolates runtime observation failures from final turn authority", async () => {
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }) });
    const transport: ProviderTransport = {
      id: "fake-observer",
      capabilities: new Set(["complete"]),
      async complete() { return { content: "observed", finishReason: "stop" }; },
      async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
    };
    const observed: string[] = [];
    const agent = new AIAgent({
      config,
      resolveProfile: (alias) => alias === "lucent" ? profile : undefined,
      tools: [readTool],
      transportFactory: () => transport,
      observation: {
        onTurnStarted: () => { observed.push("started"); throw new Error("metrics unavailable"); },
        onTurnFinalized: () => { observed.push("finalized"); return Promise.reject(new Error("metrics unavailable")); },
      },
    });
    const prepared = await agent.initializeTurn({ runId: "run-observer", session: await session(), messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });

    const result = await agent.runPreparedTurn(prepared, new AbortController().signal);

    expect(result.envelope.status).toBe("completed");
    expect(observed).toEqual(["started", "finalized"]);
  });

  it("injects formal loop hooks into the canonical runtime and observes bounded stages", async () => {
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }) });
    const stages: string[] = [];
    const observed: LoopHookContext[] = [];
    const transport: ProviderTransport = {
      id: "formal-hooks-runtime",
      capabilities: new Set(["complete"]),
      async complete() { return { content: "formal runtime", finishReason: "stop" }; },
      async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
    };
    const agent = new AIAgent({
      config,
      resolveProfile: (alias) => alias === "lucent" ? profile : undefined,
      tools: [readTool],
      transportFactory: () => transport,
      loopHooks: [{ name: "runtime-test", stages: ["before_model"], onStage: (value) => { stages.push(value.stage); } }],
      observation: { onLoop: (value) => { observed.push(value); } },
    });
    const prepared = await agent.initializeTurn({ runId: "run-formal", session: await session(), messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });

    const result = await agent.runPreparedTurn(prepared, new AbortController().signal);

    expect(result.envelope.status).toBe("completed");
    expect(stages).toEqual(["before_model"]);
    expect(observed.map((value) => value.stage)).toEqual(["turn_started", "before_model", "after_model", "turn_finalized"]);
    expect(observed.every((value) => value.runId === "run-formal" && value.turnId === "run-formal")).toBe(true);
  });

  it("loads bounded context files through the injected source and preserves only file references in TurnContext", async () => {
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }) });
    const snapshot: ContextFileSnapshot = {
      entries: [{
        relativePath: "AGENTS.md",
        class: "stable",
        content: "project context",
        bytes: 15,
        sha256: "a".repeat(64),
        trusted: false,
        injectionFindings: [],
      }],
      stableHash: "b".repeat(64),
      totalBytes: 15,
      omitted: [],
    };
    const load = vi.fn(async (input: { root: string; maxFileBytes: number; maxTotalBytes: number }) => {
      expect(input.root).toBe("D:/explicit-context-root");
      return snapshot;
    });
    const agent = new AIAgent({
      config,
      resolveProfile: (alias) => alias === "lucent" ? profile : undefined,
      tools: [readTool],
      contextFileLoader: { load },
      contextFileRoot: "D:/explicit-context-root",
      transportFactory: () => ({
        id: "context-loader-runtime",
        capabilities: new Set(["complete"]),
        async complete() { return { content: "context loaded", finishReason: "stop" }; },
        async *stream() { yield { type: "completed" as const, completion: { content: "unused", finishReason: "stop" } }; },
      }),
    });

    const prepared = await agent.initializeTurn({ runId: "run-context-loader", session: await session(), messages: [{ role: "user", content: "hello" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });

    expect(load).toHaveBeenCalledTimes(1);
    expect(prepared.prompt.stableText).toContain("AGENTS.md");
    expect(prepared.context.snapshot().contextFileRefs).toEqual([{ relativePath: "AGENTS.md", class: "stable", sha256: "a".repeat(64), bytes: 15 }]);
  });
});
