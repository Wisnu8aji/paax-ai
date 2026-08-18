import { describe, expect, it, vi } from "vitest";
import { selectTools, type ToolsetSelection } from "../../src/tools/toolsets";
import type { ToolDefinition } from "../../src/tools/types";

function tool(name: string, toolset: string, scope: string): ToolDefinition {
  return {
    declaration: { name, description: name, parameters: { type: "OBJECT", properties: {} } },
    policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", scope },
    execute: vi.fn(async () => ({ ok: true })),
    toolset,
  } as ToolDefinition;
}

describe("canonical registry toolsets", () => {
  it("filters the supplied registry array by toolset, scope, availability, and maxTools", () => {
    const tools = [tool("command-read", "command-room", "workspace:read"), tool("domain-read", "domain", "domain:read")];
    const selection: ToolsetSelection = { include: ["domain"], allowedScopes: ["domain:read"], maxTools: 1 };

    expect(selectTools(tools, selection).map((item) => item.declaration.name)).toEqual(["domain-read"]);
  });

  it("does not execute handlers or create a second registry", () => {
    const first = tool("read", "domain", "domain:read");
    const selected = selectTools([first], { include: ["domain"], allowedScopes: [], maxTools: 10 });

    expect(selected).toEqual([first]);
    expect(first.execute).not.toHaveBeenCalled();
  });
});
