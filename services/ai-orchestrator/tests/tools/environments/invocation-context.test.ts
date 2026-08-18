import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolExecutionContext, toolBindingFingerprint, validateToolExecutionContext } from "../../../src/tools/environments/invocation-context";
import { LocalEnvironment } from "../../../src/tools/environments/local";
import type { ProjectContextBinding } from "../../../src/agentic/types";
import type { ToolPolicy } from "../../../src/tools/types";

const binding: ProjectContextBinding = {
  tenantId: "tenant-1",
  projectId: "project-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  allowedToolScopes: ["workspace:read"],
  issuedAt: "2026-08-18T00:00:00.000Z",
};

const readPolicy: ToolPolicy = { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", scope: "workspace:read" };

describe("immutable invocation context and environment ownership", () => {
  it("binds policy/project/tool identity into a deterministic fingerprint", () => {
    const context = createToolExecutionContext({ runId: "run-1", turnId: "turn-1", toolCallId: "call-1", invocationId: "run-1:call-1", toolName: "file_read", binding, policy: readPolicy });
    expect(context.bindingFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.binding)).toBe(true);
    expect(validateToolExecutionContext(context, { runId: "run-1", toolCallId: "call-1", invocationId: "run-1:call-1", toolName: "file_read", binding, policy: readPolicy })).toEqual({ ok: true });
    expect(validateToolExecutionContext({ ...context, bindingFingerprint: "0".repeat(64) }, { toolName: "file_read" })).toMatchObject({ ok: false, errorCode: "invocation_context_invalid" });
  });

  it("requires an unexpired receipt for an approval-bound context", () => {
    const base = { runId: "run-1", turnId: "turn-1", toolCallId: "call-1", invocationId: "run-1:call-1", toolName: "terminal_run", binding, policy: { ...readPolicy, approval: "always" as const, sideEffect: "external" as const, riskTier: "high" as const, scope: "workspace:read" } };
    const snapshot = { tenantId: binding.tenantId, projectId: binding.projectId, actorId: binding.actorId, conversationId: binding.conversationId, allowedToolScopes: binding.allowedToolScopes, issuedAt: binding.issuedAt };
    const fingerprint = toolBindingFingerprint({ ...base, binding: snapshot });
    const context = createToolExecutionContext({ ...base, approval: { approvalId: "approval-1", bindingFingerprint: fingerprint, decidedAt: 1_000, expiresAt: 5_000 } });
    expect(validateToolExecutionContext(context, { toolName: "terminal_run", now: 2_000, requireApproval: true })).toEqual({ ok: true });
    expect(validateToolExecutionContext(context, { toolName: "terminal_run", now: 5_000, requireApproval: true })).toMatchObject({ ok: false, errorCode: "approval_expired" });
  });

  it("makes LocalEnvironment independently check context identity, root, and policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "paax-invocation-"));
    try {
      await writeFile(join(root, "README.md"), "workspace", "utf8");
      const environment = new LocalEnvironment({ root });
      const executionContext = createToolExecutionContext({ ...{ runId: "run-1", turnId: "turn-1", toolCallId: "call-1", invocationId: "run-1:call-1", toolName: "file_read", binding, policy: readPolicy }, environmentRoot: environment.scope.root });
      const allowed = await environment.execute({ operation: "read", permission: "workspace_read", path: "README.md", audit: { runId: "run-1", toolCallId: "call-1", invocationId: "run-1:call-1", actor: "agent" }, executionContext });
      expect(allowed).toMatchObject({ ok: true, decision: "allowed" });
      const mismatch = await environment.execute({ operation: "read", permission: "workspace_read", path: "README.md", audit: { runId: "run-1", toolCallId: "other-call", invocationId: "run-1:call-1", actor: "agent" }, executionContext });
      expect(mismatch).toMatchObject({ ok: false, decision: "invocation_context_invalid", errorCode: "binding_mismatch" });
      const traversal = await environment.execute({ operation: "read", permission: "workspace_read", path: "../outside.txt", audit: { runId: "run-1", toolCallId: "call-1", invocationId: "run-1:call-1", actor: "agent" }, executionContext });
      expect(traversal.ok).toBe(false);
      await environment.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
