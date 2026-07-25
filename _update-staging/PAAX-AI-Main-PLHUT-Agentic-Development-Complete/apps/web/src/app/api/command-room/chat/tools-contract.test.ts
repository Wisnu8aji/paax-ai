import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Command Room tool contract boundary", () => {
  it("adapts the canonical ai-orchestrator registry and converters", () => {
    const source = readFileSync(fileURLToPath(new URL("./tools.ts", import.meta.url)), "utf8");
    expect(source).toContain('from "@paax/ai-orchestrator/tools"');
    expect(source).toContain("createToolRegistry");
    expect(source).toContain("toOpenRouterTool");
    expect(source).toContain("toAnthropicTool");
  });
});
