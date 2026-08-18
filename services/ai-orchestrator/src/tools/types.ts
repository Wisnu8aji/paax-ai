import type { GeminiFunctionDeclaration } from "../gemini/types";
import type { ProjectContextBinding } from "../agentic/types";

export interface RabLineSnapshot {
  id: string;
  ahsp_code: string;
  volume: number | null;
  duration_days: number | null;
  ahsp_suggested?: boolean;
}

export interface ScheduleTaskSnapshot {
  id: string;
  name: string;
  duration_days: number;
  early_start: number;
  early_finish: number;
  late_start: number;
  late_finish: number;
  total_float: number;
  is_critical: boolean;
  start_date: string;
  end_date: string;
}

export interface ScheduleSnapshot {
  project_duration_days: number;
  project_start_date: string;
  project_end_date: string;
  tasks: ScheduleTaskSnapshot[];
  critical_path: string[];
  s_curve: Record<string, unknown> | null;
}

export interface ChatContext {
  project_id?: string;
  conversation_id?: string;
  rab_lines?: RabLineSnapshot[];
  schedule?: ScheduleSnapshot | Record<string, unknown>;
}

export interface ToolExecutionParams {
  context?: ChatContext;
  executionContext?: ToolExecutionContext;
  binding?: ProjectContextBinding;
  signal?: AbortSignal;
  approvalGranted?: boolean;
  runId?: string;
  toolCallId?: string;
  invocationId?: string;
}

export type ToolRiskTier = "low" | "medium" | "high" | "critical";
export type ToolSideEffect = "none" | "read" | "write" | "external";
export type ToolApprovalMode = "never" | "on-risk" | "always";
export type ToolConcurrency = "safe" | "sequential";
export type ToolExecutionMode = "auto" | "concurrent" | "sequential";

export interface ToolPolicyMetadata {
  available: boolean;
  riskTier: ToolRiskTier;
  sideEffect: ToolSideEffect;
  approval: ToolApprovalMode;
  concurrency: ToolConcurrency;
  scope?: string;
  timeoutMs?: number;
  executionMode?: ToolExecutionMode;
  requiresApproval?: boolean;
}

export type ToolPolicy = ToolPolicyMetadata;

export interface ToolApprovalReceipt {
  readonly approvalId: string;
  readonly bindingFingerprint: string;
  readonly decidedAt: number;
  readonly expiresAt?: number;
}

export interface ToolBindingSnapshot {
  readonly tenantId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly conversationId: string;
  readonly allowedToolScopes: readonly string[];
  readonly issuedAt?: string;
  readonly snapshotId?: string;
  readonly documentRevisionId?: string;
}

export interface ToolExecutionContext {
  readonly runId: string;
  readonly turnId: string;
  readonly toolCallId: string;
  readonly invocationId: string;
  readonly toolName: string;
  readonly source: "canonical-tool-adapter";
  readonly bindingFingerprint: string;
  readonly policy: Readonly<ToolPolicy>;
  readonly binding?: ToolBindingSnapshot;
  readonly environmentRoot?: string;
  readonly approval?: ToolApprovalReceipt;
}

export interface ToolDefinition {
  declaration: GeminiFunctionDeclaration;
  execute: (args: Record<string, unknown>, params?: ToolExecutionParams) => Promise<Record<string, unknown>> | Record<string, unknown>;
  summarize?: (result: Record<string, unknown>) => string;
  policy?: ToolPolicyMetadata;
  toolset?: string | readonly string[];
  scope?: string;
  provenance?: Readonly<Record<string, string>>;
}

export function summarizeResult(result: Record<string, unknown>): string {
  if (typeof result.error === "string") return `error: ${result.error}`;
  if (Array.isArray(result.candidates)) return `${result.candidates.length} kandidat ditemukan`;
  if (typeof result.available === "boolean") return result.available ? "data tersedia" : "data tidak tersedia";
  return "hasil tool diterima";
}
