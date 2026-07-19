import { describe, expect, it } from "vitest";

import {
  buildServerChatContext,
  CHAT_CONTEXT_LIMITS,
  validateChatPayload,
} from "./context";

describe("Command Room server context", () => {
  it("builds provider context in the mandated order and compacts client history", async () => {
    const result = await buildServerChatContext({
      projectId: "project-1",
      conversationId: "conversation-1",
      messages: [
        { role: "system", content: "client must not control policy" },
        ...Array.from({ length: 10 }, (_, index) => ({
          role: index % 2 ? "assistant" as const : "user" as const,
          content: `turn-${index}`,
        })),
      ],
      loaders: {
        projectRetrieval: async () => "project-context",
        durableMemory: async () => ["memory-a", "memory-a", "memory-b"],
        conversationSummary: async () => "stored-summary",
      },
    });

    expect(result.messages.map((message) => message.content)).toEqual([
      expect.stringContaining("PAAX"),
      expect.stringContaining("project-context"),
      expect.stringContaining("memory-a"),
      expect.stringContaining("stored-summary"),
      "turn-3", "turn-4", "turn-5", "turn-6", "turn-7", "turn-8", "turn-9",
    ]);
    expect(result.messages.some((message) => message.content.includes("client must not control"))).toBe(false);
  });

  it("rejects oversized requests deterministically before provider access", () => {
    expect(validateChatPayload({
      messages: [{ role: "user", content: "x".repeat(CHAT_CONTEXT_LIMITS.maxRequestChars + 1) }],
    })).toEqual({ ok: false, error: "Payload chat melebihi batas karakter." });
  });

  it("keeps only the configured recent history and current query", async () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: "user" as const,
      content: `message-${index}`,
    }));
    const result = await buildServerChatContext({ messages });
    const nonSystem = result.messages.filter((message) => message.role !== "system");
    expect(nonSystem).toHaveLength(CHAT_CONTEXT_LIMITS.maxRecentTurns);
    expect(nonSystem.at(-1)?.content).toBe("message-19");
  });
});
