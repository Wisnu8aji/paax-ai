import { resolveRuntimePaths, type RuntimePaths } from "./constants";
import { loadGatewayConfig, type GatewayConfig } from "./gateway/config";
import { loadMcpConfig } from "./tools/mcp/config";
import type { McpServerConfig } from "./tools/mcp/types";

export const GEMINI_MODEL = "gemini-2.5-flash";
export type RequestStyle = "chat-completions" | "responses";

export interface ModelProfile {
  alias: string;
  provider: string;
  model: string;
  transport: "openai-compatible" | "native";
  requestStyle: RequestStyle;
  supportsThinking: boolean;
  reasoningEffortMap?: Readonly<Record<string, string>>;
}

export interface AppConfig {
  port: number;
  geminiApiKey: string;
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  maxToolTurns: number;
  runtimePaths: RuntimePaths;
  profileName: string;
  defaultModelAlias: string | undefined;
  modelProfiles: Readonly<Record<string, ModelProfile>>;
  providerEndpoints: Readonly<Record<string, ProviderEndpoint>>;
  enableOptionalGemini: boolean;
  mcpServers?: readonly McpServerConfig[];
  gateway: GatewayConfig;
}

export interface ProviderEndpoint {
  baseUrl: string;
  apiKeyEnv: string;
  requestStyle: RequestStyle;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const SAFE_ALIAS = /^[A-Za-z0-9._-]{1,64}$/;
const PROFILE_KEYS = new Set(["provider", "model", "transport", "requestStyle", "supportsThinking", "reasoningEffortMap"]);
const ENDPOINT_KEYS = new Set(["baseUrl", "apiKeyEnv", "requestStyle"]);
const SAFE_ENV_NAME = /^[A-Z][A-Z0-9_]{1,127}$/;

function positiveInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ConfigError(`${key} must be a positive integer`);
  return parsed;
}

function serviceUrl(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key]?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(`${key} must be an absolute http(s) URL`);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    throw new ConfigError(`${key} must be an absolute http(s) URL without credentials`);
  }
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConfigError("model profile configuration must be an object");
  return value as Record<string, unknown>;
}

export function parseModelProfiles(raw: string): Readonly<Record<string, ModelProfile>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError("model profile configuration is malformed");
  }
  const entries = asRecord(parsed);
  const profiles: Record<string, ModelProfile> = {};
  for (const [alias, value] of Object.entries(entries)) {
    if (!SAFE_ALIAS.test(alias)) throw new ConfigError("model profile alias is invalid");
    const item = asRecord(value);
    for (const key of Object.keys(item)) {
      if (!PROFILE_KEYS.has(key)) throw new ConfigError("model profile contains an unsupported field");
    }
    const provider = typeof item.provider === "string" ? item.provider.trim() : "";
    const model = typeof item.model === "string" ? item.model.trim() : "";
    const transport = item.transport;
    const requestStyle = item.requestStyle ?? "chat-completions";
    if (!provider || !model || (transport !== "openai-compatible" && transport !== "native") ||
      (requestStyle !== "chat-completions" && requestStyle !== "responses") || typeof item.supportsThinking !== "boolean") {
      throw new ConfigError("model profile is missing required capability metadata");
    }
    let reasoningEffortMap: Readonly<Record<string, string>> | undefined;
    if (item.reasoningEffortMap !== undefined) {
      const map = asRecord(item.reasoningEffortMap);
      if (Object.entries(map).some(([key, value]) => !key.trim() || typeof value !== "string" || !value.trim())) {
        throw new ConfigError("model profile reasoning effort map is invalid");
      }
      reasoningEffortMap = Object.freeze(Object.fromEntries(Object.entries(map).map(([key, value]) => [key, (value as string).trim()])));
    }
    profiles[alias] = Object.freeze({ alias, provider, model, transport, requestStyle, supportsThinking: item.supportsThinking, ...(reasoningEffortMap ? { reasoningEffortMap } : {}) });
  }
  return Object.freeze(profiles);
}

