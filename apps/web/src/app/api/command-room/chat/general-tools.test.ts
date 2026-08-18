import { describe, expect, it } from "vitest";
import { GENERAL_CHAT_TOOL_NAMES, createGeneralChatToolRegistry } from "./general-tools";

describe("general Chat tool registry", () => {
  it("contains only general capabilities and excludes Work-only names", () => {
    const names = createGeneralChatToolRegistry({ conversationId: "conv", turnId: "turn" }).map((tool) => tool.declaration.name);
    expect(names).toEqual(GENERAL_CHAT_TOOL_NAMES);
    expect(names).not.toContain("query_rab");
    expect(names).not.toContain("query_schedule");
    expect(names).not.toContain("run_scenario");
    expect(names).not.toContain("query_project_graph");
  });

  it("calculates ordinary arithmetic without evaluating arbitrary code", () => {
    const tool = createGeneralChatToolRegistry({ conversationId: "conv", turnId: "turn" }).find((item) => item.declaration.name === "calculate_expression");
    expect(tool).toBeDefined();
    expect(tool!.execute({ expression: "(12.5 * 4) + 2" })).toMatchObject({ value: 52 });
    expect(tool!.execute({ expression: "globalThis.process" })).toMatchObject({ error: expect.any(String) });
  });
});
