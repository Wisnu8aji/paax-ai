import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type ModelProfile } from "../../../src/config";
import type { ProviderRequest } from "../../../src/providers/base";
import { ProviderError } from "../../../src/providers/errors";
import { createProviderTransport } from "../../../src/providers/transports";

const profile: ModelProfile = {
  alias: "gemini-review",
  provider: "gemini",
  model: "gemini-2.5-flash",
  transport: "native",
  requestStyle: "chat-completions",
  supportsThinking: false,
};

function config(enabled = true) {
  return loadConfig({
    GEMINI_API_KEY: "gemini-secret-value",
    PAAX_ENABLE_OPTIONAL_GEMINI: enabled ? "1" : "0",
    PAAX_MODEL_PROFILES_JSON: JSON.stringify({ "gemini-review": profile }),
  });
}

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    profile,
    systemPrompt: "system instructions",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "workspace_list", arguments: { path: "." } }] },
      { role: "tool", toolCallId: "call-1", name: "workspace_list", content: "{\"files\":[]}" },
    ],
    tools: [{ name: "workspace_list", description: "List files", inputSchema: { type: "object", properties: { path: { type: "string" } } } }],
    reasoningEffort: "high",
    thinking: "off",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("optional Gemini provider transport", () => {
  it("normalizes an explicitly enabled completion and maps system/tool schema", async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const transport = createProviderTransport(profile, config(), async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "done" }, { functionCall: { name: "workspace_list", args: { path: "." } } }] } }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3, totalTokenCount: 7 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const completion = await transport.complete(request());
    expect(completion).toMatchObject({ content: "done", finishReason: "tool_calls", toolCalls: [{ id: expect.any(String), name: "workspace_list", arguments: { path: "." } }], usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 } });
    expect(String(captured?.input)).toContain("generativelanguage.googleapis.com");
    expect(new Headers(captured?.init?.headers).get("x-goog-api-key")).toBe("gemini-secret-value");
    const body = JSON.parse(String(captured?.init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("system instructions");
    expect(body.tools[0].functionDeclarations[0].name).toBe("workspace_list");
    expect(JSON.stringify(completion)).not.toContain("gemini-secret-value");
  });

  it("normalizes streamed text and function calls through the shared provider events", async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"},{"functionCall":{"name":"workspace_list","args":{"path":"."}}}]}}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"totalTokenCount":5}}',
      "",
    ].join("\n");
    const transport = createProviderTransport(profile, config(), async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const events = [];
    for await (const event of transport.stream(request())) events.push(event);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "delta", delta: "Hel" }), expect.objectContaining({ type: "delta", delta: "lo" })]));
    expect(events.find((event) => event.type === "completed")).toMatchObject({ completion: { content: "Hello", finishReason: "tool_calls", toolCalls: [{ name: "workspace_list" }] } });
  });

  it("is unavailable unless explicitly opted in and never falls back from the default", () => {
    expect(() => createProviderTransport(profile, config(false))).toThrowError(ProviderError);
    const defaultConfig = loadConfig({});
    const defaultProfile = defaultConfig.modelProfiles.lucent;
    const transport = createProviderTransport(defaultProfile, defaultConfig, async () => new Response("{}"));
    expect(transport.id).toContain("openai-compatible");
  });

  it("redacts provider failures and honors caller abort", async () => {
    const failing = createProviderTransport(profile, config(), async () => new Response("gemini-secret-value internal details", { status: 429 }));
    await expect(failing.complete(request())).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    try { await failing.complete(request()); } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect(String(error)).not.toContain("gemini-secret-value");
      expect(String(error)).not.toContain("internal details");
    }

    const controller = new AbortController();
    const hanging = createProviderTransport(profile, config(), async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); }, { once: true });
    }));
    const pending = hanging.complete(request({ signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
