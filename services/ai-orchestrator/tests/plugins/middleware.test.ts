import { describe, expect, it } from "vitest";
import { composePluginMiddleware, type PluginMiddlewareContext } from "../../src/plugins/middleware";

function context(): PluginMiddlewareContext {
  return {
    stage: "beforeTool",
    identity: Object.freeze({ tenantId: "tenant-a", actorId: "actor-a", runId: "run-a" }),
    authority: Object.freeze({ approval: "never", budget: { maxToolCalls: 2 }, toolPermissions: ["workspace.read"], provider: "deepseek" }),
    metadata: { note: "safe", authorization: "secret-value" },
  };
}

describe("plugin middleware composition", () => {
  it("orders by priority then plugin/id and invokes downstream once", async () => {
    const calls: string[] = [];
    const pipeline = composePluginMiddleware([
      { pluginId: "zeta", id: "z", stage: "beforeTool", priority: 10, handle: async (_ctx, next) => { calls.push("z-before"); await next(); calls.push("z-after"); } },
      { pluginId: "alpha", id: "b", stage: "beforeTool", priority: 10, handle: async (_ctx, next) => { calls.push("b-before"); await next(); calls.push("b-after"); } },
      { pluginId: "alpha", id: "a", stage: "beforeTool", priority: 1, handle: async (_ctx, next) => { calls.push("a-before"); await next(); calls.push("a-after"); } },
    ]);
    await pipeline.run("beforeTool", context(), async () => { calls.push("downstream"); });
    expect(calls).toEqual(["a-before", "b-before", "z-before", "downstream", "z-after", "b-after", "a-after"]);
  });

  it("rejects next called twice, isolates plugin failures, and redacts trace metadata", async () => {
    const traces: unknown[] = [];
    const pipeline = composePluginMiddleware([
      { pluginId: "unsafe", id: "double", stage: "beforeTurn", priority: 0, handle: async (_ctx, next) => { await next(); await next(); } },
    ], { onTrace: (trace) => traces.push(trace) });
    await expect(pipeline.run("beforeTurn", context(), async () => undefined)).rejects.toMatchObject({ code: "middleware_next_twice" });
    expect(JSON.stringify(traces)).not.toContain("secret-value");
    await expect(pipeline.run("beforeTurn", context(), async () => undefined)).rejects.toMatchObject({ code: "middleware_closed" });
  });

  it("keeps identity and authority immutable and bounds metadata", async () => {
    let observed: PluginMiddlewareContext | undefined;
    const pipeline = composePluginMiddleware([{ pluginId: "observer", id: "one", stage: "afterTurn", priority: 0, handle: async (ctx, next) => { observed = ctx; await next(); } }]);
    const input = context();
    input.metadata.large = "x".repeat(50_000);
    await pipeline.run("afterTurn", input, async () => undefined);
    expect(observed?.identity).toMatchObject({ tenantId: "tenant-a" });
    expect(JSON.stringify(observed?.metadata).length).toBeLessThan(20_000);
    expect(() => { (observed!.identity as any).tenantId = "other"; }).toThrow();
    expect((observed!.identity as any).tenantId).toBe("tenant-a");
    await pipeline.close();
  });
});
