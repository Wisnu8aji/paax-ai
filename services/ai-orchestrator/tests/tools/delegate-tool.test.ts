import { describe, expect, it } from "vitest";
import { createDelegateTool } from "../../src/tools/delegate-tool";
import { InMemorySubagentLifecycle } from "../../src/agent/subagent-lifecycle";
import type { SubagentLifecycle } from "../../src/agent/subagent-lifecycle";

describe("delegate_task boundary", () => {
  it("uses the injected lifecycle and never starts a child provider loop", async () => {
    const tool = createDelegateTool({
      lifecycle: new InMemorySubagentLifecycle({
        parentRunId: "run-parent",
        parentTurnId: "turn-parent",
        parentBindingId: "binding-1",
        allowedScopes: ["workspace.read"],
        allowedTools: ["workspace_list"],
        now: () => "2026-08-18T00:00:00.000Z",
      }),
      parentBindingId: "binding-1",
      parentRunId: "run-parent",
      parentTurnId: "turn-parent",
      allowedScopes: ["workspace.read"],
      allowedTools: ["workspace_list"],
      now: () => "2026-08-18T00:00:00.000Z",
    });

    const result = await tool.execute({
      task: "Inspect workspace",
      requested_scopes: ["workspace.read"],
      requested_tools: ["workspace_list"],
      idempotency_key: "delegate-1",
    });

    expect(result).toMatchObject({ available: false, executed: false, code: "delegation_not_in_phase", status: "rejected" });
    expect(result).toHaveProperty("subagentId");
  });

  it("returns explicit validation denial instead of throwing", async () => {
    const tool = createDelegateTool({
      lifecycle: new InMemorySubagentLifecycle({ parentBindingId: "binding-1" }),
      parentBindingId: "binding-1",
      parentRunId: "run-parent",
      parentTurnId: "turn-parent",
      allowedScopes: [],
      allowedTools: [],
    });
    const result = await tool.execute({ task: "", idempotency_key: "bad key" });
    expect(result).toMatchObject({ available: false, executed: false, status: "rejected" });
  });

  it("returns a bounded structured result when the lifecycle provides execution", async () => {
    const lifecycle: SubagentLifecycle = {
      guard: () => ({ allowed: true, code: "allowed" }),
      request: async () => ({ subagentId: "subagent-1", request: {} as never, status: "queued", createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z" }),
      get: () => undefined,
      transition: async () => { throw new Error("unused"); },
      execute: async () => ({ status: "completed", summary: "child summary", stopReason: "completed", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, evidenceRefs: [] }),
    };
    const tool = createDelegateTool({ lifecycle, parentBindingId: "binding-1", parentRunId: "run-parent", parentTurnId: "turn-parent", allowedScopes: ["workspace.read"], allowedTools: ["workspace_list"] });
    await expect(tool.execute({ task: "Inspect", requested_scopes: ["workspace.read"], requested_tools: ["workspace_list"], idempotency_key: "delegate-structured" })).resolves.toMatchObject({ available: true, executed: true, status: "completed", result: { summary: "child summary" } });
  });
});
