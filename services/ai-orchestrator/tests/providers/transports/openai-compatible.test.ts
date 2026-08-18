import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type ModelProfile } from "../../../src/config";
import type { ProviderRequest } from "../../../src/providers/base";
import { ProviderError } from "../../../src/providers/errors";
import { createProviderTransport, OpenAICompatibleTransport } from "../../../src/providers/transports";

const profile: ModelProfile = {
  alias: "lucent",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  transport: "openai-compatible",
  requestStyle: "chat-completions",
  supportsThinking: true,
};

function config() {
  return loadConfig({
    PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }),
    PAAX_PROVIDER_ENDPOINTS_JSON: JSON.stringify({ lucent: { baseUrl: "https://provider.test/v1", apiKeyEnv: "PAAX_TEST_PROVIDER_KEY", requestStyle: "chat-completions" } }),
  });
}

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    profile,
    systemPrompt: "stable instructions",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }] },
      { role: "tool", toolCallId: "call-1", name: "workspace_list", content: '{"files":[]}' },
    ],
    tools: [{ name: "workspace_list", description: "List", inputSchema: { type: "object" } }],
    reasoningEffort: "high",
    thinking: "on",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.PAAX_TEST_PROVIDER_KEY;
});

describe("OpenAI-compatible provider transport", () => {
  it("maps a completion request and response without exposing the key", async () => {
    process.env.PAAX_TEST_PROVIDER_KEY = "provider-secret-value";
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const transport = createProviderTransport(profile, config(), async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    expect(transport).toBeInstanceOf(OpenAICompatibleTransport);
    const completion = await transport.complete(request());
    expect(completion).toMatchObject({ content: "done", finishReason: "stop", usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } });
    expect(captured?.input).toBe("https://provider.test/v1/chat/completions");
    const headers = new Headers(captured?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer provider-secret-value");
    const body = JSON.parse(String(captured?.init?.body));
    expect(body.stream).toBe(false);
    expect(body.messages[2].tool_calls[0].function.arguments).toBe('{"path":"."}');
    expect(body.tools[0].function.parameters).toEqual({ type: "object" });
    expect(JSON.stringify(completion)).not.toContain("provider-secret-value");
  });

  it("aggregates streamed content and tool argument fragments into one normalized completion", async () => {
    process.env.PAAX_TEST_PROVIDER_KEY = "provider-secret-value";
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"workspace_list","arguments":"{\\"path\\":"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\".\\"}"}}]}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}',
      "data: [DONE]",
      "",
    ].join("\n");
    const transport = createProviderTransport(profile, config(), async () => new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));

    const events = [];
    for await (const event of transport.stream(request())) events.push(event);
    const completed = events.find((event) => event.type === "completed");
    expect(completed).toMatchObject({ type: "completed", completion: { content: "Hel", finishReason: "tool_calls", toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }] } });
  });

  it("maps provider failures to typed safe errors and rejects malformed JSON", async () => {
    process.env.PAAX_TEST_PROVIDER_KEY = "provider-secret-value";
    const rateLimited = createProviderTransport(profile, config(), async () => new Response("provider-secret-value internal body", { status: 429 }));
    await expect(rateLimited.complete(request())).rejects.toMatchObject({ code: "provider_unavailable", retryable: true, status: 429 });
    try { await rateLimited.complete(request()); } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect(String(error)).not.toContain("provider-secret-value");
      expect(String(error)).not.toContain("internal body");
    }

    const malformed = createProviderTransport(profile, config(), async () => new Response("not-json", { status: 200 }));
    await expect(malformed.complete(request())).rejects.toMatchObject({ code: "provider_response_invalid", retryable: false });
  });

  it("rejects missing endpoint/key and native canonical transport without fallback", async () => {
    const missing = loadConfig({ PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: profile }) });
    expect(() => createProviderTransport(profile, missing)).toThrow(/endpoint/i);
    process.env.PAAX_TEST_PROVIDER_KEY = "provider-secret-value";
    const native = { ...profile, transport: "native" as const };
    expect(() => createProviderTransport(native, config())).toThrow(/unavailable|native/i);
  });
});
