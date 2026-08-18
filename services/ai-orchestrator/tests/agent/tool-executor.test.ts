import { describe, expect, it, vi } from "vitest";
import { ApprovalService } from "../../src/agentic/approval-service";
import { buildPrompt } from "../../src/agent/prompt-builder";
import { TurnContext, type TurnTokenBudget } from "../../src/agent/turn-context";
import { TurnJournal } from "../../src/agent/turn-state";
import { ToolExecutor, type ToolExecutorEvent } from "../../src/agent/tool-executor";
import type { ProjectContextBinding } from "../../src/agentic/types";
import type { ToolDefinition, ToolPolicyMetadata } from "../../src/tools/types";
import { InMemorySessionStore } from "../../src/gateway/session";

const binding: ProjectContextBinding = {
  tenantId: "tenant-1",
  projectId: "project-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  allowedToolScopes: ["workspace:read"],
  issuedAt: new Date().toISOString(),
};

const budget: TurnTokenBudget = { maxInputTokens: 2_000, maxOutputTokens: 1_000, maxTotalTokens: 3_000, maxToolResultBytes: 4_000 };

async function context() {
  return contextForProject("project-1");
}

async function contextForProject(projectId?: string) {
  const session = await new InMemorySessionStore().resolve({
    channel: "command_room",
    tenantId: binding.tenantId,
    actorId: binding.actorId,
    conversationId: binding.conversationId,
    ...(projectId ? { projectId } : {}),
  });
  const prompt = buildPrompt({
    stable: { locale: "id-ID", channel: "command_room", profileName: "test" },
    session: { channel: "command_room", ...binding, ...(projectId ? { projectId } : {}) },
    messages: [{ role: "user", content: "test" }],
    workspaceSnapshot: [], memorySummaries: [], skillSummaries: [], now: "2026-08-18T00:00:00.000Z",
  });
  return TurnContext.create({ runId: "run-1", session, prompt, messages: [{ role: "user", content: "test" }], tokenBudget: budget, provenance: { source: "test", version: "1" }, now: "2026-08-18T00:00:00.000Z" });
}

function tool(name: string, policy: ToolPolicyMetadata, execute: ToolDefinition["execute"]): ToolDefinition {
  return { declaration: { name, description: name, parameters: { type: "OBJECT", properties: {} } }, policy, execute };
}

