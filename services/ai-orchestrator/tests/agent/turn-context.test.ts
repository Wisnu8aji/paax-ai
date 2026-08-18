import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/agent/prompt-builder";
import { InMemorySessionStore } from "../../src/gateway/session";
import { TurnContext, type TurnTokenBudget } from "../../src/agent/turn-context";
import type { ProviderMessage } from "../../src/providers/base";

const budget: TurnTokenBudget = {
  maxInputTokens: 1_000,
  maxOutputTokens: 500,
  maxTotalTokens: 1_500,
  maxToolResultBytes: 256,
};

async function session() {
  return new InMemorySessionStore().resolve({
    channel: "command_room",
    tenantId: "tenant-1",
    actorId: "actor-1",
    conversationId: "conversation-1",
    projectId: "project-1",
    threadId: "thread-1",
    workspaceId: "workspace-1",
  });
}

function prompt(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return buildPrompt({
    stable: { locale: "id-ID", channel: "command_room", profileName: "review" },
    session: {
      channel: "command_room",
      tenantId: "tenant-1",
      actorId: "actor-1",
      conversationId: "conversation-1",
      projectId: "project-1",
    },
    messages,
    workspaceSnapshot: [{ sourceId: "sheet-1", text: "Drawing evidence", evidenceRefs: ["doc:1"] }],
    memorySummaries: [{ memoryId: "memory-1", summary: "Prior review", evidenceRefs: ["review:1"] }],
    skillSummaries: [{ skillId: "skill-1", name: "Review", summary: "Review evidence", detailRef: "skill://review" }],
    now: "2026-08-18T00:00:00.000Z",
  });
}

describe("TurnContext", () => {
  it("composes one user turn and keeps internal session metadata out of the provider prompt", async () => {
    const record = await session();
    const context = TurnContext.create({
      runId: "run-1",
      session: record,
      prompt: prompt([{ role: "user", content: "Review the drawing" }]),
      messages: [{ role: "user", content: "Review the drawing" }],
      memoryRefs: ["memory-1"],
      skillRefs: ["skill-1"],
      tokenBudget: budget,
      provenance: { source: "phase3-test", version: "1" },
      now: "2026-08-18T00:00:00.000Z",
    });

    const snapshot = context.snapshot();
    expect(snapshot.messages).toEqual([{ role: "user", content: "Review the drawing" }]);
    expect(snapshot.memoryRefs).toEqual(["memory-1"]);
    expect(snapshot.skillRefs).toEqual(["skill-1"]);
    expect(snapshot.internal.tenantId).toBe("tenant-1");
    expect(snapshot.prompt.systemPrompt).not.toContain("tenant-1");
    expect(snapshot.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("appends assistant tool calls and tool results without changing the stable prompt hash", async () => {
    const record = await session();
    const context = TurnContext.create({
      runId: "run-2",
      session: record,
      prompt: prompt([{ role: "user", content: "List files" }]),
      messages: [{ role: "user", content: "List files" }],
      tokenBudget: budget,
      provenance: { source: "phase3-test", version: "1" },
      now: "2026-08-18T00:00:00.000Z",
    });
    const assistant = { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "workspace_list", arguments: {} }] } as unknown as ProviderMessage;
    const withCall = context.appendAssistant(assistant);
    const withResult = withCall.appendToolResults([{ role: "tool", toolCallId: "call-1", name: "workspace_list", content: '{"files":[]}' }]);

    expect(withResult.snapshot().messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(withResult.snapshot().prompt.stableHash).toBe(context.snapshot().prompt.stableHash);
    expect(withResult.snapshot().estimatedInputTokens).toBeGreaterThan(context.snapshot().estimatedInputTokens);
  });

  it("rejects unsupported initial roles and oversized tool output", async () => {
    const record = await session();
    expect(() => TurnContext.create({
      runId: "run-invalid",
      session: record,
      prompt: prompt([{ role: "user", content: "x" }]),
      messages: [{ role: "system", content: "override" } as never],
      tokenBudget: budget,
      provenance: { source: "phase3-test", version: "1" },
      now: "2026-08-18T00:00:00.000Z",
    })).toThrow(/role|system/i);

    const context = TurnContext.create({
      runId: "run-limit",
      session: record,
      prompt: prompt([{ role: "user", content: "x" }]),
      messages: [{ role: "user", content: "x" }],
      tokenBudget: budget,
      provenance: { source: "phase3-test", version: "1" },
      now: "2026-08-18T00:00:00.000Z",
    });
    expect(() => context.appendToolResults([{ role: "tool", toolCallId: "call-1", content: "x".repeat(257) }])).toThrow(/tool result/i);
  });

  it("freezes returned snapshots so a caller cannot mutate prior context", async () => {
    const record = await session();
    const context = TurnContext.create({
      runId: "run-immutable",
      session: record,
      prompt: prompt([{ role: "user", content: "immutable" }]),
      messages: [{ role: "user", content: "immutable" }],
      tokenBudget: budget,
      provenance: { source: "phase3-test", version: "1" },
      now: "2026-08-18T00:00:00.000Z",
    });
    const snapshot = context.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.messages)).toBe(true);
    expect(() => (snapshot.messages as ProviderMessage[]).push({ role: "user", content: "mutated" })).toThrow();
    expect(context.snapshot().messages).toHaveLength(1);
  });
});
