import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type ModelProfile } from "../../../src/config";
import type { ProviderRequest } from "../../../src/providers/base";
import { createProviderTransport, ResponsesTransport } from "../../../src/providers/transports";

const profile: ModelProfile = {
  alias: "arete",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  transport: "openai-compatible",
  requestStyle: "responses",
  supportsThinking: true,
};

function config() {
  return loadConfig({
    PAAX_MODEL_PROFILES_JSON: JSON.stringify({ arete: profile }),
    PAAX_PROVIDER_ENDPOINTS_JSON: JSON.stringify({ arete: { baseUrl: "https://provider.test/v1", apiKeyEnv: "PAAX_TEST_RESPONSES_KEY", requestStyle: "responses" } }),
  });
}

function request(): ProviderRequest {
  return {
    profile,
    systemPrompt: "stable instructions",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "workspace_list", inputSchema: { type: "object" } }],
    reasoningEffort: "max",
    thinking: "on",
  };
}

afterEach(() => {
  delete process.env.PAAX_TEST_RESPONSES_KEY;
});

describe("Responses provider transport", () => {
  it("maps a Responses JSON completion and function call", async () => {
    process.env.PAAX_TEST_RESPONSES_KEY = "responses-secret-value";
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const transport = createProviderTransport(profile, config(), async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "done" }] },
          { type: "function_call", call_id: "call-1", name: "workspace_list", arguments: "{\"path\":\".\"}" },
        ],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    expect(transport).toBeInstanceOf(ResponsesTransport);
    const completion = await transport.complete(request());
    expect(completion).toMatchObject({ content: "done", finishReason: "tool_calls", toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }], usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } });
    expect(captured?.input).toBe("https://provider.test/v1/responses");
    const body = JSON.parse(String(captured?.init?.body));
    expect(body.instructions).toBe("stable instructions");
    expect(body.stream).toBe(false);
  });

  it("aggregates Responses SSE text and function-call argument events", async () => {
    process.env.PAAX_TEST_RESPONSES_KEY = "responses-secret-value";
    const sse = [
      'data: {"type":"response.output_text.delta","delta":"Hel"}',
      'data: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"call-2","name":"workspace_list"}}',
      'data: {"type":"response.function_call_arguments.delta","item_id":"call-2","delta":"{\\"path\\":\\".\\"}"}',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}}',
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
    expect(completed).toMatchObject({ type: "completed", completion: { content: "Hel", finishReason: "tool_calls", toolCalls: [{ id: "call-2", name: "workspace_list", arguments: { path: "." } }] } });
  });

  it("maps an incomplete response to a non-success finish reason", async () => {
    process.env.PAAX_TEST_RESPONSES_KEY = "responses-secret-value";
    const transport = createProviderTransport(profile, config(), async () => new Response(JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "partial" }), { status: 200 }));
    await expect(transport.complete(request())).resolves.toMatchObject({ content: "partial", finishReason: "length" });
  });
});