const readPolicy: ToolPolicyMetadata = { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe" };
const writePolicy: ToolPolicyMetadata = { available: true, riskTier: "high", sideEffect: "write", approval: "always", concurrency: "sequential" };

describe("canonical ToolExecutor", () => {
  it("allows an unbound turn when the executor binding has a project fallback", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const executor = new ToolExecutor({ registry: [tool("read-unbound", readPolicy, handler)], binding, journal: new TurnJournal(), approvals: new ApprovalService() });

    const result = await executor.execute([{ id: "call-unbound", name: "read-unbound", arguments: {} }], await contextForProject(), new AbortController().signal);

    expect(result[0]).toMatchObject({ status: "completed", result: { ok: true } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("still rejects an explicitly conflicting project binding", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const executor = new ToolExecutor({ registry: [tool("read-conflict", readPolicy, handler)], binding, journal: new TurnJournal(), approvals: new ApprovalService() });

    const result = await executor.execute([{ id: "call-conflict-binding", name: "read-conflict", arguments: {} }], await contextForProject("project-2"), new AbortController().signal);

    expect(result[0]).toMatchObject({ status: "failed", result: { errorCode: "tool_binding_conflict" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns structured errors for unknown or malformed calls without invoking a handler", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const executor = new ToolExecutor({ registry: [tool("known", readPolicy, handler)], binding, journal: new TurnJournal(), approvals: new ApprovalService() });
    const result = await executor.execute([
      { id: "unknown-1", name: "not_registered", arguments: {} },
      { id: "bad-1", name: "known", arguments: [] as unknown as Record<string, unknown> },
    ], await context(), new AbortController().signal);

    expect(result.map((item) => item.status)).toEqual(["failed", "failed"]);
    expect(result.map((item) => item.result.errorCode)).toEqual(["tool_not_registered", "tool_call_invalid"]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("journals before handler side effect and replays completed idempotent calls", async () => {
    const journal = new TurnJournal();
    let journalStatus = "missing";
    const handler = vi.fn(async (_args, params) => {
      journalStatus = journal.list().find((item) => item.toolCallId === params?.toolCallId)?.status ?? "missing";
      return { ok: true, secret: "do-not-leak" };
    });
    const executor = new ToolExecutor({ registry: [tool("read", readPolicy, handler)], binding, journal, approvals: new ApprovalService() });
    const call = { id: "call-1", name: "read", arguments: {} };
    const first = await executor.execute([call], await context(), new AbortController().signal);
    const second = await executor.execute([call], await context(), new AbortController().signal);

    expect(journalStatus).toBe("running");
    expect(first[0]).toMatchObject({ status: "completed", result: { ok: true } });
    expect(JSON.stringify(first)).not.toContain("do-not-leak");
    expect(second[0]).toEqual(first[0]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("forces side-effecting tools to run sequentially even in concurrent mode", async () => {
    let active = 0;
    let maximum = 0;
    const handler = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { ok: true };
    });
    const approvals = new ApprovalService();
    const events: ToolExecutorEvent[] = [];
    const executor = new ToolExecutor({ registry: [tool("write", writePolicy, handler)], binding, journal: new TurnJournal(), approvals, onEvent: (event) => events.push(event), mode: "concurrent" });
    const resultPromise = executor.execute([
      { id: "write-1", name: "write", arguments: {} },
      { id: "write-2", name: "write", arguments: {} },
    ], await context(), new AbortController().signal);
    await Promise.resolve();
    const firstApproval = events.find((item) => item.type === "approval.requested");
    expect(firstApproval).toBeDefined();
    approvals.decide(String(firstApproval?.approvalId), "approver", ["owner"], "approved", undefined, { tenantId: binding.tenantId, projectId: binding.projectId, conversationId: binding.conversationId, runId: "run-1" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const secondApproval = events.filter((item) => item.type === "approval.requested")[1];
    expect(secondApproval).toBeDefined();
    approvals.decide(String(secondApproval?.approvalId), "approver", ["owner"], "approved", undefined, { tenantId: binding.tenantId, projectId: binding.projectId, conversationId: binding.conversationId, runId: "run-1" });
    const result = await resultPromise;
    expect(result.every((item) => item.status === "completed")).toBe(true);
    expect(maximum).toBe(1);
  });

  it("waits for approval and never invokes a rejected side effect", async () => {
    const handler = vi.fn(async () => ({ executed: true }));
    const events: ToolExecutorEvent[] = [];
    const approvals = new ApprovalService();
    const executor = new ToolExecutor({ registry: [tool("write", writePolicy, handler)], binding, journal: new TurnJournal(), approvals, onEvent: (event) => events.push(event) });
    const resultPromise = executor.execute([{ id: "call-approval", name: "write", arguments: {} }], await context(), new AbortController().signal);
    await Promise.resolve();
    const requested = events.find((event) => event.type === "approval.requested");
    expect(requested).toBeDefined();
    approvals.decide(String(requested?.approvalId), "approver", ["owner"], "rejected", undefined, { tenantId: binding.tenantId, projectId: binding.projectId, conversationId: binding.conversationId, runId: "run-1" });
    const result = await resultPromise;
    expect(result[0]).toMatchObject({ status: "rejected", result: { errorCode: "approval_denied" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a conflict for an idempotency key reused with changed input", async () => {
    const handler = vi.fn(async () => ({ executed: true }));
    const journal = new TurnJournal();
    const executor = new ToolExecutor({ registry: [tool("read", readPolicy, handler)], binding, journal, approvals: new ApprovalService() });
    const first = await executor.execute([{ id: "call-conflict", name: "read", arguments: { path: "one.txt" } }], await context(), new AbortController().signal);
    const second = await executor.execute([{ id: "call-conflict", name: "read", arguments: { path: "two.txt" } }], await context(), new AbortController().signal);

    expect(first[0]).toMatchObject({ status: "completed" });
    expect(second[0]).toMatchObject({ status: "failed", result: { errorCode: "tool_idempotency_conflict" } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(journal.snapshot().entries).toHaveLength(1);
  });

  it("records approval abort as terminal before any handler invocation", async () => {
    const handler = vi.fn(async () => ({ executed: true }));
    const journal = new TurnJournal();
    const approvals = new ApprovalService();
    const events: ToolExecutorEvent[] = [];
    const executor = new ToolExecutor({ registry: [tool("write", writePolicy, handler)], binding, journal, approvals, onEvent: (event) => events.push(event) });
    const controller = new AbortController();
    const resultPromise = executor.execute([{ id: "call-abort", name: "write", arguments: {} }], await context(), controller.signal);
    await vi.waitFor(() => expect(events.some((event) => event.type === "approval.requested")).toBe(true));
    controller.abort();

    const result = await resultPromise;
    expect(result[0]).toMatchObject({ status: "rejected", result: { errorCode: "approval_aborted" } });
    expect(journal.snapshot().entries[0]).toMatchObject({ status: "aborted", errorCode: "aborted" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("records a handler exception as failed and preserves monotonic journal sequence", async () => {
    const journal = new TurnJournal();
    const handler = vi.fn(async () => { throw new Error("expected handler failure"); });
    const executor = new ToolExecutor({ registry: [tool("read", readPolicy, handler)], binding, journal, approvals: new ApprovalService() });
    const contextValue = await context();
    await executor.execute([{ id: "call-fail-1", name: "read", arguments: {} }], contextValue, new AbortController().signal);
    await executor.execute([{ id: "call-fail-2", name: "read", arguments: {} }], contextValue, new AbortController().signal);

    expect(journal.snapshot().entries.map((entry) => entry.status)).toEqual(["failed", "failed"]);
    expect(journal.snapshot().entries.map((entry) => entry.sequence)).toEqual([0, 1]);
  });

  it("passes an immutable invocation-bound execution context after preflight and journal creation", async () => {
    const contexts: unknown[] = [];
    const handler = vi.fn(async (_args, params) => {
      contexts.push(params?.executionContext);
      return { ok: true };
    });
    const executor = new ToolExecutor({ registry: [tool("read-context", readPolicy, handler)], binding, journal: new TurnJournal(), approvals: new ApprovalService() });

    const result = await executor.execute([{ id: "call-context", name: "read-context", arguments: {} }], await context(), new AbortController().signal);

    expect(result[0].status).toBe("completed");
    expect(contexts[0]).toMatchObject({ runId: "run-1", turnId: "run-1", toolCallId: "call-context", toolName: "read-context", source: "canonical-tool-adapter" });
    expect((contexts[0] as { bindingFingerprint: string }).bindingFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(contexts[0])).toBe(true);
    expect(Object.isFrozen((contexts[0] as { policy: unknown }).policy)).toBe(true);
  });
});
