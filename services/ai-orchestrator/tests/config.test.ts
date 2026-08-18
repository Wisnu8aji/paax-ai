import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseModelProfiles, parseProviderEndpoints, resolveModelProfile } from "../src/config";

const profileJson = JSON.stringify({
  lucent: { provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", supportsThinking: true },
  arete: { provider: "deepseek", model: "deepseek-v4-pro", transport: "openai-compatible", supportsThinking: true, reasoningEffortMap: { high: "high", max: "xhigh" } },
});

describe("service model profile configuration", () => {
  it("resolves profiles entirely from configuration and preserves legacy fields", () => {
    const config = loadConfig({
      PORT: "8090",
      GEMINI_API_KEY: "legacy-key",
      CORE_ENGINE_URL: "http://core.test///",
      DOCUMENT_INTELLIGENCE_URL: "http://di.test/",
      AI_ORCH_MAX_TOOL_TURNS: "5",
      PAAX_PROFILE: "review",
      PAAX_DEFAULT_MODEL_ALIAS: "arete",
      PAAX_MODEL_PROFILES_JSON: profileJson,
    });

    expect(config.port).toBe(8090);
    expect(config.geminiApiKey).toBe("legacy-key");
    expect(config.coreEngineUrl).toBe("http://core.test");
    expect(config.documentIntelligenceUrl).toBe("http://di.test");
    expect(config.profileName).toBe("review");
    expect(config.defaultModelAlias).toBe("arete");
    expect(resolveModelProfile(config, "arete")).toMatchObject({ alias: "arete", model: "deepseek-v4-pro" });
    expect(resolveModelProfile(config, "arete")?.requestStyle).toBe("chat-completions");
    expect(resolveModelProfile(config, "missing")).toBeUndefined();
    expect(JSON.stringify(config.modelProfiles)).not.toMatch(/key|secret|password|token/i);
  });

  it("rejects malformed or secret-bearing profiles without echoing the input", () => {
    expect(() => parseModelProfiles("not-json")).toThrow(ConfigError);
    expect(() => parseModelProfiles(JSON.stringify({ lucent: { provider: "deepseek", model: "m", transport: "openai-compatible", supportsThinking: true, apiKey: "hidden" } }))).toThrow(ConfigError);
    const config = loadConfig({ PAAX_MODEL_PROFILES_JSON: "not-json" });
    expect(config.modelProfiles).toEqual({});
  });

  it("rejects invalid numeric configuration instead of guessing a provider", () => {
    expect(() => loadConfig({ PORT: "not-a-port" })).toThrow(ConfigError);
    expect(() => loadConfig({ AI_ORCH_MAX_TOOL_TURNS: "0" })).toThrow(ConfigError);
  });

  it("rejects malformed service URLs while preserving http/https normalization", () => {
    expect(() => loadConfig({ CORE_ENGINE_URL: "not-a-url" })).toThrow(ConfigError);
    const config = loadConfig({ CORE_ENGINE_URL: "https://core.test///", DOCUMENT_INTELLIGENCE_URL: "http://di.test/" });
    expect(config.coreEngineUrl).toBe("https://core.test");
    expect(config.documentIntelligenceUrl).toBe("http://di.test");
  });

  it("parses provider endpoint metadata without accepting credentials or secret values", () => {
    const config = loadConfig({
      PAAX_PROVIDER_ENDPOINTS_JSON: JSON.stringify({
        lucent: { baseUrl: "https://provider.test/v1/", apiKeyEnv: "PAAX_LUCENT_API_KEY", requestStyle: "responses" },
      }),
    });
    expect(config.providerEndpoints.lucent).toMatchObject({
      baseUrl: "https://provider.test/v1",
      apiKeyEnv: "PAAX_LUCENT_API_KEY",
      requestStyle: "responses",
    });
    expect(JSON.stringify(config.providerEndpoints)).not.toContain("secret-value");
    expect(() => parseProviderEndpoints(JSON.stringify({ lucent: { baseUrl: "https://user:pass@provider.test", apiKeyEnv: "KEY" } }))).toThrow(ConfigError);
    expect(() => parseProviderEndpoints(JSON.stringify({ lucent: { baseUrl: "https://provider.test", apiKeyEnv: "paax-key" } }))).toThrow(ConfigError);
  });

  it("resolves the absent profile to the DeepSeek/opencode-go-compatible lucent default", () => {
    const config = loadConfig({});
    expect(config.defaultModelAlias).toBe("lucent");
    expect(resolveModelProfile(config, "")).toMatchObject({ alias: "lucent", provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", requestStyle: "chat-completions" });
    expect(config.providerEndpoints.lucent).toMatchObject({ apiKeyEnv: "DEEPSEEK_API_KEY", requestStyle: "chat-completions" });
    expect(config.enableOptionalGemini).toBe(false);
  });
});
