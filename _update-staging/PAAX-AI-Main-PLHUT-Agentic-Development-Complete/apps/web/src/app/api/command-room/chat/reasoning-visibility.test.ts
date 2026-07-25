import { describe, expect, it } from "vitest";
import { shouldStreamRawReasoningToClient } from "./reasoning-visibility";

describe("Command Room reasoning visibility", () => {
  it("never exposes Arete or Lucent raw reasoning", () => {
    expect(shouldStreamRawReasoningToClient("arete")).toBe(false);
    expect(shouldStreamRawReasoningToClient("lucent")).toBe(false);
  });

  it("keeps Noir's explicit reasoning mode", () => {
    expect(shouldStreamRawReasoningToClient("noir")).toBe(true);
  });
});
