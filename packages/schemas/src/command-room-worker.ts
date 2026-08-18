import { z } from "zod";

const boundedId = z.string().min(1).max(256);

export const GatewayChannelSchema = z.enum(["command_room", "agent_runs"]);

export const GatewaySessionSourceSchema = z.object({
  channel: GatewayChannelSchema,
  conversationId: boundedId,
  projectId: boundedId.optional(),
  threadId: boundedId.optional(),
  workspaceId: boundedId.optional(),
  snapshotId: boundedId.optional(),
  documentRevisionId: boundedId.optional(),
}).strict();

export const GatewayCommandRoomSessionSourceSchema = GatewaySessionSourceSchema.extend({
  channel: z.literal("command_room"),
});

export const GatewayTurnMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(32_000),
}).strict();

export const GatewayReasoningEffortSchema = z.enum(["low", "medium", "high", "max"]);
export const GatewayThinkingSchema = z.enum(["on", "off"]);
export const GatewayRequestStyleSchema = z.enum(["chat-completions", "responses"]);

export const GatewayTurnRequestSchema = z.object({
  mode: z.literal("work"),
  runId: boundedId.optional(),
  session: GatewayCommandRoomSessionSourceSchema,
  messages: z.array(GatewayTurnMessageSchema).min(1).max(40),
  modelAlias: z.string().min(1).max(64),
  reasoningEffort: GatewayReasoningEffortSchema.default("high"),
  thinking: GatewayThinkingSchema.default("on"),
  clientCorrelationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/).optional(),
}).strict();

export const GatewayBindingSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().min(1),
  actorId: z.string().min(1),
  conversationId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  snapshotId: z.string().min(1).optional(),
  documentRevisionId: z.string().min(1).optional(),
}).strict();

export const GatewayModelProfileSchema = z.object({
  alias: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  transport: z.enum(["openai-compatible", "native"]),
  requestStyle: GatewayRequestStyleSchema.default("chat-completions"),
  supportsThinking: z.boolean(),
  selectedEffort: GatewayReasoningEffortSchema,
  thinking: GatewayThinkingSchema,
  reasoningEffortMap: z.record(z.string()).optional(),
}).strict();

export const GatewayPromptSectionSizesSchema = z.object({
  stable: z.number().int().nonnegative(),
  context: z.number().int().nonnegative(),
  volatile: z.number().int().nonnegative(),
}).strict();

export const GatewayPromptMetadataSchema = z.object({
  version: z.string().min(1),
  stableHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  sectionSizes: GatewayPromptSectionSizesSchema,
  injectionFindings: z.array(z.string()),
}).strict();

export const GatewayTurnPreparedSchema = z.object({
  protocolVersion: z.literal("command-room.gateway.v1"),
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionKeyFingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/),
  binding: GatewayBindingSchema,
  profile: GatewayModelProfileSchema,
  prompt: GatewayPromptMetadataSchema,
  handoff: z.enum(["service-conversation-loop", "legacy-web-provider"]),
}).strict();

export const GatewayWorkEventTypeSchema = z.enum([
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
]);

const WorkTaskSchema = z.object({
  id: boundedId,
  title: boundedId,
  state: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]),
  detail: z.string().max(16_000).optional(),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
}).strict();

const WorkToolSchema = z.object({
  toolId: boundedId,
  name: boundedId,
  state: z.enum(["generating", "running", "completed", "failed"]),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  summary: z.string().max(16_000).optional(),
  progress: z.string().max(16_000).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
}).strict();

const WorkApprovalSchema = z.object({
  approvalId: boundedId,
  action: boundedId,
  reason: z.string().min(1).max(16_000),
  args: z.unknown().optional(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  state: z.enum(["pending", "approved", "denied", "expired"]),
}).strict();

const WorkArtifactSchema = z.object({
  artifactId: boundedId,
  name: boundedId,
  kind: z.string().max(256).optional(),
  uri: z.string().max(2_048).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  summary: z.string().max(16_000).optional(),
  createdAt: z.string().min(1).optional(),
}).strict();

const WorkLogSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  text: z.string().min(1).max(16_000),
}).strict();

const workEventCommon = {
  runId: boundedId,
  conversationId: boundedId,
  eventId: boundedId,
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().min(1),
} as const;

function workEvent<TType extends z.ZodLiteral<string>, TShape extends z.ZodRawShape>(type: TType, shape: TShape) {
  return z.object({ ...workEventCommon, type, ...shape }).strict();
}

