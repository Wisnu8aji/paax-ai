import { GatewayWorkEventSchema, GatewayWorkEventTypeSchema } from "@paax/schemas";
import type { GatewayCommandRoomSessionSource, GatewayWorkEventType } from "@paax/schemas";

export const WORK_EVENT_TYPES = GatewayWorkEventTypeSchema.options;

export type WorkEventType = GatewayWorkEventType;

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

export interface WorkArtifact {
  artifactId: string;
  name: string;
  kind?: string;
  uri?: string;
  sizeBytes?: number;
  summary?: string;
  createdAt?: string;
}

export type WorkSessionBinding = GatewayCommandRoomSessionSource;

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
  artifact?: WorkArtifact;
  progress?: string;
  log?: { level: "debug" | "info" | "warn" | "error"; text: string };
  errorMessage?: string;
  finalMarkdown?: string;
  [key: string]: unknown;
}

export interface WorkSessionSnapshot {
  sessionId: string;
  title: string;
  binding?: WorkSessionBinding;
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
  artifacts: WorkArtifact[];
  logs: Array<{ level: "debug" | "info" | "warn" | "error"; text: string; timestamp: string }>;
  pendingApproval: WorkApprovalRequest | null;
  lastSequence: number;
  updatedAt: string;
  errorMessage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeWorkEvent(value: unknown): WorkEvent | null {
  if (!isRecord(value) || !nonEmptyString(value.type) || !nonEmptyString(value.runId) || !nonEmptyString(value.conversationId) || !nonEmptyString(value.eventId) || !nonEmptyString(value.timestamp)) return null;
  const parsed = GatewayWorkEventSchema.safeParse(value);
  return parsed.success ? parsed.data as WorkEvent : null;
}
