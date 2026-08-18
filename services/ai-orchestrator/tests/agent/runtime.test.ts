import { describe, expect, it, vi } from "vitest";
import { loadConfig, type ModelProfile } from "../../src/config";
import { InMemorySessionStore } from "../../src/gateway/session";
import { AIAgent, type AgentRuntimeEvent } from "../../src/agent/runtime";
import type { ToolDefinition } from "../../src/tools/types";

vi.mock("../../src/agent/prompt-builder", () => ({
  buildPrompt: vi.fn(() => ({
    version: "command-room-worker.phase2.v1",
    systemPrompt: "stable server prompt",
    stableText: "stable",
    contextText: "context",
    volatileText: "volatile",
    stableHash: "b".repeat(64),
    sectionSizes: { stable: 6, context: 7, volatile: 8 },
    injectionFindings: [],
  })),
}));

const profile: ModelProfile = {
  alias: "lucent",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  transport: "openai-compatible",
  requestStyle: "chat-completions",
  supportsThinking: true,
};

async function session() {
  return new InMemorySessionStore().resolve({
    channel: "command_room",
    tenantId: "tenant-1",
    actorId: "actor-1",
    conversationId: "conversation-1",
    projectId: "project-1",
  });
}

function dependencies(events: AgentRuntimeEvent[], transportCalls: { complete: number; stream: number }, tools: readonly ToolDefinition[] = []) {
  const config = loadConfig({
    PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }),
    PAAX_PROFILE: "review",
  });
  return {
    config,
    resolveProfile: (alias: string) => alias === profile.alias ? profile : undefined,
    tools,
    transport: {
      id: "test-transport",
      capabilities: new Set(["complete", "stream"]),
      async complete() { transportCalls.complete += 1; return { content: "must not be called" }; },
      async *stream() { transportCalls.stream += 1; yield { type: "delta" as const, delta: "must not be called" }; },
    },
    onEvent: (event: AgentRuntimeEvent) => events.push(event),
  };
}

describe("AIAgent preparation façade", () => {
  it("resolves the injected profile, preserves tools read-only, and emits deterministic lifecycle events", async () => {
    const events: AgentRuntimeEvent[] = [];
    const calls = { complete: 0, stream: 0 };
    const tool = { declaration: { name: "read_project" }, execute: vi.fn() } as unknown as ToolDefinition;
    const agent = new AIAgent(dependencies(events, calls, [tool]));
    const record = await session();

    expect(agent.lifecycle).toBe("created");
    const prepared = await agent.initializeTurn({
      runId: "run-1",
      session: record,
      messages: [{ role: "user", content: "Review the project" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    });

    expect(prepared.lifecycle).toBe("prepared");
    expect(prepared.profile).toEqual(profile);
    expect(prepared.tools).toHaveLength(1);
    expect(prepared.tools).not.toBe(dependencies([], calls, [tool]).tools);
    expect(events.map((event) => event.type)).toEqual(["created", "initialized", "prepared"]);
    expect(calls).toEqual({ complete: 0, stream: 0 });
    expect(JSON.stringify(events)).not.toContain("Review the project");
  });

  it("fails closed for an unknown profile and incompatible second initialization", async () => {
    const events: AgentRuntimeEvent[] = [];
    const calls = { complete: 0, stream: 0 };
    const agent = new AIAgent(dependencies(events, calls));
    const record = await session();

    await expect(agent.initializeTurn({
      runId: "run-1",
      session: record,
      messages: [{ role: "user", content: "first" }],
      modelAlias: "missing",
      reasoningEffort: "high",
      thinking: "on",
    })).rejects.toThrow(/profile/i);

    const ready = new AIAgent(dependencies([], calls));
    await ready.initializeTurn({
      runId: "run-1",
      session: record,
      messages: [{ role: "user", content: "first" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    });
    await expect(ready.initializeTurn({
      runId: "run-2",
      session: record,
      messages: [{ role: "user", content: "second" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    })).rejects.toThrow(/already initialized|lifecycle/i);
  });

  it("rejects thinking when the selected profile does not advertise the capability", async () => {
    const events: AgentRuntimeEvent[] = [];
    const calls = { complete: 0, stream: 0 };
    const noThinking = { ...profile, alias: "plain", supportsThinking: false };
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ plain: noThinking }) });
    const agent = new AIAgent({
      ...dependencies(events, calls),
      config,
      resolveProfile: (alias: string) => alias === "plain" ? noThinking : undefined,
    });
    const record = await session();

    await expect(agent.initializeTurn({
      runId: "run-1",
      session: record,
      messages: [{ role: "user", content: "think" }],
      modelAlias: "plain",
      reasoningEffort: "high",
      thinking: "on",
    })).rejects.toThrow(/thinking/i);
  });

  it("filters scoped tool metadata without creating a second registry", async () => {
    const calls = { complete: 0, stream: 0 };
    const allowed = { declaration: { name: "read" }, scope: "project:read", execute: vi.fn() } as unknown as ToolDefinition;
    const denied = { declaration: { name: "write" }, scope: "project:write", execute: vi.fn() } as unknown as ToolDefinition;
    const agent = new AIAgent({ ...dependencies([], calls, [allowed, denied]), allowedToolScopes: ["project:read"] });
    const record = await session();

    const prepared = await agent.initializeTurn({
      runId: "run-scoped",
      session: record,
      messages: [{ role: "user", content: "read" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    });
    expect(prepared.tools.map((tool) => tool.declaration.name)).toEqual(["read"]);
  });

  it("fails closed on runtime history/capability limits", async () => {
    const events: AgentRuntimeEvent[] = [];
    const calls = { complete: 0, stream: 0 };
    const limitedProfile = { ...profile, reasoningEffortMap: { high: "high" } };
    const base = dependencies(events, calls);
    const limitedConfig = loadConfig({
      PAAX_GATEWAY_MAX_HISTORY_MESSAGES: "1",
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: limitedProfile }),
    });
    const agent = new AIAgent({
      ...base,
      config: limitedConfig,
      resolveProfile: (alias: string) => alias === "lucent" ? limitedProfile : undefined,
    });
    const record = await session();

    await expect(agent.initializeTurn({
      runId: "run-limit",
      session: record,
      messages: [{ role: "user", content: "one" }, { role: "assistant", content: "two" }],
      modelAlias: "lucent",
      reasoningEffort: "high",
      thinking: "on",
    })).rejects.toThrow(/history/i);
  });

  it("uses the canonical registry view for an injected toolset selection", async () => {
    const commandTool = { ...({ declaration: { name: "read_command" }, scope: "workspace:read", toolset: "command-room", execute: vi.fn() } as unknown as ToolDefinition), policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", scope: "workspace:read" } } as ToolDefinition;
    const domainTool = { ...({ declaration: { name: "read_domain" }, scope: "domain:read", toolset: "domain", execute: vi.fn() } as unknown as ToolDefinition), policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", scope: "domain:read" } } as ToolDefinition;
    const events: AgentRuntimeEvent[] = [];
    const calls = { complete: 0, stream: 0 };
    const agent = new AIAgent({
      ...dependencies(events, calls, [commandTool, domainTool]),
      toolSelection: { include: ["domain"], allowedScopes: ["domain:read"], maxTools: 10 },
    });
    const prepared = await agent.initializeTurn({ runId: "run-toolset", session: await session(), messages: [{ role: "user", content: "domain" }], modelAlias: "lucent", reasoningEffort: "high", thinking: "on" });

    expect(prepared.tools.map((tool) => tool.declaration.name)).toEqual(["read_domain"]);
  });
});
