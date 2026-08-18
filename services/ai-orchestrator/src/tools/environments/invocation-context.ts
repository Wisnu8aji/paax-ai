import { createHash } from "node:crypto";
import type { ProjectContextBinding } from "../../agentic/types";
import type { ToolApprovalReceipt, ToolBindingSnapshot, ToolExecutionContext, ToolPolicy } from "../types";

export interface ToolExecutionContextInput {
  readonly runId: string;
  readonly turnId: string;
  readonly toolCallId: string;
  readonly invocationId: string;
  readonly toolName: string;
  readonly binding: ProjectContextBinding | ToolBindingSnapshot;
  readonly policy: ToolPolicy;
  readonly approval?: ToolApprovalReceipt;
  readonly environmentRoot?: string;
}

export interface ToolExecutionContextExpectation {
  readonly runId?: string;
  readonly turnId?: string;
  readonly toolCallId?: string;
  readonly invocationId?: string;
  readonly toolName: string;
  readonly binding?: ProjectContextBinding | ToolBindingSnapshot;
  readonly policy?: ToolPolicy;
  readonly now?: number;
  readonly requireApproval?: boolean;
  readonly environmentRoot?: string;
}

export type ToolExecutionContextValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errorCode: "invocation_context_invalid" | "approval_missing" | "approval_expired" | "binding_mismatch" | "policy_mismatch"; readonly message: string };

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
  return value;
}

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000\r\n]/u.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function bindingSnapshot(binding: ProjectContextBinding | ToolBindingSnapshot): ToolBindingSnapshot {
  return {
    tenantId: requiredId(binding.tenantId, "tenantId"),
    projectId: requiredId(binding.projectId, "projectId"),
    actorId: requiredId(binding.actorId, "actorId"),
    conversationId: requiredId(binding.conversationId, "conversationId"),
    allowedToolScopes: Object.freeze([...binding.allowedToolScopes].map((scope) => requiredId(scope, "allowedToolScope"))),
    ...(binding.issuedAt ? { issuedAt: requiredId(binding.issuedAt, "issuedAt") } : {}),
    ...(binding.snapshotId ? { snapshotId: requiredId(binding.snapshotId, "snapshotId") } : {}),
    ...(binding.documentRevisionId ? { documentRevisionId: requiredId(binding.documentRevisionId, "documentRevisionId") } : {}),
  };
}

export function toolBindingFingerprint(input: { runId: string; turnId: string; toolCallId: string; invocationId: string; toolName: string; binding: ToolBindingSnapshot; policy: ToolPolicy }): string {
  const material = JSON.stringify(stable({
    runId: input.runId,
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    invocationId: input.invocationId,
    toolName: input.toolName,
    binding: input.binding,
    policy: input.policy,
  }));
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function createToolApprovalReceipt(input: { approvalId: string; bindingFingerprint: string; decidedAt?: number; expiresAt?: number }): ToolApprovalReceipt {
  const approvalId = requiredId(input.approvalId, "approvalId");
  if (!/^[a-f0-9]{64}$/u.test(input.bindingFingerprint)) throw new Error("approval binding fingerprint is invalid");
  const decidedAt = input.decidedAt ?? Date.now();
  if (!Number.isFinite(decidedAt) || decidedAt < 0) throw new Error("approval decidedAt is invalid");
  if (input.expiresAt !== undefined && (!Number.isFinite(input.expiresAt) || input.expiresAt <= decidedAt)) throw new Error("approval expiresAt is invalid");
  return Object.freeze({ approvalId, bindingFingerprint: input.bindingFingerprint, decidedAt, ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}) });
}

export function createToolExecutionContext(input: ToolExecutionContextInput): ToolExecutionContext {
  const runId = requiredId(input.runId, "runId");
  const turnId = requiredId(input.turnId, "turnId");
  const toolCallId = requiredId(input.toolCallId, "toolCallId");
  const invocationId = requiredId(input.invocationId, "invocationId");
  const toolName = requiredId(input.toolName, "toolName");
  const binding = bindingSnapshot(input.binding);
  const policy = freezeDeep({ ...input.policy });
  if (policy.available !== true) throw new Error("execution context requires an available policy");
  const bindingFingerprint = toolBindingFingerprint({ runId, turnId, toolCallId, invocationId, toolName, binding, policy });
  if (input.approval && input.approval.bindingFingerprint !== bindingFingerprint) throw new Error("approval binding fingerprint does not match invocation");
  return freezeDeep({
    runId,
    turnId,
    toolCallId,
    invocationId,
    toolName,
    source: "canonical-tool-adapter" as const,
    bindingFingerprint,
    policy,
    binding,
    ...(input.environmentRoot ? { environmentRoot: requiredId(input.environmentRoot, "environmentRoot") } : {}),
    ...(input.approval ? { approval: createToolApprovalReceipt(input.approval) } : {}),
  });
}

