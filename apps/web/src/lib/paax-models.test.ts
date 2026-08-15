import { describe, expect, it } from "vitest";

import {
  PAAX_MODELS,
  DEFAULT_MODEL_ALIAS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING,
  composerBadge,
  getModel,
  resolveThinking,
} from "./paax-models";

describe("paax-models", () => {
  it("is a UI selection registry, not a runtime tool contract", () => {
    expect(Object.values(PAAX_MODELS).every((model) => "apiModel" in model && "provider" in model)).toBe(true);
    expect(Object.values(PAAX_MODELS).every((model) => !("declaration" in model) && !("execute" in model))).toBe(true);
  });
  it("defines exactly Lucent, Arete, and Noir", () => {
    expect(Object.keys(PAAX_MODELS).sort()).toEqual(["arete", "lucent", "noir"]);
    expect(PAAX_MODELS.lucent.displayName).toBe("Lucent");
    expect(PAAX_MODELS.arete.displayName).toBe("Arete");
    expect(PAAX_MODELS.noir.displayName).toBe("Noir");
  });

  it("maps each model to its provider and API model id", () => {
    expect(PAAX_MODELS.lucent).toMatchObject({ provider: "deepseek", apiModel: "deepseek-v4-flash" });
    expect(PAAX_MODELS.arete).toMatchObject({ provider: "deepseek", apiModel: "deepseek-v4-pro" });
    expect(PAAX_MODELS.noir).toMatchObject({ provider: "deepseek", apiModel: "deepseek-v4-pro" });
  });

  it("supports thinking on/off for all 3 models with default on", () => {
    for (const model of Object.values(PAAX_MODELS)) {
      expect(model.supportsThinking).toBe(true);
      expect(model.forcedThinking).toBeNull();
      expect(model.defaultThinking).toBe("on");
      expect(model.allowedReasoningEfforts).toEqual(["high", "max"]);
    }
  });

  it("reset-to-default is Lucent, effort High, thinking On", () => {
    expect(DEFAULT_MODEL_ALIAS).toBe("lucent");
    expect(DEFAULT_REASONING_EFFORT).toBe("high");
    expect(DEFAULT_THINKING).toBe("on");
  });

  it("resolveThinking passes through the requested mode for every model (none force thinking off)", () => {
    expect(resolveThinking("lucent", "on")).toBe("on");
    expect(resolveThinking("lucent", "off")).toBe("off");
    expect(resolveThinking("arete", "on")).toBe("on");
    expect(resolveThinking("noir", "off")).toBe("off");
  });

  it("getModel returns the matching definition", () => {
    expect(getModel("noir").displayName).toBe("Noir");
  });

  it("builds a readable composer badge", () => {
    expect(composerBadge("lucent", "on", "high")).toBe("Lucent · Ultra · High");
    expect(composerBadge("noir", "off", "max")).toBe("Noir · Standard · Max");
  });
});
