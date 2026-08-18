import { describe, expect, it } from "vitest";
import type { ProviderCompletion } from "../../src/providers/base";
import { ProviderError } from "../../src/providers/errors";
import { validateProviderCompletion } from "../../src/providers/response-validator";

describe("provider response validator", () => {
  it("normalizes defaults and strips provider-only fields before tool dispatch", () => {
    const normalized = validateProviderCompletion({
      content: null,
      toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }],
      reasoning: "brief",
      usage: { inputTokens: 4, outputTokens: 2, providerCost: 99 } as ProviderCompletion["usage"],
      finishReason: undefined,
      providerPrivateField: "must not cross the boundary",
    } as unknown as ProviderCompletion);

    expect(normalized).toEqual({
      content: null,
      toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }],
      reasoning: "brief",
      usage: { inputTokens: 4, outputTokens: 2 },
      finishReason: "tool_calls",
    });
    expect("providerPrivateField" in normalized).toBe(false);
  });

  it("rejects malformed, duplicated, oversized, and inconsistent tool responses", () => {
    const invalid: ProviderCompletion[] = [
      { content: null, finishReason: "stop" },
      { content: null, finishReason: "tool_calls", toolCalls: [] },
      { content: null, finishReason: "tool_calls", toolCalls: [{ id: "same", name: "a", arguments: {} }, { id: "same", name: "b", arguments: {} }] },
      { content: null, finishReason: "tool_calls", toolCalls: [{ id: "call", name: "a", arguments: [] as unknown as Record<string, unknown> }] },
      { content: "ok", finishReason: "unexpected" },
    ];

    for (const completion of invalid) {
      expect(() => validateProviderCompletion(completion)).toThrow(ProviderError);
    }
  });

  it("applies bounded reasoning, content, tool, and usage limits", () => {
    expect(() => validateProviderCompletion({ content: "ok", reasoning: "12345", finishReason: "stop" }, { maxReasoningChars: 4 })).toThrow(/reasoning/i);
    expect(() => validateProviderCompletion({ content: "ok", finishReason: "stop", usage: { totalTokens: 101 } }, { maxUsageTokens: 100 })).toThrow(/usage/i);
    expect(() => validateProviderCompletion({ content: "ok", finishReason: "stop", toolCalls: [{ id: "a", name: "a", arguments: {} }, { id: "b", name: "b", arguments: {} }] }, { maxToolCalls: 1 })).toThrow(/tool/i);
    expect(() => validateProviderCompletion({ content: "12345", finishReason: "stop" }, { maxContentChars: 4 })).toThrow(/content/i);
  });

  it("keeps unknown tool calls as data for the executor to turn into structured errors", () => {
    const normalized = validateProviderCompletion({ content: null, finishReason: "tool_calls", toolCalls: [{ id: "call-unknown", name: "not_registered", arguments: {} }] }, { knownToolNames: new Set(["workspace_list"]) });
    expect(normalized.toolCalls?.[0]).toMatchObject({ id: "call-unknown", name: "not_registered" });
  });
});