const WorkEventTurnStartedSchema = workEvent(z.literal("turn.started"), {
  phase: z.string().max(256).optional(),
  statusLabel: z.string().max(256).optional(),
  statusDetail: z.string().max(16_000).optional(),
});
const WorkEventStatusSchema = workEvent(z.literal("status.update"), {
  phase: z.string().max(256).optional(),
  statusLabel: z.string().max(256).optional(),
  statusDetail: z.string().max(16_000).optional(),
});
const WorkEventInterimSchema = workEvent(z.literal("assistant.interim"), { message: z.string().max(16_000) });
const WorkEventReasoningSchema = workEvent(z.literal("reasoning.delta"), { delta: z.string().max(16_000) });
const WorkEventPlanSchema = workEvent(z.literal("plan.updated"), { tasks: z.array(WorkTaskSchema).max(256) });
const WorkEventToolGeneratingSchema = workEvent(z.literal("tool.generating"), { tool: WorkToolSchema });
const WorkEventToolStartedSchema = workEvent(z.literal("tool.started"), { tool: WorkToolSchema });
const WorkEventToolProgressSchema = workEvent(z.literal("tool.progress"), {
  tool: WorkToolSchema.optional(),
  progress: z.string().max(16_000).optional(),
});
const WorkEventToolCompletedSchema = workEvent(z.literal("tool.completed"), { tool: WorkToolSchema });
const WorkEventToolRiskSchema = workEvent(z.literal("tool.output_risk"), {
  tool: WorkToolSchema,
  summary: z.string().max(16_000).optional(),
});
const WorkEventApprovalRequestedSchema = workEvent(z.literal("approval.requested"), { approval: WorkApprovalSchema });
const WorkEventApprovalResolvedSchema = workEvent(z.literal("approval.resolved"), { approval: WorkApprovalSchema });
const WorkEventSubagentStartedSchema = workEvent(z.literal("subagent.started"), { summary: z.string().max(16_000).optional() });
const WorkEventSubagentProgressSchema = workEvent(z.literal("subagent.progress"), { progress: z.string().max(16_000).optional() });
const WorkEventSubagentCompletedSchema = workEvent(z.literal("subagent.completed"), { summary: z.string().max(16_000).optional() });
const WorkEventBackgroundSchema = workEvent(z.literal("background.completed"), { summary: z.string().max(16_000).optional() });
const WorkEventArtifactSchema = workEvent(z.literal("artifact.created"), { artifact: WorkArtifactSchema });
const WorkEventLogSchema = workEvent(z.literal("log.line"), { log: WorkLogSchema });
const WorkEventAssistantDeltaSchema = workEvent(z.literal("assistant.delta"), { delta: z.string().max(16_000) });
const WorkEventCompletedSchema = workEvent(z.literal("turn.completed"), {
  finalMarkdown: z.string().max(32_000).optional(),
  stopReason: z.string().max(256).optional(),
});
const WorkEventErrorSchema = workEvent(z.literal("error"), {
  errorCode: z.string().max(256).optional(),
  errorMessage: z.string().max(16_000).optional(),
  retryable: z.boolean().optional(),
});

export const GatewayWorkEventSchema = z.discriminatedUnion("type", [
  WorkEventTurnStartedSchema,
  WorkEventStatusSchema,
  WorkEventInterimSchema,
  WorkEventReasoningSchema,
  WorkEventPlanSchema,
  WorkEventToolGeneratingSchema,
  WorkEventToolStartedSchema,
  WorkEventToolProgressSchema,
  WorkEventToolCompletedSchema,
  WorkEventToolRiskSchema,
  WorkEventApprovalRequestedSchema,
  WorkEventApprovalResolvedSchema,
  WorkEventSubagentStartedSchema,
  WorkEventSubagentProgressSchema,
  WorkEventSubagentCompletedSchema,
  WorkEventBackgroundSchema,
  WorkEventArtifactSchema,
  WorkEventLogSchema,
  WorkEventAssistantDeltaSchema,
  WorkEventCompletedSchema,
  WorkEventErrorSchema,
]);

export type GatewayChannel = z.infer<typeof GatewayChannelSchema>;
export type GatewaySessionSource = z.infer<typeof GatewaySessionSourceSchema>;
export type GatewayCommandRoomSessionSource = z.infer<typeof GatewayCommandRoomSessionSourceSchema>;
export type GatewayTurnMessage = z.infer<typeof GatewayTurnMessageSchema>;
export type GatewayTurnRequest = z.infer<typeof GatewayTurnRequestSchema>;
export type GatewayBinding = z.infer<typeof GatewayBindingSchema>;
export type GatewayModelProfile = z.infer<typeof GatewayModelProfileSchema>;
export type GatewayRequestStyle = z.infer<typeof GatewayRequestStyleSchema>;
export type GatewayPromptSectionSizes = z.infer<typeof GatewayPromptSectionSizesSchema>;
export type GatewayPromptMetadata = z.infer<typeof GatewayPromptMetadataSchema>;
export type GatewayTurnPrepared = z.infer<typeof GatewayTurnPreparedSchema>;
export type GatewayWorkEventType = z.infer<typeof GatewayWorkEventTypeSchema>;
export type GatewayWorkEvent = z.infer<typeof GatewayWorkEventSchema>;
