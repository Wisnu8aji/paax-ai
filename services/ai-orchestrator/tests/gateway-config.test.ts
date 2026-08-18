import { describe, expect, it } from "vitest";
import { GatewayConfigError, loadGatewayConfig } from "../src/gateway/config";

describe("gateway configuration", () => {
  it("uses bounded defaults and the canonical channel allow-list", () => {
    const config = loadGatewayConfig({});
    expect(config.allowedChannels).toEqual(["command_room", "agent_runs"]);
    expect(config.maxHistoryMessages).toBe(40);
    expect(config.maxMessageChars).toBe(32_000);
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.legacyHandoffEnabled).toBe(true);
    expect(config.maxIterations).toBe(8);
    expect(config.maxModelAttempts).toBe(8);
    expect(config.maxToolCalls).toBe(24);
    expect(config.maxDurationMs).toBe(120_000);
    expect(config.maxInputTokens).toBe(32_000);
    expect(config.maxOutputTokens).toBe(16_000);
    expect(config.maxTotalTokens).toBe(48_000);
    expect(config.toolTimeoutMs).toBe(30_000);
    expect(config.approvalTtlMs).toBe(300_000);
    expect(config.retryCount).toBe(1);
    expect(config.retryBackoffMs).toBe(100);
    expect(config.sessionDbBusyTimeoutMs).toBe(5_000);
    expect(config.maxStateJsonBytes).toBe(64_000);
    expect(config.maxEventBytes).toBe(120_000);
    expect(config.cronEnabled).toBe(false);
    expect(config.cronTickMs).toBe(60_000);
    expect(config.cronClaimLeaseMs).toBe(300_000);
    expect(config.contextMaxTokens).toBe(32_000);
    expect(config.contextHeadMessages).toBe(4);
    expect(config.contextTailMessages).toBe(8);
    expect(config.contextCompressionThreshold).toBe(0.8);
    expect(config.contextCompressionCooldownMs).toBe(30_000);
    expect(config.subagentEnabled).toBe(false);
    expect(config.subagentMaxDepth).toBe(1);
    expect(config.subagentMaxChildren).toBe(4);
    expect(config.subagentMaxDurationMs).toBe(30_000);
    expect(config.subagentMaxToolCalls).toBe(8);
    expect(config.subagentMaxTotalTokens).toBe(16_000);
    expect(config.pluginsEnabled).toBe(false);
    expect(config.observabilityEnabled).toBe(true);
  });

  it("parses explicit bounded limits and legacy handoff flag", () => {
    const config = loadGatewayConfig({
      PAAX_GATEWAY_MAX_HISTORY_MESSAGES: "20",
      PAAX_GATEWAY_MAX_MESSAGE_CHARS: "16000",
      PAAX_GATEWAY_REQUEST_TIMEOUT_MS: "45000",
      PAAX_GATEWAY_LEGACY_HANDOFF_ENABLED: "0",
      PAAX_GATEWAY_MAX_ITERATIONS: "4",
      PAAX_GATEWAY_MAX_MODEL_ATTEMPTS: "5",
      PAAX_GATEWAY_MAX_TOOL_CALLS: "12",
      PAAX_GATEWAY_MAX_DURATION_MS: "60000",
      PAAX_GATEWAY_MAX_INPUT_TOKENS: "12000",
      PAAX_GATEWAY_MAX_OUTPUT_TOKENS: "6000",
      PAAX_GATEWAY_MAX_TOTAL_TOKENS: "18000",
      PAAX_GATEWAY_TOOL_TIMEOUT_MS: "5000",
      PAAX_GATEWAY_APPROVAL_TTL_MS: "120000",
      PAAX_GATEWAY_RETRY_COUNT: "2",
      PAAX_GATEWAY_RETRY_BACKOFF_MS: "250",
      PAAX_SESSION_DB_BUSY_TIMEOUT_MS: "7000",
      PAAX_STATE_MAX_JSON_BYTES: "32000",
      PAAX_STATE_MAX_EVENT_BYTES: "80000",
      PAAX_CRON_ENABLED: "1",
      PAAX_CRON_TICK_MS: "1000",
      PAAX_CRON_CLAIM_LEASE_MS: "5000",
      PAAX_CONTEXT_MAX_TOKENS: "12000",
      PAAX_CONTEXT_HEAD_MESSAGES: "2",
      PAAX_CONTEXT_TAIL_MESSAGES: "6",
      PAAX_CONTEXT_COMPRESSION_THRESHOLD: "0.75",
      PAAX_CONTEXT_COMPRESSION_COOLDOWN_MS: "45000",
      PAAX_SUBAGENT_ENABLED: "1",
      PAAX_SUBAGENT_MAX_DEPTH: "1",
      PAAX_SUBAGENT_MAX_CHILDREN: "2",
      PAAX_SUBAGENT_MAX_DURATION_MS: "60000",
      PAAX_SUBAGENT_MAX_TOOL_CALLS: "4",
      PAAX_SUBAGENT_MAX_TOTAL_TOKENS: "8000",
      PAAX_PLUGINS_ENABLED: "true",
      PAAX_OBSERVABILITY_ENABLED: "0",
    });
    expect(config.maxHistoryMessages).toBe(20);
    expect(config.maxMessageChars).toBe(16_000);
    expect(config.requestTimeoutMs).toBe(45_000);
    expect(config.legacyHandoffEnabled).toBe(false);
    expect(config.maxIterations).toBe(4);
    expect(config.maxModelAttempts).toBe(5);
    expect(config.maxToolCalls).toBe(12);
    expect(config.maxDurationMs).toBe(60_000);
    expect(config.maxInputTokens).toBe(12_000);
    expect(config.maxOutputTokens).toBe(6_000);
    expect(config.maxTotalTokens).toBe(18_000);
    expect(config.toolTimeoutMs).toBe(5_000);
    expect(config.approvalTtlMs).toBe(120_000);
    expect(config.retryCount).toBe(2);
    expect(config.retryBackoffMs).toBe(250);
    expect(config.sessionDbBusyTimeoutMs).toBe(7_000);
    expect(config.maxStateJsonBytes).toBe(32_000);
    expect(config.maxEventBytes).toBe(80_000);
    expect(config.cronEnabled).toBe(true);
    expect(config.cronTickMs).toBe(1_000);
    expect(config.cronClaimLeaseMs).toBe(5_000);
    expect(config.contextMaxTokens).toBe(12_000);
    expect(config.contextHeadMessages).toBe(2);
    expect(config.contextTailMessages).toBe(6);
    expect(config.contextCompressionThreshold).toBe(0.75);
    expect(config.contextCompressionCooldownMs).toBe(45_000);
    expect(config.subagentEnabled).toBe(true);
    expect(config.subagentMaxDepth).toBe(1);
    expect(config.subagentMaxChildren).toBe(2);
    expect(config.subagentMaxDurationMs).toBe(60_000);
    expect(config.subagentMaxToolCalls).toBe(4);
    expect(config.subagentMaxTotalTokens).toBe(8_000);
    expect(config.pluginsEnabled).toBe(true);
    expect(config.observabilityEnabled).toBe(false);
  });

  it("rejects invalid or unbounded values", () => {
    expect(() => loadGatewayConfig({ PAAX_GATEWAY_MAX_HISTORY_MESSAGES: "0" })).toThrow(GatewayConfigError);
    expect(() => loadGatewayConfig({ PAAX_GATEWAY_MAX_MESSAGE_CHARS: "999999999" })).toThrow(GatewayConfigError);
    expect(() => loadGatewayConfig({ PAAX_GATEWAY_REQUEST_TIMEOUT_MS: "not-a-number" })).toThrow(GatewayConfigError);
    expect(() => loadGatewayConfig({ PAAX_CONTEXT_COMPRESSION_THRESHOLD: "1.5" })).toThrow(GatewayConfigError);
    expect(() => loadGatewayConfig({ PAAX_SUBAGENT_MAX_DEPTH: "2" })).toThrow(GatewayConfigError);
    expect(() => loadGatewayConfig({ PAAX_SUBAGENT_MAX_TOTAL_TOKENS: "999999999" })).toThrow(GatewayConfigError);
  });
});
