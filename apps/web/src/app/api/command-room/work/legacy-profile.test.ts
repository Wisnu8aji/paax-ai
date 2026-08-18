import { describe, expect, it } from "vitest";
import { resolveLegacyProfile } from "./legacy-profile";

describe("legacy work profile adapter", () => {
  it("passes the service-selected model through to the temporary web transport", () => {
    const resolved = resolveLegacyProfile({
      alias: "lucent",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      transport: "openai-compatible",
      requestStyle: "chat-completions",
      supportsThinking: true,
      selectedEffort: "high",
      thinking: "on",
    });

    expect(resolved).toEqual({
      modelAlias: "lucent",
      apiModel: "deepseek-v4-flash",
      openRouterModelSlug: "deepseek/deepseek-v4-flash",
    });
  });

  it("fails closed for unsupported provider, transport, and aliases", () => {
    const base = { alias: "lucent", provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible" as const, requestStyle: "chat-completions" as const, supportsThinking: true, selectedEffort: "high" as const, thinking: "on" as const };
    expect(resolveLegacyProfile({ ...base, provider: "unknown" })).toBeNull();
    expect(resolveLegacyProfile({ ...base, transport: "native" })).toBeNull();
    expect(resolveLegacyProfile({ ...base, alias: "future-model" })).toBeNull();
  });
});
