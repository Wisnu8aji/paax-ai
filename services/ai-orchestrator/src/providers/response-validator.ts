import type { ProviderCompletion, ProviderToolCall } from "./base";
import { ProviderError } from "./errors";

export interface ResponseValidationOptions {
  maxContentChars?: number;
  maxReasoningChars?: number;
  maxToolCalls?: number;
  maxUsageTokens?: number;
  knownToolNames?: ReadonlySet<string>;
}

const DEFAULTS: Required<Omit<ResponseValidationOptions, "knownToolNames">> = {
  maxContentChars: 1_000_000,
  maxReasoningChars: 32_000,
  maxToolCalls: 32,
  maxUsageTokens: 100_000_000,
};

const FINISH_REASONS = new Set(["stop", "tool_calls", "length", "content_filter", "error"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function invalid(message: string): never {
  throw new ProviderError("provider_response_invalid", message, 502, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 8) invalid("provider tool arguments are too deeply nested");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 32_000) invalid("provider tool argument is too large");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid("provider tool argument number is invalid");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) invalid("provider tool argument array is too large");
    return value.map((item) => cloneJsonValue(item, depth + 1));
  }
  if (!isPlainRecord(value)) invalid("provider tool arguments must be plain JSON");
  const output: Record<string, unknown> = {};
  const keys = Object.keys(value);
  if (keys.length > 256) invalid("provider tool arguments contain too many fields");
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) invalid("provider tool arguments contain an unsafe field");
    output[key] = cloneJsonValue(value[key], depth + 1);
  }
  return output;
}

function cloneArguments(value: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) invalid("provider tool arguments are invalid");
  return cloneJsonValue(value) as Readonly<Record<string, unknown>>;
}

function boundedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) invalid("provider response validation limit is invalid");
  return value;
}

function normalizedUsage(value: unknown, maxUsageTokens: number): Readonly<Record<string, number>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) invalid("provider usage is invalid");
  const usage: Record<string, number> = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > maxUsageTokens) invalid("provider usage is invalid");
    usage[key] = raw;
  }
  return Object.keys(usage).length ? usage : undefined;
}

function normalizedToolCalls(value: unknown, maxToolCalls: number): readonly ProviderToolCall[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid("provider response tool calls are invalid");
  if (value.length > maxToolCalls) invalid("provider response contains too many tool calls");
  const ids = new Set<string>();
  const calls: ProviderToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") invalid("provider response tool call is invalid");
    const id = item.id.trim();
    const name = item.name.trim();
    if (!id || id.length > 256 || !name || name.length > 256) invalid("provider response tool call is invalid");
    if (ids.has(id)) invalid("provider response contains duplicate tool call id");
    ids.add(id);
    calls.push({ id, name, arguments: cloneArguments(item.arguments) });
  }
  return calls.length ? calls : undefined;
}

/**
 * The only object allowed to cross from a provider adapter into the loop.
 * Provider-specific fields are intentionally discarded here, before any tool
 * executor or other side effect can observe the response.
 */
export function validateProviderCompletion(value: unknown, options: ResponseValidationOptions = {}): ProviderCompletion {
  if (!isRecord(value)) invalid("provider response is invalid");
  const maxContentChars = boundedLimit(options.maxContentChars, DEFAULTS.maxContentChars);
  const maxReasoningChars = boundedLimit(options.maxReasoningChars, DEFAULTS.maxReasoningChars);
  const maxToolCalls = boundedLimit(options.maxToolCalls, DEFAULTS.maxToolCalls);
  const maxUsageTokens = boundedLimit(options.maxUsageTokens, DEFAULTS.maxUsageTokens);
  void options.knownToolNames;

  const content = value.content;
  if (content !== null && typeof content !== "string") invalid("provider response content is invalid");
  if (typeof content === "string" && content.length > maxContentChars) invalid("provider response content is too large");

  const reasoning = value.reasoning;
  if (reasoning !== undefined && (typeof reasoning !== "string" || reasoning.length > maxReasoningChars)) invalid("provider response reasoning is invalid");

  const toolCalls = normalizedToolCalls(value.toolCalls, maxToolCalls);
  const rawFinishReason = value.finishReason;
  if (rawFinishReason !== undefined && typeof rawFinishReason !== "string") invalid("provider response finish reason is invalid");
  const finishReason = rawFinishReason === undefined ? (toolCalls?.length ? "tool_calls" : "stop") : rawFinishReason.trim();
  if (!FINISH_REASONS.has(finishReason)) invalid("provider response finish reason is invalid");
  if (finishReason === "tool_calls" && !toolCalls?.length) invalid("provider response tool call finish is empty");
  if (toolCalls?.length && finishReason !== "tool_calls") invalid("provider response tool calls have an inconsistent finish reason");
  if (finishReason === "stop" && (!toolCalls?.length && (typeof content !== "string" || content.length === 0))) invalid("provider response has no assistant content");

  const usage = normalizedUsage(value.usage, maxUsageTokens);
  return {
    content: content as string | null,
    ...(toolCalls ? { toolCalls } : {}),
    ...(typeof reasoning === "string" && reasoning.length ? { reasoning } : {}),
    finishReason,
    ...(usage ? { usage } : {}),
  };
}