export function parseProviderEndpoints(raw: string): Readonly<Record<string, ProviderEndpoint>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError("provider endpoint configuration is malformed");
  }
  const entries = asRecord(parsed);
  const endpoints: Record<string, ProviderEndpoint> = {};
  for (const [alias, value] of Object.entries(entries)) {
    if (!SAFE_ALIAS.test(alias)) throw new ConfigError("provider endpoint alias is invalid");
    const item = asRecord(value);
    for (const key of Object.keys(item)) if (!ENDPOINT_KEYS.has(key)) throw new ConfigError("provider endpoint contains an unsupported field");
    const baseUrl = typeof item.baseUrl === "string" ? item.baseUrl.trim() : "";
    const apiKeyEnv = typeof item.apiKeyEnv === "string" ? item.apiKeyEnv.trim() : "";
    const requestStyle = item.requestStyle ?? "chat-completions";
    if (!baseUrl || !apiKeyEnv || !SAFE_ENV_NAME.test(apiKeyEnv) ||
      (requestStyle !== "chat-completions" && requestStyle !== "responses")) {
      throw new ConfigError("provider endpoint metadata is invalid");
    }
    let url: URL;
    try { url = new URL(baseUrl); } catch { throw new ConfigError("provider endpoint URL is invalid"); }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) {
      throw new ConfigError("provider endpoint URL must be http(s) without credentials");
    }
    endpoints[alias] = Object.freeze({ baseUrl: baseUrl.replace(/\/+$/, ""), apiKeyEnv, requestStyle });
  }
  return Object.freeze(endpoints);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawProfiles = env.PAAX_MODEL_PROFILES_JSON?.trim();
  let modelProfiles: Readonly<Record<string, ModelProfile>> = {};
  if (rawProfiles) {
    try { modelProfiles = parseModelProfiles(rawProfiles); } catch { modelProfiles = {}; }
  } else {
    modelProfiles = Object.freeze({
      lucent: Object.freeze({
        alias: "lucent",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        transport: "openai-compatible",
        requestStyle: "chat-completions",
        supportsThinking: true,
      }),
    });
  }
  const rawEndpoints = env.PAAX_PROVIDER_ENDPOINTS_JSON?.trim();
  const providerEndpoints = rawEndpoints
    ? parseProviderEndpoints(rawEndpoints)
    : rawProfiles
      ? Object.freeze({})
      : parseProviderEndpoints(JSON.stringify({
        lucent: {
          baseUrl: env.DEEPSEEK_BASE_URL?.trim() || "https://opencode.ai/zen/go/v1",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          requestStyle: "chat-completions",
        },
      }));
  const listEnv = (key: string): readonly string[] | undefined => {
    const raw = env[key]?.trim();
    if (!raw) return undefined;
    const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? Object.freeze(values) : undefined;
  };
  let mcpServers: readonly McpServerConfig[] = Object.freeze([]);
  try {
    mcpServers = loadMcpConfig(env, {
      allowedCommands: listEnv("PAAX_MCP_ALLOWED_COMMANDS"),
      allowedHosts: listEnv("PAAX_MCP_ALLOWED_HOSTS"),
      allowedRedirectHosts: listEnv("PAAX_MCP_ALLOWED_REDIRECT_HOSTS"),
    });
  } catch {
    // Invalid/untrusted MCP configuration is disabled, never guessed or widened.
    mcpServers = Object.freeze([]);
  }
  return {
    port: positiveInteger(env, "PORT", 8082),
    geminiApiKey: env.GEMINI_API_KEY?.trim() ?? "",
    coreEngineUrl: serviceUrl(env, "CORE_ENGINE_URL", "http://localhost:8081"),
    documentIntelligenceUrl: serviceUrl(env, "DOCUMENT_INTELLIGENCE_URL", "http://localhost:8083"),
    maxToolTurns: positiveInteger(env, "AI_ORCH_MAX_TOOL_TURNS", 3),
    runtimePaths: resolveRuntimePaths(env),
    profileName: env.PAAX_PROFILE?.trim() || "default",
    defaultModelAlias: env.PAAX_DEFAULT_MODEL_ALIAS?.trim() || "lucent",
    modelProfiles,
    providerEndpoints,
    enableOptionalGemini: env.PAAX_ENABLE_OPTIONAL_GEMINI === "1" || env.PAAX_ENABLE_OPTIONAL_GEMINI?.trim().toLowerCase() === "true",
    mcpServers,
    gateway: loadGatewayConfig(env),
  };
}

export function resolveModelProfile(config: AppConfig, alias: string): ModelProfile | undefined {
  const normalized = alias.trim() || config.defaultModelAlias || "lucent";
  return normalized ? config.modelProfiles[normalized] : undefined;
}
