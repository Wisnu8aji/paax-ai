import type { AppConfig, ModelProfile, ProviderEndpoint } from "../../config";
import { ProviderError, providerErrorForStatus } from "../errors";
import type { ProviderRequest, ProviderTool, ProviderTransport } from "../base";

export type FetchImplementation = typeof fetch;

export function resolveEndpoint(profile: ModelProfile, config: AppConfig): ProviderEndpoint {
  if (profile.transport === "native") throw new ProviderError("provider_transport_unavailable", "native provider transport is unavailable for the canonical loop", 503, false);
  const endpoint = config.providerEndpoints[profile.alias];
  if (!endpoint) throw new ProviderError("provider_configuration_invalid", "provider endpoint is not configured", 503, false);
  if (endpoint.requestStyle !== profile.requestStyle) throw new ProviderError("provider_configuration_invalid", "provider request style does not match profile", 503, false);
  return endpoint;
}

export function providerUrl(endpoint: ProviderEndpoint, suffix: string): string {
  return `${endpoint.baseUrl.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

export function requestHeaders(endpoint: ProviderEndpoint): Headers {
  const key = process.env[endpoint.apiKeyEnv]?.trim();
  if (!key) throw new ProviderError("provider_configuration_invalid", "provider credential is not configured", 503, false);
  return new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${key}`,
  });
}

export function mapTools(tools: readonly ProviderTool[], style: "chat" | "responses") {
  if (style === "responses") return tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.inputSchema }));
  return tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
}

export function mapUsage(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const values = {
    inputTokens: raw.inputTokens ?? raw.prompt_tokens ?? raw.input_tokens ?? raw.promptTokenCount,
    outputTokens: raw.outputTokens ?? raw.completion_tokens ?? raw.output_tokens ?? raw.candidatesTokenCount,
    totalTokens: raw.totalTokens ?? raw.total_tokens ?? raw.totalTokenCount,
  };
  const usage: Record<string, number> = {};
  for (const [key, item] of Object.entries(values)) {
    if (item === undefined) continue;
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) throw new ProviderError("provider_response_invalid", "provider usage is invalid", 502, false);
    usage[key] = item;
  }
  return Object.keys(usage).length ? usage : undefined;
}

export function parseArguments(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "string") {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Readonly<Record<string, unknown>>;
    throw new ProviderError("provider_response_invalid", "provider tool arguments are invalid", 502, false);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new ProviderError("provider_response_invalid", "provider tool arguments are invalid", 502, false); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProviderError("provider_response_invalid", "provider tool arguments are invalid", 502, false);
  return parsed as Readonly<Record<string, unknown>>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  let text: string;
  try { text = await response.text(); } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ProviderError("provider_response_invalid", "provider response could not be read", 502, false);
  }
  if (text.length > 1_000_000) throw new ProviderError("provider_response_invalid", "provider response is too large", 502, false);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new ProviderError("provider_response_invalid", "provider response is malformed", 502, false); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProviderError("provider_response_invalid", "provider response shape is invalid", 502, false);
  return parsed as Record<string, unknown>;
}

function parseSseLine(line: string): Record<string, unknown> | undefined {
  if (!line.startsWith("data:")) return undefined;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { throw new ProviderError("provider_response_invalid", "provider stream event is malformed", 502, false); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProviderError("provider_response_invalid", "provider stream event shape is invalid", 502, false);
  return parsed as Record<string, unknown>;
}

function* parseSseText(text: string): Generator<Record<string, unknown>> {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseSseLine(line);
    if (parsed) yield parsed;
  }
}

export async function* readSse(response: Response): AsyncGenerator<Record<string, unknown>> {
  const body = response.body;
  if (!body) {
    let text: string;
    try { text = await response.text(); } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ProviderError("provider_response_invalid", "provider stream could not be read", 502, false);
    }
    if (text.length > 4_000_000) throw new ProviderError("provider_response_invalid", "provider stream is too large", 502, false);
    yield* parseSseText(text);
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > 4_000_000) throw new ProviderError("provider_response_invalid", "provider stream is too large", 502, false);
      buffered += decoder.decode(next.value, { stream: true });
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseSseLine(line);
        if (parsed) yield parsed;
      }
    }
    buffered += decoder.decode();
    const parsed = parseSseLine(buffered);
    if (parsed) yield parsed;
  } catch (error) {
    if (error instanceof ProviderError || isAbortError(error)) throw error;
    throw new ProviderError("provider_response_invalid", "provider stream could not be read", 502, false);
  } finally {
    reader.releaseLock();
  }
}

export async function fetchProvider(fetchImpl: FetchImplementation, url: string, request: ProviderRequest, body: Record<string, unknown>, endpoint: ProviderEndpoint): Promise<Response> {
  const headers = requestHeaders(endpoint);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw providerErrorForStatus(response.status);
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (request.signal?.aborted) {
      const aborted = new Error("aborted");
      aborted.name = "AbortError";
      throw aborted;
    }
    if (timedOut) throw new ProviderError("provider_unavailable", "provider request timed out", 503, true);
    throw new ProviderError("provider_unavailable", "provider request was interrupted", 503, true);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", abort);
  }
}
