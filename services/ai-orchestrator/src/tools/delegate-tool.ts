import type { SubagentBudget, SubagentLifecycle, SubagentRequest } from "../agent/subagent-lifecycle";
import type { ToolDefinition } from "./types";

export type RegisteredTool = ToolDefinition;

export interface DelegateToolOptions {
  lifecycle: SubagentLifecycle;
  parentBindingId: string;
  parentRunId: string;
  parentTurnId: string;
  allowedScopes: readonly string[];
  allowedTools: readonly string[];
  tenantId?: string;
  parentSessionId?: string;
  budget?: SubagentBudget;
  now?: () => string;
}

function listArg(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 128);
}

function boundaryResult(code: string, subagentId?: string, status: "rejected" | "accepted" = "rejected"): Record<string, unknown> {
  return {
    available: false,
    executed: false,
    status,
    code,
    ...(subagentId ? { subagentId } : {}),
    reason: "Child conversation execution belum tersedia pada Phase 4.",
  };
}

export function createDelegateTool(options: DelegateToolOptions): RegisteredTool {
  const allowedScopes = new Set(options.allowedScopes);
  const allowedTools = new Set(options.allowedTools);
  return {
    declaration: {
      name: "delegate_task",
      description: "Request a bounded child task through the guarded Phase 4 boundary.",
      parameters: {
        type: "OBJECT",
        properties: {
          task: { type: "STRING", description: "Child task description." },
          requested_scopes: { type: "ARRAY", description: "Requested capability scopes." },
          requested_tools: { type: "ARRAY", description: "Requested tool names." },
          idempotency_key: { type: "STRING", description: "Stable request key." },
          depth: { type: "INTEGER", description: "Nested delegation depth; Phase 4 accepts only zero." },
        },
        required: ["task", "idempotency_key"],
      },
    },
    execute: async (args) => {
      const requestedScopes = listArg(args.requested_scopes);
      const requestedTools = listArg(args.requested_tools);
      const request: SubagentRequest = {
        parentRunId: options.parentRunId,
        parentTurnId: options.parentTurnId,
        bindingId: options.parentBindingId,
        depth: typeof args.depth === "number" ? args.depth : 0,
        task: typeof args.task === "string" ? args.task : "",
        requestedScopes,
        requestedTools,
        idempotencyKey: typeof args.idempotency_key === "string" ? args.idempotency_key.trim() : "",
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
        ...(options.parentSessionId ? { parentSessionId: options.parentSessionId } : {}),
        ...(options.budget ? { budget: { ...options.budget } } : {}),
      };
      if (requestedScopes.some((scope) => !allowedScopes.has(scope)) || requestedTools.some((tool) => !allowedTools.has(tool))) {
        return boundaryResult("scope_escalation");
      }
      const decision = options.lifecycle.guard(request);
      if (!decision.allowed) return boundaryResult(decision.code);
      const record = await options.lifecycle.request(request);
      if (record.status !== "rejected" && options.lifecycle.execute) {
        const result = await options.lifecycle.execute(record.subagentId);
        return {
          available: true,
          executed: result.status !== "rejected",
          status: result.status,
          subagentId: record.subagentId,
          result: {
            summary: result.summary.slice(0, 4_000),
            ...(result.content ? { content: result.content.slice(0, 32_000) } : {}),
            stopReason: result.stopReason,
            usage: result.usage,
            evidenceRefs: result.evidenceRefs.slice(0, 64),
          },
        };
      }
      return boundaryResult(record.errorCode ?? "delegation_not_in_phase", record.subagentId, record.status === "rejected" ? "rejected" : "accepted");
    },
    summarize: () => "delegation boundary dicatat; child execution belum tersedia",
  };
}
