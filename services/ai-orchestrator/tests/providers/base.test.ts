import { describe, expect, it } from "vitest";
import type { ModelProfile } from "../../src/config";
import type { ProviderRequest, ProviderTransport } from "../../src/providers/base";

describe("provider-neutral boundary", () => {
  it("can describe a transport without implementing or invoking one", async () => {
    const profile: ModelProfile = {
      alias: "lucent",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      transport: "openai-compatible",
      requestStyle: "chat-completions",
      supportsThinking: true,
    };
    const request: ProviderRequest = {
      profile,
      systemPrompt: "stable",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      reasoningEffort: "high",
      thinking: "on",
    };
    let completeCalls = 0;
    const transport: ProviderTransport = {
      id: "test-transport",
      capabilities: new Set(["complete", "stream"]),
      async complete() { completeCalls += 1; return { content: "unused" }; },
      async *stream() { yield { type: "delta", delta: "unused" }; },
    };

    expect(request.profile.model).toBe("deepseek-v4-flash");
    expect(transport.capabilities.has("complete")).toBe(true);
    expect(completeCalls).toBe(0);
  });
});
