import type { ProjectContextBinding } from "../agentic/types";
import { ApprovalService, type ActionRiskTier } from "../agentic/approval-service";
import type { ProviderToolCall } from "../providers/base";
import { TurnJournal, hashToolInput, type TurnJournalRecord } from "./turn-state";
import type { ToolExecutionResult } from "./conversation-loop";
import { getToolPolicy, toolRequiresApproval } from "../tools/tool-policy";
import type { ToolDefinition, ToolExecutionContext, ToolPolicyMetadata } from "../tools/types";
import type { TurnContext } from "./turn-context";
import { preflightToolCall } from "./tool-guardrails";
import { createToolApprovalReceipt, createToolExecutionContext, toolBindingFingerprint } from "../tools/environments/invocation-context";
import type { ToolApprovalReceipt } from "../tools/types";

export type ToolExecutionMode = "sequential" | "concurrent" | "auto";

export type ToolExecutorEvent =
  | { type: "tool.generating"; toolId: string; name: string }
  | { type: "tool.started"; toolId: string; name: string }
  | { type: "tool.completed"; toolId: string; name: string; status: ToolExecutionResult["status"]; summary?: string }
  | { type: "approval.requested"; approvalId: string; toolId: string; name: string; action: string; expiresAt: string }
  | { type: "approval.resolved"; approvalId: string; toolId: string; name: string; state: "approved" | "denied" | "expired" };

export interface ToolExecutorOptions {
  registry: readonly ToolDefinition[];
  binding: ProjectContextBinding;
  journal: TurnJournal;
  approvals: ApprovalService;
  mode?: ToolExecutionMode;
  toolTimeoutMs?: number;
  approvalTtlMs?: number;
  approvalRoles?: readonly string[];
  maxResultBytes?: number;
  onEvent?: (event: ToolExecutorEvent) => void;
}

const MAX_TIMEOUT_MS = 120_000;
const MAX_RESULT_BYTES = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, fallback: string, limit = 16_000): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]").replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]").slice(0, limit);
}

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return safeText(value, "", 32_000);
  if (Array.isArray(value)) return value.slice(0, 256).map((item) => safeValue(item, depth + 1));
  if (!isRecord(value)) return "[UNSUPPORTED]";
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 256)) {
    if (/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)/i.test(key)) result[key] = "[REDACTED]";
    else result[key] = safeValue(child, depth + 1);
  }
  return result;
}

function boundedResult(value: unknown, maxBytes: number): Record<string, unknown> {
  const safe = safeValue(value);
  if (isRecord(safe)) {
    const bytes = Buffer.byteLength(JSON.stringify(safe), "utf8");
    if (bytes <= maxBytes) return safe;
    return { truncated: true, message: "hasil tool melebihi batas dan dipotong" };
  }
  return { value: safe };
}

