import { describe, expect, it } from "vitest";
import { buildStableSystemPrompt, SYSTEM_PROMPT_VERSION } from "../../src/agent/system-prompt";

describe("stable Command Room system prompt", () => {
  it("is versioned, deterministic, Indonesian, and states the authority boundaries", () => {
    const input = { locale: "id-ID" as const, channel: "command_room" as const, profileName: "review" };
    const first = buildStableSystemPrompt(input);
    const second = buildStableSystemPrompt(input);

    expect(SYSTEM_PROMPT_VERSION).toBe("command-room-worker.phase2.v1");
    expect(first).toBe(second);
    expect(first).toContain("Command Room PAAX");
    expect(first).toContain("Core Engine");
    expect(first).toContain("persetujuan");
    expect(first).toContain("review");
    expect(first).not.toMatch(/api[_ -]?key|password|token|current time|system prompt user/i);
  });

  it("changes only when stable identity input changes", () => {
    const base = buildStableSystemPrompt({ locale: "id-ID", channel: "command_room", profileName: "review" });
    const other = buildStableSystemPrompt({ locale: "id-ID", channel: "command_room", profileName: "planning" });
    expect(other).not.toBe(base);
  });
});