function sameBinding(left: ToolBindingSnapshot, right: ToolBindingSnapshot): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function samePolicy(left: ToolPolicy, right: ToolPolicy): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function validateToolExecutionContext(context: ToolExecutionContext | undefined, expected: ToolExecutionContextExpectation): ToolExecutionContextValidation {
  if (!context || context.source !== "canonical-tool-adapter" || !context.binding) return { ok: false, errorCode: "invocation_context_invalid", message: "canonical invocation context is required" };
  if (expected.runId !== undefined && context.runId !== expected.runId) return { ok: false, errorCode: "binding_mismatch", message: "invocation run binding does not match" };
  if (expected.turnId !== undefined && context.turnId !== expected.turnId) return { ok: false, errorCode: "binding_mismatch", message: "invocation turn binding does not match" };
  if (expected.toolCallId !== undefined && context.toolCallId !== expected.toolCallId) return { ok: false, errorCode: "binding_mismatch", message: "invocation tool call binding does not match" };
  if (expected.invocationId !== undefined && context.invocationId !== expected.invocationId) return { ok: false, errorCode: "binding_mismatch", message: "invocation id binding does not match" };
  if (context.toolName !== expected.toolName) return { ok: false, errorCode: "binding_mismatch", message: "invocation tool binding does not match" };
  if (expected.binding && !sameBinding(context.binding, bindingSnapshot(expected.binding))) return { ok: false, errorCode: "binding_mismatch", message: "invocation project binding does not match" };
  if (expected.policy && !samePolicy(context.policy, expected.policy)) return { ok: false, errorCode: "policy_mismatch", message: "invocation policy does not match" };
  if (expected.environmentRoot !== undefined && context.environmentRoot !== expected.environmentRoot) return { ok: false, errorCode: "binding_mismatch", message: "invocation environment root does not match" };
  const recomputed = toolBindingFingerprint({ runId: context.runId, turnId: context.turnId, toolCallId: context.toolCallId, invocationId: context.invocationId, toolName: context.toolName, binding: context.binding, policy: context.policy });
  if (recomputed !== context.bindingFingerprint) return { ok: false, errorCode: "invocation_context_invalid", message: "invocation fingerprint is invalid" };
  const now = expected.now ?? Date.now();
  if (context.approval) {
    if (context.approval.bindingFingerprint !== context.bindingFingerprint) return { ok: false, errorCode: "invocation_context_invalid", message: "approval fingerprint is invalid" };
    if (context.approval.decidedAt > now || (context.approval.expiresAt !== undefined && context.approval.expiresAt <= now)) return { ok: false, errorCode: "approval_expired", message: "approval receipt is expired" };
  }
  if (expected.requireApproval && !context.approval) return { ok: false, errorCode: "approval_missing", message: "approval receipt is required" };
  return { ok: true };
}

export function validateEnvironmentInvocation(input: { executionContext?: ToolExecutionContext; runId: string; toolCallId: string; invocationId: string; toolName: string; operation: "list" | "read" | "search" | "command"; now?: number }): ToolExecutionContextValidation {
  if (!input.executionContext) return { ok: true };
  const expectedTool = input.operation === "list" ? "workspace_list" : input.operation === "read" ? "file_read" : input.operation === "search" ? "file_search" : "terminal_run";
  if (input.toolName !== expectedTool) return { ok: false, errorCode: "binding_mismatch", message: "environment tool binding does not match" };
  const contextCheck = validateToolExecutionContext(input.executionContext, {
    runId: input.runId,
    toolCallId: input.toolCallId,
    invocationId: input.invocationId,
    toolName: expectedTool,
    now: input.now,
    requireApproval: input.executionContext.policy.approval === "always" || input.executionContext.policy.requiresApproval === true,
  });
  return contextCheck;
}