function actionRisk(policy: ToolPolicyMetadata): ActionRiskTier {
  if (policy.riskTier === "critical") return "R4";
  if (policy.riskTier === "high") return "R3";
  if (policy.riskTier === "medium") return "R2";
  return "R0";
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function bindingMatchesContext(binding: ProjectContextBinding, context: TurnContext): boolean {
  const internal = context.snapshot().internal;
  return internal.tenantId === binding.tenantId
    && internal.actorId === binding.actorId
    && internal.conversationId === binding.conversationId
    && (!binding.projectId || !internal.projectId || internal.projectId === binding.projectId);
}

function invalidCall(call: ProviderToolCall): ToolExecutionResult {
  return {
    toolCallId: typeof call?.id === "string" ? call.id : "invalid-tool-call",
    name: typeof call?.name === "string" ? call.name : "unknown",
    status: "failed",
    result: { errorCode: "tool_call_invalid", message: "panggilan tool tidak valid" },
    summary: "panggilan tool tidak valid",
  };
}

export class ToolExecutor {
  private readonly tools: ReadonlyMap<string, ToolDefinition>;
  private readonly mode: ToolExecutionMode;
  private readonly timeoutMs: number;
  private readonly approvalTtlMs: number;
  private readonly approvalRoles: readonly string[];
  private readonly maxResultBytes: number;

  constructor(private readonly options: ToolExecutorOptions) {
    const map = new Map<string, ToolDefinition>();
    for (const tool of options.registry) {
      const name = tool.declaration.name;
      if (map.has(name)) throw new Error(`duplicate canonical tool registration: ${name}`);
      map.set(name, tool);
    }
    this.tools = map;
    this.mode = options.mode ?? "auto";
    this.timeoutMs = Math.max(1, Math.min(options.toolTimeoutMs ?? 30_000, MAX_TIMEOUT_MS));
    this.approvalTtlMs = Math.max(1, Math.min(options.approvalTtlMs ?? 300_000, 10 * 60_000));
    this.approvalRoles = Object.freeze([...(options.approvalRoles ?? ["owner"])].filter((role) => role.trim()).slice(0, 8));
    this.maxResultBytes = Math.max(1_024, Math.min(options.maxResultBytes ?? MAX_RESULT_BYTES, MAX_RESULT_BYTES));
  }

  async execute(calls: readonly ProviderToolCall[], context: TurnContext, signal: AbortSignal): Promise<readonly ToolExecutionResult[]> {
    if (!bindingMatchesContext(this.options.binding, context)) {
      return calls.map((call) => ({
        toolCallId: typeof call?.id === "string" ? call.id : "invalid-tool-call",
        name: typeof call?.name === "string" ? call.name : "unknown",
        status: "failed" as const,
        result: { errorCode: "tool_binding_conflict", message: "tool scope tidak cocok dengan turn" },
        summary: "binding tool ditolak",
      }));
    }
    const concurrent = this.canRunConcurrently(calls);
    if (this.mode !== "sequential" && concurrent) {
      const results = await Promise.allSettled(calls.map((call) => this.executeOne(call, context, signal)));
      return results.map((result, index) => result.status === "fulfilled" ? result.value : this.failedResult(calls[index], "tool_execution_failed", "tool gagal dieksekusi"));
    }
    const output: ToolExecutionResult[] = [];
    for (const call of calls) output.push(await this.executeOne(call, context, signal));
    return output;
  }

  private canRunConcurrently(calls: readonly ProviderToolCall[]): boolean {
    if (calls.length < 2) return false;
    return calls.every((call) => {
      if (!isRecord(call) || typeof call.id !== "string" || typeof call.name !== "string" || !isRecord(call.arguments)) return false;
      const tool = this.tools.get(call.name);
      if (!tool) return false;
      const policy = getToolPolicy(tool);
      return policy.available && policy.concurrency === "safe" && policy.executionMode !== "sequential" && !toolRequiresApproval(tool, call.arguments);
    });
  }

  private async executeOne(call: ProviderToolCall, context: TurnContext, signal: AbortSignal): Promise<ToolExecutionResult> {
    const preflight = preflightToolCall({ registry: this.options.registry, call, allowedScopes: this.options.binding.allowedToolScopes });
    if (!preflight.ok) return this.failedResult(call, preflight.errorCode, preflight.message);
    const tool = preflight.tool;
    const policy = preflight.policy;

    const inputHash = hashToolInput(context.snapshot().runId, call.id, call.name, call.arguments);
    const idempotencyKey = `${context.snapshot().runId}:${call.id}`;
    const contextBinding = {
      tenantId: this.options.binding.tenantId,
      projectId: this.options.binding.projectId,
      actorId: this.options.binding.actorId,
      conversationId: this.options.binding.conversationId,
      allowedToolScopes: [...this.options.binding.allowedToolScopes],
      ...(this.options.binding.issuedAt ? { issuedAt: this.options.binding.issuedAt } : {}),
      ...(this.options.binding.snapshotId ? { snapshotId: this.options.binding.snapshotId } : {}),
      ...(this.options.binding.documentRevisionId ? { documentRevisionId: this.options.binding.documentRevisionId } : {}),
    } as const;
    const invocationBindingFingerprint = toolBindingFingerprint({ runId: context.snapshot().runId, turnId: context.snapshot().runId, toolCallId: call.id, invocationId: `${context.snapshot().runId}:${call.id}`, toolName: call.name, binding: contextBinding, policy });
    let queued: { record: TurnJournalRecord; replayed: boolean };
    try {
      const begin = this.options.journal.beginExecution({
        turnId: context.snapshot().runId,
        invocationId: `${context.snapshot().runId}:${call.id}`,
        idempotencyKey,
        runId: context.snapshot().runId,
        toolCallId: call.id,
        name: call.name,
        inputHash,
      });
      if (begin.kind === "conflict") return this.failedResult(call, "tool_idempotency_conflict", "tool invocation idempotency conflict");
      queued = { record: begin.record, replayed: begin.kind === "replay" };
    } catch {
      return this.failedResult(call, "tool_idempotency_conflict", "tool invocation idempotency conflict");
    }
    if (queued.replayed) {
      if (queued.record.status === "completed" && queued.record.result) return { toolCallId: call.id, name: call.name, status: "completed", result: queued.record.result, ...(queued.record.summary ? { summary: queued.record.summary } : {}) };
      if (queued.record.status === "rejected") return { toolCallId: call.id, name: call.name, status: "rejected", result: queued.record.result ?? { errorCode: "approval_denied", message: "approval tidak diberikan" }, summary: queued.record.summary };
      if (queued.record.status === "failed") return { toolCallId: call.id, name: call.name, status: "failed", result: queued.record.result ?? { errorCode: queued.record.errorCode ?? "tool_execution_failed", message: "tool gagal dieksekusi" }, summary: queued.record.summary };
      return this.failedResult(call, "tool_invocation_in_progress", "tool invocation sedang berjalan");
    }

    this.emit({ type: "tool.generating", toolId: call.id, name: call.name });
    const requiresApproval = toolRequiresApproval(tool, call.arguments);
    let approvalGranted = false;
    let approvalReceipt: ToolApprovalReceipt | undefined;
    if (requiresApproval) {
      const approval = this.options.approvals.request(this.options.binding, context.snapshot().runId, call.id, call.name, actionRisk(policy), [...this.approvalRoles], this.approvalTtlMs, { argumentsHash: inputHash, bindingFingerprint: invocationBindingFingerprint });
      this.options.journal.transition(queued.record.invocationId, "awaiting_approval", { approvalId: approval.approvalId });
      this.emit({ type: "approval.requested", approvalId: approval.approvalId, toolId: call.id, name: call.name, action: call.name, expiresAt: approval.expiresAt });
      let decision;
      try {
        decision = await this.options.approvals.waitForDecision(approval.approvalId, this.options.binding, signal);
      } catch (error) {
        try {
          this.options.approvals.decideScoped(
            approval.approvalId,
            "system",
            this.approvalRoles,
            "rejected",
            "approval wait aborted",
            {
              tenantId: this.options.binding.tenantId,
              projectId: this.options.binding.projectId,
              conversationId: this.options.binding.conversationId,
              runId: context.snapshot().runId,
              argumentsHash: inputHash,
              bindingFingerprint: invocationBindingFingerprint,
            },
          );
        } catch { /* an already-resolved/expired request is already fail-closed */ }
        this.emit({ type: "approval.resolved", approvalId: approval.approvalId, toolId: call.id, name: call.name, state: "denied" });
        this.options.journal.transition(queued.record.invocationId, "aborted", { errorCode: "aborted" });
        return { toolCallId: call.id, name: call.name, status: "rejected", result: { errorCode: "approval_aborted", message: "approval menunggu dibatalkan" }, summary: "approval dibatalkan" };
      }
      const state = decision.status === "approved" ? "approved" : decision.status === "expired" ? "expired" : "denied";
      this.emit({ type: "approval.resolved", approvalId: approval.approvalId, toolId: call.id, name: call.name, state });
      if (decision.status !== "approved") {
        this.options.journal.transition(queued.record.invocationId, "rejected", { errorCode: "approval_denied", summary: "approval tidak diberikan" });
        return { toolCallId: call.id, name: call.name, status: "rejected", result: { errorCode: "approval_denied", message: "approval tidak diberikan" }, summary: "approval tidak diberikan" };
      }
      approvalGranted = true;
      approvalReceipt = createToolApprovalReceipt({ approvalId: decision.approvalId, bindingFingerprint: invocationBindingFingerprint, decidedAt: Date.now(), expiresAt: Date.parse(decision.expiresAt) });
    }

    if (signal.aborted) {
      this.options.journal.transition(queued.record.invocationId, "aborted", { errorCode: "aborted" });
      return { toolCallId: call.id, name: call.name, status: "rejected", result: { errorCode: "tool_aborted", message: "tool dibatalkan" }, summary: "tool dibatalkan" };
    }
    this.options.journal.transition(queued.record.invocationId, "running");
    this.emit({ type: "tool.started", toolId: call.id, name: call.name });
    try {
      const executionContext: ToolExecutionContext = createToolExecutionContext({
        runId: context.snapshot().runId,
        turnId: context.snapshot().runId,
        toolCallId: call.id,
        invocationId: queued.record.invocationId,
        toolName: call.name,
        binding: this.options.binding,
        policy,
        ...(approvalReceipt ? { approval: approvalReceipt } : {}),
      });
      const result = await this.runHandler(tool, call.arguments, context, signal, approvalGranted, call.id, queued.record.invocationId, policy.timeoutMs, executionContext);
      const safeResult = boundedResult(result, this.maxResultBytes);
      const summary = safeText(tool.summarize?.(safeResult), "hasil tool diterima");
      this.options.journal.transition(queued.record.invocationId, "completed", { result: safeResult, summary });
      this.emit({ type: "tool.completed", toolId: call.id, name: call.name, status: "completed", summary });
      return { toolCallId: call.id, name: call.name, status: "completed", result: safeResult, summary };
    } catch (error) {
      const errorCode = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "tool_aborted" : error instanceof Error && error.message === "tool timeout" ? "tool_timeout" : "tool_execution_failed";
      const summary = errorCode === "tool_timeout" ? "tool timeout" : errorCode === "tool_aborted" ? "tool dibatalkan" : "tool gagal dieksekusi";
      const result = { errorCode, message: summary };
      this.options.journal.transition(queued.record.invocationId, errorCode === "tool_aborted" ? "aborted" : "failed", { result, summary, errorCode });
      this.emit({ type: "tool.completed", toolId: call.id, name: call.name, status: "failed", summary });
      return { toolCallId: call.id, name: call.name, status: "failed", result, summary };
    }
  }

  private async runHandler(tool: ToolDefinition, args: Record<string, unknown>, context: TurnContext, signal: AbortSignal, approvalGranted: boolean, toolCallId: string, invocationId: string, policyTimeoutMs: number | undefined, executionContext: ToolExecutionContext): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    let rejectAbort!: (error: Error) => void;
    const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => { controller.abort(); rejectAbort(abortError("tool aborted")); };
    signal.addEventListener("abort", onAbort, { once: true });
    let rejectTimeout!: (error: Error) => void;
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timeoutMs = Math.max(1, Math.min(policyTimeoutMs ?? this.timeoutMs, MAX_TIMEOUT_MS));
    const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error("tool timeout")); }, timeoutMs);
    try {
      if (signal.aborted) throw abortError("tool aborted");
      const result = await Promise.race([
        Promise.resolve(tool.execute(args, { binding: this.options.binding, signal: controller.signal, approvalGranted, runId: context.snapshot().runId, toolCallId, invocationId, executionContext })),
        timeoutPromise,
        abortPromise,
      ]);
      if (!isRecord(result)) return { value: result };
      return result;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  private failedResult(call: ProviderToolCall, errorCode: string, message: string): ToolExecutionResult {
    return { toolCallId: typeof call?.id === "string" ? call.id : "invalid-tool-call", name: typeof call?.name === "string" ? call.name : "unknown", status: "failed", result: { errorCode, message }, summary: message };
  }

  private emit(event: ToolExecutorEvent): void {
    try { this.options.onEvent?.(event); } catch { /* event delivery cannot authorize a tool */ }
  }
}
