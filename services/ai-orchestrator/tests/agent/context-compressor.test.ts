import { describe, expect, it } from "vitest";
import { ContextCompressor, estimateContextTokens, type ContextMessage } from "../../src/agent/context-compressor";

function fixture(): ContextMessage[] {
  return [
    { id: "system", role: "system", content: "SYSTEM" },
    { id: "head", role: "user", content: "HEAD" },
    { id: "tool-large", role: "tool", content: "x".repeat(40), toolName: "drawing_read" },
    { id: "middle", role: "assistant", content: "MIDDLE" },
    { id: "tool-small", role: "tool", content: "y".repeat(12), toolName: "query" },
    { id: "current", role: "user", content: "CURRENT INTENT" },
  ];
}

describe("deterministic ContextCompressor", () => {
  it("uses the documented char/4 anchor and protects current intent", () => {
    const messages = fixture();
    // Manual anchor: 6 + 4 + 40 + 6 + 12 + 14 = 82 chars; ceil(82 / 4) = 21.
    expect(estimateContextTokens(messages)).toBe(21);
    const result = new ContextCompressor().compress({ sessionId: "session-1", messages, maxTokens: 10, headMessages: 1, tailMessages: 1, toolResultMaxChars: 100 });
    expect(result.receipt.strategy).toBe("deterministic-trim");
    expect(result.receipt.tokenEstimateBefore).toBe(21);
    expect(result.messages.map((message) => message.id)).toEqual(expect.arrayContaining(["system", "head", "current"]));
    expect(result.receipt.omittedMessageIds).toContain("tool-large");
    expect(result.messages.find((message) => message.id === "current")?.content).toBe("CURRENT INTENT");
    expect(result.receipt.tokenEstimateAfter).toBeLessThanOrEqual(10);
  });

  it("falls back to deterministic trim when an injected summarizer fails", async () => {
    const compressor = new ContextCompressor({ summarizer: async () => { throw new Error("summarizer unavailable"); } });
    const result = await compressor.compressAsync({ sessionId: "session-1", messages: fixture(), maxTokens: 10, headMessages: 1, tailMessages: 1, toolResultMaxChars: 100 });
    expect(result.receipt.strategy).toBe("deterministic-trim");
    expect(result.receipt.failure).toBe("summarizer unavailable");
  });
});
