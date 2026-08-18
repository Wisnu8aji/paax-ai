import type { AppConfig, ModelProfile } from "../../config";
import type { ProviderCompletion, ProviderEvent, ProviderMessage, ProviderRequest, ProviderToolCall, ProviderTransport } from "../base";
import { ProviderError } from "../errors";
import { fetchProvider, mapTools, mapUsage, parseArguments, providerUrl, readJson, readSse, resolveEndpoint, type FetchImplementation } from "./shared";

function messagePayload(message: ProviderMessage) {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
    };
  }
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, name: message.name, content: message.content };
  return { role: message.role, content: message.content };
}

function requestBody(request: ProviderRequest, stream: boolean) {
  return {
    model: request.profile.model,
    messages: [{ role: "system", content: request.systemPrompt }, ...request.messages.map(messagePayload)],
    tools: mapTools(request.tools, "chat"),
    stream,
    ...(request.thinking === "on" && request.profile.supportsThinking ? { reasoning_effort: request.profile.reasoningEffortMap?.[request.reasoningEffort] ?? request.reasoningEffort } : {}),
  };
}

function normalizedMessage(value: unknown, finishReason: unknown, usage: unknown): ProviderCompletion {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError("provider_response_invalid", "provider message is invalid", 502, false);
  const message = value as Record<string, unknown>;
  const content = message.content === null || message.content === undefined ? null : typeof message.content === "string" ? message.content : (() => { throw new ProviderError("provider_response_invalid", "provider content is invalid", 502, false); })();
  const callsRaw = message.tool_calls;
  const toolCalls: ProviderToolCall[] = [];
  if (callsRaw !== undefined) {
    if (!Array.isArray(callsRaw)) throw new ProviderError("provider_response_invalid", "provider tool calls are invalid", 502, false);
    for (const item of callsRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new ProviderError("provider_response_invalid", "provider tool call is invalid", 502, false);
      const call = item as Record<string, unknown>;
      const fn = call.function;
      if (!fn || typeof fn !== "object" || Array.isArray(fn) || typeof call.id !== "string") throw new ProviderError("provider_response_invalid", "provider tool call is invalid", 502, false);
      const functionValue = fn as Record<string, unknown>;
      if (typeof functionValue.name !== "string") throw new ProviderError("provider_response_invalid", "provider tool call name is invalid", 502, false);
      toolCalls.push({ id: call.id, name: functionValue.name, arguments: parseArguments(functionValue.arguments) });
    }
  }
  return {
    content,
    ...(toolCalls.length ? { toolCalls } : {}),
    finishReason: typeof finishReason === "string" ? finishReason === "tool_calls" ? "tool_calls" : finishReason : toolCalls.length ? "tool_calls" : "stop",
    ...(mapUsage(usage) ? { usage: mapUsage(usage) } : {}),
  };
}

export class OpenAICompatibleTransport implements ProviderTransport {
  readonly id: string;
  readonly capabilities = new Set(["complete", "stream"]);
  private readonly endpoint;

  constructor(private readonly profile: ModelProfile, config: AppConfig, private readonly fetchImpl: FetchImplementation = fetch) {
    this.endpoint = resolveEndpoint(profile, config);
    this.id = `openai-compatible:${profile.alias}`;
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    const response = await fetchProvider(this.fetchImpl, providerUrl(this.endpoint, "chat/completions"), request, requestBody(request, false), this.endpoint);
    const payload = await readJson(response);
    const choices = payload.choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") throw new ProviderError("provider_response_invalid", "provider choices are invalid", 502, false);
    const choice = choices[0] as Record<string, unknown>;
    return normalizedMessage(choice.message, choice.finish_reason, payload.usage);
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const response = await fetchProvider(this.fetchImpl, providerUrl(this.endpoint, "chat/completions"), request, requestBody(request, true), this.endpoint);
    let content = "";
    let reasoning = "";
    let finishReason: string | undefined;
    let usage: Readonly<Record<string, number>> | undefined;
    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    for await (const payload of readSse(response)) {
      const choices = payload.choices;
      if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
        const choice = choices[0] as Record<string, unknown>;
        if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
        const delta = choice.delta;
        if (delta && typeof delta === "object" && !Array.isArray(delta)) {
          const value = delta as Record<string, unknown>;
          if (typeof value.content === "string") { content += value.content; yield { type: "delta", delta: value.content }; }
          const reasoningDelta = typeof value.reasoning_content === "string" ? value.reasoning_content : typeof value.reasoning === "string" ? value.reasoning : undefined;
          if (reasoningDelta) { reasoning += reasoningDelta; yield { type: "reasoning", delta: reasoningDelta.slice(0, 2_000) }; }
          if (Array.isArray(value.tool_calls)) {
            for (const item of value.tool_calls) {
              if (!item || typeof item !== "object" || Array.isArray(item)) throw new ProviderError("provider_response_invalid", "provider tool stream is invalid", 502, false);
              const fragment = item as Record<string, unknown>;
              const index = typeof fragment.index === "number" ? fragment.index : 0;
              const current = calls.get(index) ?? { id: "", name: "", arguments: "" };
              if (typeof fragment.id === "string") current.id = fragment.id;
              const fn = fragment.function;
              if (fn && typeof fn === "object" && !Array.isArray(fn)) {
                const functionValue = fn as Record<string, unknown>;
                if (typeof functionValue.name === "string") current.name = functionValue.name;
                if (typeof functionValue.arguments === "string") current.arguments += functionValue.arguments;
              }
              calls.set(index, current);
            }
          }
        }
        if (payload.usage) usage = mapUsage(payload.usage);
      }
    }
    const toolCalls: ProviderToolCall[] = [...calls.values()].map((call) => ({ id: call.id, name: call.name, arguments: parseArguments(call.arguments) }));
    const completion: ProviderCompletion = {
      content: content || null,
      ...(reasoning ? { reasoning: reasoning.slice(0, 2_000) } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      finishReason: finishReason ?? (toolCalls.length ? "tool_calls" : "stop"),
      ...(usage ? { usage } : {}),
    };
    yield { type: "completed", completion };
  }
}
