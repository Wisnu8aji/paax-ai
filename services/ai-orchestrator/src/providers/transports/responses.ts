import type { AppConfig, ModelProfile } from "../../config";
import type { ProviderCompletion, ProviderEvent, ProviderMessage, ProviderRequest, ProviderToolCall, ProviderTransport } from "../base";
import { ProviderError } from "../errors";
import { fetchProvider, mapTools, mapUsage, parseArguments, providerUrl, readJson, readSse, resolveEndpoint, type FetchImplementation } from "./shared";

function inputMessage(message: ProviderMessage) {
  if (message.role === "assistant" && message.toolCalls?.length) return { role: "assistant", content: message.content, tool_calls: message.toolCalls.map((call) => ({ call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) })) };
  return { role: message.role, content: message.content, ...(message.toolCallId ? { call_id: message.toolCallId } : {}) };
}

function requestBody(request: ProviderRequest, stream: boolean) {
  return {
    model: request.profile.model,
    instructions: request.systemPrompt,
    input: request.messages.map(inputMessage),
    tools: mapTools(request.tools, "responses"),
    stream,
    ...(request.thinking === "on" && request.profile.supportsThinking ? { reasoning: { effort: request.profile.reasoningEffortMap?.[request.reasoningEffort] ?? request.reasoningEffort } } : {}),
  };
}

function outputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const text: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const content = record.content;
    if (Array.isArray(content)) for (const part of content) {
      if (part && typeof part === "object" && !Array.isArray(part) && typeof (part as Record<string, unknown>).text === "string") text.push((part as Record<string, string>).text);
    }
  }
  return text.join("");
}

function outputCalls(output: unknown): ProviderToolCall[] {
  if (!Array.isArray(output)) return [];
  const calls: ProviderToolCall[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "function_call" || typeof record.call_id !== "string" || typeof record.name !== "string") continue;
    calls.push({ id: record.call_id, name: record.name, arguments: parseArguments(record.arguments) });
  }
  return calls;
}

function normalized(payload: Record<string, unknown>): ProviderCompletion {
  const calls = outputCalls(payload.output);
  const status = payload.status;
  let finishReason = calls.length ? "tool_calls" : "stop";
  if (status === "incomplete") finishReason = "length";
  if (status === "failed") finishReason = "error";
  return {
    content: typeof payload.output_text === "string" ? payload.output_text : outputText(payload.output) || null,
    ...(calls.length ? { toolCalls: calls } : {}),
    finishReason,
    ...(mapUsage(payload.usage) ? { usage: mapUsage(payload.usage) } : {}),
  };
}

export class ResponsesTransport implements ProviderTransport {
  readonly id: string;
  readonly capabilities = new Set(["complete", "stream"]);
  private readonly endpoint;

  constructor(private readonly profile: ModelProfile, config: AppConfig, private readonly fetchImpl: FetchImplementation = fetch) {
    this.endpoint = resolveEndpoint(profile, config);
    this.id = `responses:${profile.alias}`;
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    const response = await fetchProvider(this.fetchImpl, providerUrl(this.endpoint, "responses"), request, requestBody(request, false), this.endpoint);
    return normalized(await readJson(response));
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const response = await fetchProvider(this.fetchImpl, providerUrl(this.endpoint, "responses"), request, requestBody(request, true), this.endpoint);
    let content = "";
    let finishReason: string | undefined;
    let usage: Readonly<Record<string, number>> | undefined;
    const calls = new Map<string, { id: string; name: string; arguments: string }>();
    for await (const payload of readSse(response)) {
      const type = payload.type;
      if (type === "response.output_text.delta" && typeof payload.delta === "string") { content += payload.delta; yield { type: "delta", delta: payload.delta }; }
      if (type === "response.output_item.added" && payload.item && typeof payload.item === "object" && !Array.isArray(payload.item)) {
        const item = payload.item as Record<string, unknown>;
        if (item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string") calls.set(item.call_id, { id: item.call_id, name: item.name, arguments: "" });
        if (item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string" && typeof item.id === "string") {
          calls.set(item.id, calls.get(item.call_id)!);
        }
      }
      if (type === "response.function_call_arguments.delta" && typeof payload.delta === "string") {
        const id = typeof payload.item_id === "string" ? payload.item_id : typeof payload.call_id === "string" ? payload.call_id : "";
        const call = calls.get(id);
        if (call) call.arguments += payload.delta;
      }
      if (type === "response.function_call_arguments.done") {
        const id = typeof payload.item_id === "string" ? payload.item_id : typeof payload.call_id === "string" ? payload.call_id : "";
        const call = calls.get(id);
        if (call && typeof payload.arguments === "string") call.arguments = payload.arguments;
      }
      if (type === "response.completed" && payload.response && typeof payload.response === "object" && !Array.isArray(payload.response)) {
        const responsePayload = payload.response as Record<string, unknown>;
        finishReason = responsePayload.status === "incomplete" ? "length" : undefined;
        usage = mapUsage(responsePayload.usage);
      }
      if (type === "response.incomplete") finishReason = "length";
      if (type === "response.failed") finishReason = "error";
    }
    const toolCalls = [...new Set(calls.values())].map((call) => ({ id: call.id, name: call.name, arguments: parseArguments(call.arguments) }));
    yield {
      type: "completed",
      completion: {
        content: content || null,
        ...(toolCalls.length ? { toolCalls } : {}),
        finishReason: finishReason ?? (toolCalls.length ? "tool_calls" : "stop"),
        ...(usage ? { usage } : {}),
      },
    };
  }
}
