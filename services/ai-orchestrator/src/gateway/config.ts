export interface GatewayConfig {
  allowedChannels: readonly ["command_room", "agent_runs"];
  maxHistoryMessages: number;
  maxMessageChars: number;
  requestTimeoutMs: number;
  legacyHandoffEnabled: boolean;
  maxIterations: number;
  maxModelAttempts: number;
  maxToolCalls: number;
  maxDurationMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  toolTimeoutMs: number;
  approvalTtlMs: number;
  retryCount: number;
  retryBackoffMs: number;
  sessionDbBusyTimeoutMs: number;
  maxStateJsonBytes: number;
  maxEventBytes: number;
  cronEnabled: boolean;
  cronTickMs: number;
  cronClaimLeaseMs: number;
  contextMaxTokens: number;
  contextHeadMessages: number;
  contextTailMessages: number;
  contextCompressionThreshold: number;
  contextCompressionCooldownMs: number;
  subagentEnabled: boolean;
  subagentMaxDepth: number;
  subagentMaxChildren: number;
  subagentMaxDurationMs: number;
  subagentMaxToolCalls: number;
  subagentMaxTotalTokens: number;
  pluginsEnabled: boolean;
  observabilityEnabled: boolean;
}

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

const DEFAULTS = {
  maxHistoryMessages: 40,
  maxMessageChars: 32_000,
  requestTimeoutMs: 30_000,
  maxIterations: 8,
  maxModelAttempts: 8,
  maxToolCalls: 24,
  maxDurationMs: 120_000,
  maxInputTokens: 32_000,
  maxOutputTokens: 16_000,
  maxTotalTokens: 48_000,
  toolTimeoutMs: 30_000,
  approvalTtlMs: 300_000,
  retryCount: 1,
  retryBackoffMs: 100,
  sessionDbBusyTimeoutMs: 5_000,
  maxStateJsonBytes: 64_000,
  maxEventBytes: 120_000,
  cronTickMs: 60_000,
  cronClaimLeaseMs: 300_000,
  contextMaxTokens: 32_000,
  contextHeadMessages: 4,
  contextTailMessages: 8,
  contextCompressionThreshold: 0.8,
  contextCompressionCooldownMs: 30_000,
  subagentMaxDepth: 1,
  subagentMaxChildren: 4,
  subagentMaxDurationMs: 30_000,
  subagentMaxToolCalls: 8,
  subagentMaxTotalTokens: 16_000,
} as const;

function boundedInteger(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new GatewayConfigError(`${key} is outside its allowed range`);
  return parsed;
}

function booleanFlag(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new GatewayConfigError(`${key} must be a boolean flag`);
}

