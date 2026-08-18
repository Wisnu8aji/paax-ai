import { describe, expect, it } from "vitest";
import { toProviderTool, toProviderTools } from "../../src/tools/model-tools";
import { getToolPolicy } from "../../src/tools/tool-policy";
import type { ToolDefinition } from "../../src/tools/types";

const available: ToolDefinition = {
  declaration: {
    name: "example",
    description: "Example tool",
    parameters: { type: "OBJECT", properties: { path: { type: "STRING" } } },
  },
  policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe" },
  execute: () => ({ ok: true }),
};

const unavailable: ToolDefinition = {
  ...available,
  declaration: { ...available.declaration, name: "unavailable" },
  policy: { ...getToolPolicy(available), available: false },
};

describe("provider-neutral model tool adapter", () => {
  it("converts registry declarations to standard JSON Schema and filters unavailable tools", () => {
    expect(toProviderTool(available)).toEqual({ name: "example", description: "Example tool", inputSchema: { type: "object", properties: { path: { type: "string" } } } });
    expect(toProviderTools([available, unavailable]).map((tool) => tool.name)).toEqual(["example"]);
  });

  it("fails closed on duplicate names, non-object schemas, and tool/selection limits", () => {
    expect(() => toProviderTools([available, { ...available, execute: () => ({ ok: true }) }])).toThrow(/duplicate/i);
    expect(() => toProviderTools([{ ...available, declaration: { ...available.declaration, parameters: { type: "STRING" } as never } }])).toThrow(/schema/i);
    expect(toProviderTools([available], { maxTools: 0 })).toEqual([]);
    expect(() => toProviderTools([available], { maxSchemaBytes: 2 })).toThrow(/size|schema/i);
  });
});
