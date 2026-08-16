export const WORK_EVENT_TYPES = [
  "turn.started",
  "status.update",
  "assistant.interim",
  "reasoning.delta",
  "plan.updated",
  "tool.generating",
  "tool.started",
  "tool.progress",
  "tool.completed",
  "tool.output_risk",
  "approval.requested",
  "approval.resolved",
  "subagent.started",
  "subagent.progress",
  "subagent.completed",
  "background.completed",
  "artifact.created",
  "log.line",
  "assistant.delta",
  "turn.completed",
  "error",
] as const;

export type WorkEventType = (typeof WORK_EVENT_TYPES)[number];

export type WorkTaskState = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export interface WorkTask {
  id: string;
  title: string;
  state: WorkTaskState;
  detail?: string;
  startedAt?: string;
  completedAt?: string;
}

export type WorkToolState = "generating" | "running" | "completed" | "failed";

export interface WorkToolRecord {
  toolId: string;
  name: string;
  state: WorkToolState;
  args?: unknown;
  result?: unknown;
  summary?: string;
  progress?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkApprovalRequest {
  approvalId: string;
  action: string;
  reason: string;
  args?: unknown;
  createdAt: string;
  expiresAt: string;
  state: "pending" | "approved" | "denied" | "expired";
}

export interface WorkEvent {
  type: WorkEventType;
  runId: string;
  conversationId: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  phase?: string;
  statusLabel?: string;
  statusDetail?: string;
  delta?: string;
  message?: string;
  summary?: string;
  tasks?: WorkTask[];
  task?: WorkTask;
  tool?: WorkToolRecord;
  approval?: WorkApprovalRequest;
  progress?: string;
  log?: { level: "debug" | "info" | "warn" | "error"; text: string };
  errorMessage?: string;
  finalMarkdown?: string;
  [key: string]: unknown;
}

export interface WorkSessionSnapshot {
  sessionId: string;
  title: string;
  runId: string | null;
  state: "idle" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
  phase: string;
  prompt: string;
  tasks: WorkTask[];
  tools: WorkToolRecord[];
  events: WorkEvent[];
  commentary: string[];
  reasoning: string;
  answer: string;
  logs: Array<{ level: "debug" | "info" | "warn" | "error"; text: string; timestamp: string }>;
  pendingApproval: WorkApprovalRequest | null;
  lastSequence: number;
  updatedAt: string;
  errorMessage?: string;
}

const WORK_EVENT_TYPE_SET = new Set<string>(WORK_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeWorkEvent(value: unknown): WorkEvent | null {
  if (!isRecord(value)) return null;
  if (!nonEmptyString(value.type) || !WORK_EVENT_TYPE_SET.has(value.type)) return null;
  if (!nonEmptyString(value.runId) || !nonEmptyString(value.conversationId)) return null;
  if (!nonEmptyString(value.eventId)) return null;
  if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return null;
  if (!nonEmptyString(value.timestamp)) return null;

  return value as WorkEvent;
}
