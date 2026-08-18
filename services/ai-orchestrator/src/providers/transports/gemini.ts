import type { AppConfig, ModelProfile } from "../../config";
import type { ProviderCompletion, ProviderEvent, ProviderMessage, ProviderRequest, ProviderTool, ProviderToolCall, ProviderTransport } from "../base";
import { ProviderError, providerErrorForStatus } from "../errors";
import { mapUsage, parseArguments, readJson, readSse, type FetchImplementation } from "./shared";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 120_000;

function textPart(message: ProviderMessage): Record<string, unknown> {
  return { text: message.content ?? "" };
}

function messageContents(messages: readonly ProviderMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "user") return { role: "user", parts: [textPart(message)] };
    if (message.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.arguments } });
      return { role: "model", parts: parts.length ? parts : [{ text: "" }] };
    }
    if (message.role === "tool") {
      let response: Record<string, unknown>;
      try {
        response = message.content ? parseArguments(message.content) as Record<string, unknown> : {};
      } catch {
        response = { content: message.content ?? "" };
      }
      return { role: "function", parts: [{ functionResponse: { name: message.name ?? "tool", response } }] };
    }
    return { role: "user", parts: [textPart(message)] };
  });
}

function geminiTools(tools: readonly ProviderTool[]): Array<Record<string, unknown>> {
  return tools.length ? [{ functionDeclarations: tools.map((tool) => {
    const schema = tool.inputSchema as Record<string, unknown>;
    return {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: {
        ...schema,
        type: typeof schema.type === "string" ? schema.type.toUpperCase() : "OBJECT",
      },
    };
  }) }] : [];
}

function requestBody(request: ProviderRequest, stream: boolean): Record<string, unknown> {
  return {
    contents: messageContents(request.messages),
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    ...(geminiTools(request.tools).length ? { tools: geminiTools(request.tools) } : {}),
    generationConfig: { temperature: 0.2 },
    ...(stream ? {} : {}),
  };
}

function candidateParts(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object" || Array.isArray(candidates[0])) {
    throw new ProviderError("provider_response_invalid", "provider candidates are invalid", 502, false);
  }
  const content = (candidates[0] as Record<string, unknown>).content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const parts = (content as Record<string, unknown>).parts;
  if (parts === undefined) return [];
  if (!Array.isArray(parts)) throw new ProviderError("provider_response_invalid", "provider content parts are invalid", 502, false);
  return parts.filter((part): part is Record<string, unknown> => !!part && typeof part === "object" && !Array.isArray(part));
}

function functionCall(part: Record<string, unknown>, index: number): ProviderToolCall | undefined {
  const raw = part.functionCall;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProviderError("provider_response_invalid", "provider function call is invalid", 502, false);
  const call = raw as Record<string, unknown>;
  if (typeof call.name !== "string" || !call.name.trim()) throw new ProviderError("provider_response_invalid", "provider function name is invalid", 502, false);
  const args = call.args === undefined ? {} : parseArguments(typeof call.args === "string" ? call.args : call.args);
  return { id: `gemini-call-${index}`, name: call.name.slice(0, 256), arguments: args };
}

function normalized(payload: Record<string, unknown>): ProviderCompletion {
  const parts = candidateParts(payload);
  const content = parts.filter((part) => typeof part.text === "string").map((part) => part.text as string).join("");
  const toolCalls = parts.map((part, index) => functionCall(part, index)).filter((call): call is ProviderToolCall => !!call);
  return {
    content: content || null,
    ...(toolCalls.length ? { toolCalls } : {}),
    finishReason: toolCalls.length ? "tool_calls" : "stop",
    ...(mapUsage(payload.usageMetadata) ? { usage: mapUsage(payload.usageMetadata) } : {}),
  };
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

export class GeminiTransport implements ProviderTransport {
  readonly id: string;
  readonly capabilities = new Set(["complete", "stream", "tools"]);
  private readonly baseUrl: string;

  constructor(private readonly profile: ModelProfile, private readonly config: AppConfig, private readonly fetchImpl: FetchImplementation = fetch) {
    this.id = `gemini:${profile.alias}`;
    this.baseUrl = (config.providerEndpoints[profile.alias]?.baseUrl || process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    const response = await this.fetch(request, "generateContent");
    return normalized(await readJson(response));
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const response = await this.fetch(request, "streamGenerateContent?alt=sse");
    let content = "";
    const calls: ProviderToolCall[] = [];
    let usage: Readonly<Record<string, number>> | undefined;
    for await (const payload of readSse(response)) {
      for (const part of candidateParts(payload)) {
        if (typeof part.text === "string") {
          content += part.text;
          yield { type: "delta", delta: part.text };
        }
        const call = functionCall(part, calls.length);
        if (call) {
          calls.push(call);
          yield { type: "tool_call_delta", index: calls.length - 1, id: call.id, name: call.name, argumentsDelta: JSON.stringify(call.arguments) };
        }
      }
      const mappedUsage = mapUsage(payload.usageMetadata);
      if (mappedUsage) usage = mappedUsage;
    }
    yield { type: "completed", completion: { content: content || null, ...(calls.length ? { toolCalls: calls } : {}), finishReason: calls.length ? "tool_calls" : "stop", ...(usage ? { usage } : {}) } };
  }

  private async fetch(request: ProviderRequest, operation: string): Promise<Response> {
    const apiKey = this.config.geminiApiKey.trim();
    if (!apiKey) throw new ProviderError("provider_configuration_invalid", "provider credential is not configured", 503, false);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort();
    request.signal?.addEventListener("abort", abort, { once: true });
    try {
      const url = `${this.baseUrl}/models/${encodeURIComponent(this.profile.model)}:${operation}`;
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-goog-api-key": apiKey },
        body: JSON.stringify(requestBody(request, operation.startsWith("stream"))),
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorForStatus(response.status);
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (request.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw abortError();
      if (timedOut) throw new ProviderError("provider_unavailable", "provider request timed out", 503, true);
      throw new ProviderError("provider_unavailable", "provider request was interrupted", 503, true);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
    }
  }
}