function boundedRatio(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new GatewayConfigError(`${key} is outside its allowed range`);
  return parsed;
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    allowedChannels: ["command_room", "agent_runs"],
    maxHistoryMessages: boundedInteger(env, "PAAX_GATEWAY_MAX_HISTORY_MESSAGES", DEFAULTS.maxHistoryMessages, 1, 40),
    maxMessageChars: boundedInteger(env, "PAAX_GATEWAY_MAX_MESSAGE_CHARS", DEFAULTS.maxMessageChars, 1, 32_000),
    requestTimeoutMs: boundedInteger(env, "PAAX_GATEWAY_REQUEST_TIMEOUT_MS", DEFAULTS.requestTimeoutMs, 100, 120_000),
    legacyHandoffEnabled: booleanFlag(env, "PAAX_GATEWAY_LEGACY_HANDOFF_ENABLED", true),
    maxIterations: boundedInteger(env, "PAAX_GATEWAY_MAX_ITERATIONS", DEFAULTS.maxIterations, 1, 32),
    maxModelAttempts: boundedInteger(env, "PAAX_GATEWAY_MAX_MODEL_ATTEMPTS", DEFAULTS.maxModelAttempts, 1, 32),
    maxToolCalls: boundedInteger(env, "PAAX_GATEWAY_MAX_TOOL_CALLS", DEFAULTS.maxToolCalls, 1, 128),
    maxDurationMs: boundedInteger(env, "PAAX_GATEWAY_MAX_DURATION_MS", DEFAULTS.maxDurationMs, 1_000, 600_000),
    maxInputTokens: boundedInteger(env, "PAAX_GATEWAY_MAX_INPUT_TOKENS", DEFAULTS.maxInputTokens, 256, 128_000),
    maxOutputTokens: boundedInteger(env, "PAAX_GATEWAY_MAX_OUTPUT_TOKENS", DEFAULTS.maxOutputTokens, 256, 64_000),
    maxTotalTokens: boundedInteger(env, "PAAX_GATEWAY_MAX_TOTAL_TOKENS", DEFAULTS.maxTotalTokens, 512, 192_000),
    toolTimeoutMs: boundedInteger(env, "PAAX_GATEWAY_TOOL_TIMEOUT_MS", DEFAULTS.toolTimeoutMs, 100, 120_000),
    approvalTtlMs: boundedInteger(env, "PAAX_GATEWAY_APPROVAL_TTL_MS", DEFAULTS.approvalTtlMs, 1_000, 1_800_000),
    retryCount: boundedInteger(env, "PAAX_GATEWAY_RETRY_COUNT", DEFAULTS.retryCount, 0, 3),
    retryBackoffMs: boundedInteger(env, "PAAX_GATEWAY_RETRY_BACKOFF_MS", DEFAULTS.retryBackoffMs, 0, 5_000),
    sessionDbBusyTimeoutMs: boundedInteger(env, "PAAX_SESSION_DB_BUSY_TIMEOUT_MS", DEFAULTS.sessionDbBusyTimeoutMs, 100, 120_000),
    maxStateJsonBytes: boundedInteger(env, "PAAX_STATE_MAX_JSON_BYTES", DEFAULTS.maxStateJsonBytes, 1_024, 1_000_000),
    maxEventBytes: boundedInteger(env, "PAAX_STATE_MAX_EVENT_BYTES", DEFAULTS.maxEventBytes, 1_024, 1_000_000),
    cronEnabled: booleanFlag(env, "PAAX_CRON_ENABLED", false),
    cronTickMs: boundedInteger(env, "PAAX_CRON_TICK_MS", DEFAULTS.cronTickMs, 10, 3_600_000),
    cronClaimLeaseMs: boundedInteger(env, "PAAX_CRON_CLAIM_LEASE_MS", DEFAULTS.cronClaimLeaseMs, 1_000, 3_600_000),
    contextMaxTokens: boundedInteger(env, "PAAX_CONTEXT_MAX_TOKENS", DEFAULTS.contextMaxTokens, 256, 128_000),
    contextHeadMessages: boundedInteger(env, "PAAX_CONTEXT_HEAD_MESSAGES", DEFAULTS.contextHeadMessages, 0, 40),
    contextTailMessages: boundedInteger(env, "PAAX_CONTEXT_TAIL_MESSAGES", DEFAULTS.contextTailMessages, 0, 40),
    contextCompressionThreshold: boundedRatio(env, "PAAX_CONTEXT_COMPRESSION_THRESHOLD", DEFAULTS.contextCompressionThreshold, 0.1, 0.99),
    contextCompressionCooldownMs: boundedInteger(env, "PAAX_CONTEXT_COMPRESSION_COOLDOWN_MS", DEFAULTS.contextCompressionCooldownMs, 1_000, 3_600_000),
    subagentEnabled: booleanFlag(env, "PAAX_SUBAGENT_ENABLED", false),
    subagentMaxDepth: boundedInteger(env, "PAAX_SUBAGENT_MAX_DEPTH", DEFAULTS.subagentMaxDepth, 1, 1),
    subagentMaxChildren: boundedInteger(env, "PAAX_SUBAGENT_MAX_CHILDREN", DEFAULTS.subagentMaxChildren, 1, 64),
    subagentMaxDurationMs: boundedInteger(env, "PAAX_SUBAGENT_MAX_DURATION_MS", DEFAULTS.subagentMaxDurationMs, 1_000, 600_000),
    subagentMaxToolCalls: boundedInteger(env, "PAAX_SUBAGENT_MAX_TOOL_CALLS", DEFAULTS.subagentMaxToolCalls, 1, 64),
    subagentMaxTotalTokens: boundedInteger(env, "PAAX_SUBAGENT_MAX_TOTAL_TOKENS", DEFAULTS.subagentMaxTotalTokens, 256, 128_000),
    pluginsEnabled: booleanFlag(env, "PAAX_PLUGINS_ENABLED", false),
    observabilityEnabled: booleanFlag(env, "PAAX_OBSERVABILITY_ENABLED", true),
  };
}
