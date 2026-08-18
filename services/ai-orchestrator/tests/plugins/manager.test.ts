import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { PluginManager, validatePluginManifest, type PluginManifest } from "../../src/plugins/manager";
import type { ToolDefinition } from "../../src/tools/types";

const root = join("D:\\paax-ai-command-room-worker", "plugin-root");
const manifest: PluginManifest = {
  id: "safe-plugin",
  version: "1.0.0",
  entry: "safe/index.js",
  enabled: true,
  capabilities: ["tools", "middleware"],
  permissions: ["workspace:read"],
};

function tool(name: string): ToolDefinition {
  return {
    declaration: { name, description: "plugin tool", parameters: { type: "OBJECT", properties: {} } },
    toolset: "plugin",
    policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", timeoutMs: 1_000, executionMode: "concurrent" },
    execute: async () => ({ ok: true }),
  };
}

describe("PluginManager", () => {
  it("validates manifest fields and keeps entry paths inside the configured root", () => {
    expect(() => validatePluginManifest({ ...manifest, entry: "../outside.js" })).toThrow(/path|root/i);
    expect(() => validatePluginManifest({ ...manifest, id: "bad id" })).toThrow(/id/i);
    const manager = new PluginManager({ root, allowlist: [manifest.id], loader: async () => ({}) });
    expect(manager.resolveEntry(manifest)).toBe(join(root, "safe", "index.js"));
  });

  it("discovers, activates, deactivates, reloads, and unloads an allowlisted plugin", async () => {
    let activations = 0;
    let deactivations = 0;
    const manager = new PluginManager({ root, allowlist: [manifest.id], loader: async () => ({
      activate: async () => { activations += 1; return { tools: [tool("safe_tool")] }; },
      deactivate: async () => { deactivations += 1; },
    }) });
    manager.discover([manifest]);
    await expect(manager.activate(manifest.id)).resolves.toMatchObject({ status: "active" });
    expect(manager.contributions().tools.map((item) => item.declaration.name)).toEqual(["safe_tool"]);
    await manager.deactivate(manifest.id);
    await manager.reload(manifest.id);
    expect(activations).toBe(2);
    expect(deactivations).toBeGreaterThanOrEqual(1);
    await manager.unload(manifest.id);
    expect(manager.get(manifest.id)).toBeUndefined();
  });

  it("isolates disabled and failed plugins, rejects capability/collision/privileged violations, and audits safe codes", async () => {
    const audit: unknown[] = [];
    const disabled = { ...manifest, id: "disabled-plugin", enabled: false };
    const manager = new PluginManager({ root, allowlist: [manifest.id, disabled.id], reservedToolNames: ["workspace_list"], audit: (event) => audit.push(event), loader: async (_path, item) => {
      if (item.id === "safe-plugin") return { activate: async () => ({ tools: [tool("workspace_list")] }) };
      throw new Error("secret-provider-key");
    } });
    manager.discover([manifest, disabled]);
    await expect(manager.activate(disabled.id)).resolves.toMatchObject({ status: "disabled" });
    await expect(manager.activate(manifest.id)).resolves.toMatchObject({ status: "failed", errorCode: "contribution_invalid" });
    expect(JSON.stringify(audit)).not.toContain("secret-provider-key");
    expect(() => new PluginManager({ root, allowlist: [manifest.id], loader: async () => ({}) }).discover([{ ...manifest, permissions: ["tools:override"] }])).toThrow(/privileged|override/i);
  });

  it("rejects a plugin contribution outside its declared capability", async () => {
    const middlewareOnly = { ...manifest, id: "middleware-only", capabilities: ["middleware"] as const };
    const manager = new PluginManager({ root, allowlist: [middlewareOnly.id], loader: async () => ({ activate: async () => ({ tools: [tool("not_allowed")] }) }) });
    manager.discover([middlewareOnly]);
    await expect(manager.activate(middlewareOnly.id)).resolves.toMatchObject({ status: "failed", errorCode: "contribution_invalid" });
  });
});
