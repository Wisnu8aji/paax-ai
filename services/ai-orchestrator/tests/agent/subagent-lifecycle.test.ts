import { describe, expect, it } from "vitest";
import {
  DurableSubagentLifecycle,
  InMemorySubagentLifecycle,
  type SubagentRequest,
} from "../../src/agent/subagent-lifecycle";
import { SessionDB } from "../../src/state/session-db";

const baseRequest: SubagentRequest = {
  parentRunId: "run-parent",
  parentTurnId: "turn-parent",
  bindingId: "binding-1",
  depth: 0,
  task: "Inspect the bounded workspace boundary",
  requestedScopes: ["workspace.read"],
  requestedTools: ["workspace_list"],
  idempotencyKey: "delegate-1",
};

function lifecycle() {
  return new InMemorySubagentLifecycle({
    parentRunId: "run-parent",
    parentTurnId: "turn-parent",
    parentBindingId: "binding-1",
    allowedScopes: ["workspace.read", "workspace.search"],
    allowedTools: ["workspace_list", "file_search"],
    now: () => "2026-08-18T00:00:00.000Z",
  });
}

describe("SubagentLifecycle Phase 4 boundary", () => {
  it("rejects recursion, binding mismatch, and capability escalation", () => {
    const instance = lifecycle();
    expect(instance.guard({ ...baseRequest, depth: 1 }).code).toBe("recursion_denied");
    expect(instance.guard({ ...baseRequest, bindingId: "binding-other" }).code).toBe("binding_mismatch");
    expect(instance.guard({ ...baseRequest, requestedScopes: ["workspace.write"] }).code).toBe("scope_escalation");
    expect(instance.guard({ ...baseRequest, requestedTools: ["terminal_run"] }).code).toBe("scope_escalation");
  });

  it("records accepted requests as an explicit Phase 4 rejection without starting a child loop", async () => {
    const instance = lifecycle();
    const record = await instance.request(baseRequest);

    expect(record.status).toBe("rejected");
    expect(record.errorCode).toBe("delegation_not_in_phase");
    expect(record.request).toMatchObject({ parentRunId: "run-parent", bindingId: "binding-1" });
    expect(instance.get(record.subagentId)).toEqual(record);
    expect(instance.get(record.subagentId)?.resultRef).toBeUndefined();
  });

  it("replays the same idempotency key and keeps returned records isolated", async () => {
    const instance = lifecycle();
    const first = await instance.request(baseRequest);
    const replay = await instance.request(baseRequest);
    expect(replay.subagentId).toBe(first.subagentId);
    expect(replay).not.toBe(first);
    expect(replay.request).not.toBe(first.request);
  });

  it("rejects malformed requests with an auditable record", async () => {
    const instance = lifecycle();
    const record = await instance.request({ ...baseRequest, task: " ", idempotencyKey: "bad key" });
    expect(record.status).toBe("rejected");
    expect(["invalid_request", "delegation_not_in_phase"]).toContain(record.errorCode);
  });
});

describe("DurableSubagentLifecycle", () => {
  it("executes one isolated bounded child through the injected executor and persists lineage metadata", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    db.createOrGetSession({ sessionId: "parent-session", keyFingerprint: "parent-fp", tenantId: "tenant-a", actorId: "actor-a", channel: "command_room", conversationId: "conversation-a" });
    const lifecycle = new DurableSubagentLifecycle({
      db,
      enabled: true,
      parentRunId: "run-parent",
      parentTurnId: "turn-parent",
      parentBindingId: "binding-1",
      parentSessionId: "parent-session",
      tenantId: "tenant-a",
      allowedScopes: ["workspace.read"],
      allowedTools: ["workspace_list"],
      childSessionIdFactory: async ({ subagentId }) => {
        db.createOrGetSession({ sessionId: `child-session-${subagentId}`, keyFingerprint: `fp-${subagentId}`, tenantId: "tenant-a", actorId: "actor-a", channel: "command_room", conversationId: `child:${subagentId}` });
        return `child-session-${subagentId}`;
      },
      now: () => "2026-08-18T00:00:00.000Z",
      executor: { execute: async (input) => ({ summary: `completed:${input.task}`, content: "bounded child result", stopReason: "completed", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, evidenceRefs: ["evidence-1"] }) },
    });
    const request = { ...baseRequest, tenantId: "tenant-a", parentSessionId: "parent-session", budget: { maxDepth: 1, maxDurationMs: 1000, maxIterations: 2, maxToolCalls: 1, maxTotalTokens: 100 } };
    expect(lifecycle.guard(request).code).toBe("allowed");
    const record = await lifecycle.request(request);
    const result = await lifecycle.execute(record.subagentId);
    expect(result).toMatchObject({ summary: "completed:Inspect the bounded workspace boundary", evidenceRefs: ["evidence-1"] });
    expect(lifecycle.get(record.subagentId)).toMatchObject({ status: "completed" });
    expect(db.getSubagent(record.subagentId)).toMatchObject({ status: "completed", tenantId: "tenant-a" });
    expect(db.getSubagent(record.subagentId)).toMatchObject({ childSessionId: `child-session-${record.subagentId}` });
    db.close();
  });

  it("rejects disabled, recursive, binding-mismatched, and forbidden capabilities", async () => {
    const lifecycle = new DurableSubagentLifecycle({ parentRunId: "run-parent", parentTurnId: "turn-parent", parentBindingId: "binding-1", allowedScopes: ["workspace.read"], allowedTools: ["workspace_list"], enabled: false });
    expect(lifecycle.guard(baseRequest).code).toBe("disabled");
    const enabled = new DurableSubagentLifecycle({ parentRunId: "run-parent", parentTurnId: "turn-parent", parentBindingId: "binding-1", allowedScopes: ["workspace.read"], allowedTools: ["workspace_list", "delegate_task"], enabled: true });
    expect(enabled.guard({ ...baseRequest, depth: 1 }).code).toBe("recursion_denied");
    expect(enabled.guard({ ...baseRequest, bindingId: "other" }).code).toBe("binding_mismatch");
    expect(enabled.guard({ ...baseRequest, requestedTools: ["delegate_task"] }).code).toBe("forbidden_capability");
    const rejected = await enabled.request({ ...baseRequest, depth: 1 });
    expect(rejected.status).toBe("rejected");
    await expect(enabled.execute(rejected.subagentId)).resolves.toMatchObject({ status: "rejected" });
  });
});
