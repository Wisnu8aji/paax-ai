export const CHAT_EVENT_TYPES = [
  "turn.started",
  "assistant.delta",
  "assistant.interim",
  "reasoning.delta",
  "tool.drafting",
  "tool.started",
  "tool.progress",
  "tool.completed",
  "tool.failed",
  "tool.interrupted",
  "source.added",
  "artifact.created",
  "artifact.processing",
  "artifact.ready",
  "artifact.failed",
  "turn.completed",
  "turn.interrupted",
  "turn.failed",
  "conversation.updated",
] as const;

export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];

export interface ChatEventBase {
  type: ChatEventType;
  event_id: string;
  conversation_id: string;
  turn_id: string;
  sequence: number;
  timestamp: string;
  runtime_id?: string;
}

export interface ChatModelMetadata {
  alias: string;
  display_name: string;
  provider?: string;
  provider_model?: string;
  reasoning_effort?: string;
  thinking?: "on" | "off";
}

export interface ChatSourceRef {
  source_id: string;
  title: string;
  uri?: string;
  snippet?: string;
  provenance: string;
  locator?: string;
}

export type ChatArtifactStatus = "created" | "processing" | "ready" | "failed";

export interface ChatArtifactRef {
  artifact_id: string;
  name: string;
  media_type: string;
  status: ChatArtifactStatus;
  size_bytes?: number;
  download_url?: string;
  error?: string;
}

type Event<T extends ChatEventType, P extends Record<string, unknown> = Record<string, never>> =
  ChatEventBase & { type: T } & P;

export type ChatEvent =
  | Event<"turn.started", { model: ChatModelMetadata; request_message_id?: string; request_text?: string }>
  | Event<"assistant.delta", { delta: string; part_id?: string }>
  | Event<"assistant.interim", { message: string; phase?: string; part_id?: string }>
  | Event<"reasoning.delta", { delta: string; visibility: "private" | "visible" }>
  | Event<"tool.drafting", { tool_call_id: string; tool: string; label?: string }>
  | Event<"tool.started", { tool_call_id: string; tool: string; label?: string }>
  | Event<"tool.progress", { tool_call_id: string; message?: string; progress?: number }>
  | Event<"tool.completed", { tool_call_id: string; tool: string; summary?: string; result_ref?: string }>
  | Event<"tool.failed", { tool_call_id: string; tool: string; error: string }>
  | Event<"tool.interrupted", { tool_call_id: string; tool: string; reason?: string }>
  | Event<"source.added", { source: ChatSourceRef }>
  | Event<"artifact.created", { artifact: ChatArtifactRef }>
  | Event<"artifact.processing", { artifact_id: string }>
  | Event<"artifact.ready", { artifact_id: string; download_url?: string }>
  | Event<"artifact.failed", { artifact_id: string; error: string }>
  | Event<"turn.completed", { final_markdown?: string }>
  | Event<"turn.interrupted", { reason?: string; resumable: boolean }>
  | Event<"turn.failed", { error: string }>
  | Event<"conversation.updated", { title?: string; pinned?: boolean; archived?: boolean }>;

export function isChatEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ChatEventBase>;
  return Boolean(
    typeof event.type === "string" && (CHAT_EVENT_TYPES as readonly string[]).includes(event.type) &&
      typeof event.event_id === "string" && event.event_id.length > 0 &&
      typeof event.conversation_id === "string" && event.conversation_id.length > 0 &&
      typeof event.turn_id === "string" && event.turn_id.length > 0 &&
      typeof event.sequence === "number" && Number.isSafeInteger(event.sequence) && event.sequence >= 0 &&
      typeof event.timestamp === "string" && event.timestamp.length > 0,
  );
}

export function normalizeChatEvent(value: unknown): ChatEvent | null {
  return isChatEvent(value) ? value : null;
}
