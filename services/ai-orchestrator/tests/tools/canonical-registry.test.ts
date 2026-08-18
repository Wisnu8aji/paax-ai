import { afterEach, describe, expect, it } from "vitest";
import { createToolRegistry } from "../../src/tools/registry";
import { toProviderTools } from "../../src/tools/model-tools";
import { getToolPolicy } from "../../src/tools/tool-policy";
import { InMemorySubagentLifecycle } from "../../src/agent/subagent-lifecycle";

const params = {
  coreEngineUrl: "http://core-engine.test",
  documentIntelligenceUrl: "http://document-intelligence.test",
  workspaceRoot: "D:\\paax-workspace",
};

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("canonical Command Room tool registry", () => {
  it("contains the ten domain tools plus nine safe service tools and excludes Gemini search", () => {
    process.env.GEMINI_API_KEY = "legacy-only-test-key";
    const registry = createToolRegistry({ ...params, mode: "canonical" });
    const names = registry.map((tool) => tool.declaration.name);

    expect(names).toHaveLength(19);
    expect(names).toContain("lookup_ahsp");
    expect(names).toContain("export_rab_xlsx");
    expect(names).toEqual(expect.arrayContaining([
      "todo", "workspace_list", "file_read", "file_search", "terminal_run",
      "tool_search", "tool_describe", "mcp_catalog", "delegate_task",
    ]));
    expect(names).not.toContain("search_knowledge");
    expect(registry.every((tool) => getToolPolicy(tool).sideEffect !== undefined)).toBe(true);
  });

  it("keeps Gemini search only behind explicit legacy mode", () => {
    const registry = createToolRegistry({ ...params, mode: "legacy", geminiApiKey: "legacy-only-test-key" });
    expect(registry.map((tool) => tool.declaration.name)).toContain("search_knowledge");
  });

  it("exports provider-neutral JSON schemas and does not expose Gemini declarations", () => {
    const [tool] = toProviderTools(createToolRegistry({ ...params, mode: "canonical" }).filter((item) => item.declaration.name === "workspace_list"));
    expect(tool).toMatchObject({ name: "workspace_list", inputSchema: { type: "object" } });
    expect(JSON.stringify(tool)).not.toMatch(/GEMINI|apiKey|secret/i);
  });

  it("marks side-effecting and dynamic tools conservatively", () => {
    const registry = createToolRegistry({ ...params, mode: "canonical" });
    const byName = new Map(registry.map((tool) => [tool.declaration.name, getToolPolicy(tool)]));
    expect(byName.get("export_rab_xlsx")).toMatchObject({ sideEffect: "write", approval: "always" });
    expect(byName.get("terminal_run")).toMatchObject({ sideEffect: "external", approval: "on-risk" });
    expect(byName.get("delegate_task")).toMatchObject({ available: false, approval: "always" });
  });

  it("wires an injected delegate boundary into the existing canonical entry", async () => {
    const lifecycle = new InMemorySubagentLifecycle({
      parentRunId: "run-parent",
      parentTurnId: "turn-parent",
      parentBindingId: "binding-1",
      allowedScopes: ["workspace.read"],
      allowedTools: ["workspace_list"],
    });
    const registry = createToolRegistry({
      ...params,
      mode: "canonical",
      delegate: {
        lifecycle,
        parentBindingId: "binding-1",
        parentRunId: "run-parent",
        parentTurnId: "turn-parent",
        allowedScopes: ["workspace.read"],
        allowedTools: ["workspace_list"],
      },
    });
    const delegate = registry.find((tool) => tool.declaration.name === "delegate_task")!;
    expect(getToolPolicy(delegate)).toMatchObject({ available: true, approval: "always" });
    await expect(delegate.execute({ task: "Inspect", idempotency_key: "delegate-1", requested_scopes: ["workspace.read"], requested_tools: ["workspace_list"] })).resolves.toMatchObject({ available: false, executed: false, code: "delegation_not_in_phase" });
  });

  it("merges validated plugin tools into the one canonical registry and rejects built-in collisions", () => {
    const pluginTool = {
      declaration: { name: "plugin_read", description: "plugin read", parameters: { type: "OBJECT" as const, properties: {} } },
      toolset: "plugin",
      policy: { available: true, riskTier: "low" as const, sideEffect: "read" as const, approval: "never" as const, concurrency: "safe" as const, timeoutMs: 1_000, executionMode: "concurrent" as const },
      execute: async () => ({ ok: true }),
    };
    const registry = createToolRegistry({ ...params, mode: "canonical", pluginTools: [pluginTool] });
    expect(registry.filter((item) => item.declaration.name === "plugin_read")).toHaveLength(1);
    expect(getToolPolicy(registry.find((item) => item.declaration.name === "plugin_read")!)).toMatchObject({ available: true, approval: "never" });
    expect(() => createToolRegistry({ ...params, mode: "canonical", pluginTools: [{ ...pluginTool, declaration: { ...pluginTool.declaration, name: "workspace_list" } }] })).toThrow(/duplicate|canonical/i);
  });
});
