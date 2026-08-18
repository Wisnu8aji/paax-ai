import type {
  ChatArtifactRef,
  ChatEvent,
  ChatModelMetadata,
  ChatSourceRef,
} from "./command-room-chat-contract";

export type ToolPartState = "drafting" | "running" | "completed" | "failed" | "interrupted";
export type ActivityPartState = "active" | "completed" | "failed" | "interrupted";

export interface TextMessagePart {
  kind: "text";
  partId: string;
  order: number;
  createdAt: string;
  text: string;
}

export interface InterimMessagePart {
  kind: "interim";
  partId: string;
  order: number;
  createdAt: string;
  text: string;
  phase?: string;
  sealed: boolean;
}

export interface ReasoningMessagePart {
  kind: "reasoning";
  partId: string;
  order: number;
  createdAt: string;
  text: string;
}

export interface ToolMessagePart {
  kind: "tool";
  partId: string;
  order: number;
  createdAt: string;
  toolCallId: string;
  tool: string;
  label: string;
  state: ToolPartState;
  message?: string;
  progress?: number;
  summary?: string;
  error?: string;
  resultRef?: string;
  completedAt?: string;
}

export interface SourceGroupMessagePart {
  kind: "source_group";
  partId: string;
  order: number;
  createdAt: string;
  sourceIds: string[];
}

export interface ArtifactMessagePart {
  kind: "artifact";
  partId: string;
  order: number;
  createdAt: string;
  artifactId: string;
}

export interface AttachmentMessagePart {
  kind: "attachment";
  partId: string;
  order: number;
  createdAt: string;
  attachmentId: string;
  name: string;
  status: "staged" | "processing" | "ready" | "failed";
  error?: string;
}

export interface ErrorMessagePart {
  kind: "error";
  partId: string;
  order: number;
  createdAt: string;
  text: string;
}

export type OrderedMessagePart =
  | TextMessagePart
  | InterimMessagePart
  | ReasoningMessagePart
  | ToolMessagePart
  | SourceGroupMessagePart
  | ArtifactMessagePart
  | AttachmentMessagePart
  | ErrorMessagePart;

export interface ActivityProjection {
  id: string;
  label: string;
  state: ActivityPartState;
  detail?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ChatTurnState {
  conversationId: string;
  turnId: string;
  status: "running" | "completed" | "interrupted" | "failed";
  model?: ChatModelMetadata;
  parts: OrderedMessagePart[];
  reasoningText: string;
  tools: ToolMessagePart[];
  sources: ChatSourceRef[];
  artifacts: ChatArtifactRef[];
  activity: ActivityProjection[];
  lastSequence: number;
  seenEventIds: string[];
  completedAt?: string;
  error?: string;
  interruptReason?: string;
  resumable?: boolean;
  conversationTitle?: string;
  pinned?: boolean;
  archived?: boolean;
}

const TERMINAL_STATUSES = new Set<ChatTurnState["status"]>(["completed", "interrupted", "failed"]);

export function createChatTurnState(conversationId: string, turnId: string): ChatTurnState {
  return {
    conversationId,
    turnId,
    status: "running",
    parts: [],
    reasoningText: "",
    tools: [],
    sources: [],
    artifacts: [],
    activity: [],
    lastSequence: -1,
    seenEventIds: [],
  };
}

function appendPart(state: ChatTurnState, part: OrderedMessagePart): OrderedMessagePart[] {
  return [...state.parts, { ...part, order: state.parts.length }];
}

function upsertActivity(
  state: ChatTurnState,
  id: string,
  label: string,
  at: string,
  patch: Partial<Pick<ActivityProjection, "state" | "detail" | "completedAt">> = {},
): ActivityProjection[] {
  const index = state.activity.findIndex((item) => item.id === id);
  if (index < 0) return [...state.activity, { id, label, state: patch.state ?? "active", detail: patch.detail, startedAt: at, completedAt: patch.completedAt }];
  const next = [...state.activity];
  next[index] = {
    ...next[index],
    label: label || next[index].label,
    ...patch,
  };
  return next;
}

function appendOrCoalesceText(state: ChatTurnState, delta: string, at: string, partId = "assistant:text"): OrderedMessagePart[] {
  const parts = state.parts.map((part) => part.kind === "interim" && !part.sealed ? { ...part, sealed: true } : part);
  const index = parts.findIndex((part) => part.kind === "text" && part.partId === partId);
  if (index >= 0) {
    const current = parts[index];
    if (current.kind === "text") {
      parts[index] = { ...current, text: current.text + delta };
      return parts;
    }
  }
  return [...parts, { kind: "text", partId, order: parts.length, createdAt: at, text: delta }];
}

function upsertToolPart(state: ChatTurnState, patch: Partial<ToolMessagePart> & Pick<ToolMessagePart, "toolCallId" | "tool" | "state" | "label" | "createdAt">): { parts: OrderedMessagePart[]; tools: ToolMessagePart[] } {
  const existingIndex = state.parts.findIndex((part) => part.kind === "tool" && part.toolCallId === patch.toolCallId);
  const existing = existingIndex >= 0 && state.parts[existingIndex].kind === "tool" ? state.parts[existingIndex] : undefined;
  const nextTool: ToolMessagePart = {
    kind: "tool",
    partId: existing?.partId ?? `tool:${patch.toolCallId}`,
    order: existing?.order ?? state.parts.length,
    createdAt: existing?.createdAt ?? patch.createdAt,
    toolCallId: patch.toolCallId,
    tool: patch.tool,
    label: patch.label || existing?.label || patch.tool.replaceAll("_", " "),
    state: patch.state,
    message: patch.message ?? existing?.message,
    progress: patch.progress ?? existing?.progress,
    summary: patch.summary ?? existing?.summary,
    error: patch.error ?? existing?.error,
    resultRef: patch.resultRef ?? existing?.resultRef,
    completedAt: patch.completedAt ?? existing?.completedAt,
  };
  const parts = existingIndex >= 0
    ? state.parts.map((part, index) => index === existingIndex ? nextTool : part)
    : appendPart(state, nextTool);
  const tools = parts.filter((part): part is ToolMessagePart => part.kind === "tool");
  return { parts, tools };
}

function upsertArtifact(artifacts: ChatArtifactRef[], incoming: ChatArtifactRef): ChatArtifactRef[] {
  const index = artifacts.findIndex((artifact) => artifact.artifact_id === incoming.artifact_id);
  if (index < 0) return [...artifacts, incoming];
  return artifacts.map((artifact, itemIndex) => itemIndex === index ? { ...artifact, ...incoming } : artifact);
}

function updateArtifactPart(state: ChatTurnState, artifactId: string, at: string): OrderedMessagePart[] {
  if (state.parts.some((part) => part.kind === "artifact" && part.artifactId === artifactId)) return state.parts;
  return appendPart(state, { kind: "artifact", partId: `artifact:${artifactId}`, order: state.parts.length, createdAt: at, artifactId });
}

export function reduceChatEvent(state: ChatTurnState, event: ChatEvent): ChatTurnState {
  if (event.conversation_id !== state.conversationId || event.turn_id !== state.turnId) return state;
  if (state.seenEventIds.includes(event.event_id) || event.sequence <= state.lastSequence) return state;
  if (TERMINAL_STATUSES.has(state.status)) return state;

  let next: ChatTurnState = {
    ...state,
    lastSequence: event.sequence,
    seenEventIds: [...state.seenEventIds, event.event_id],
  };

  switch (event.type) {
    case "turn.started":
      return { ...next, model: event.model, status: "running" };
    case "assistant.interim": {
      const existingIndex = next.parts.findIndex((part) => part.kind === "interim" && (!part.sealed || part.partId === (event.part_id ?? "")));
      const partId = event.part_id ?? "assistant:interim";
      if (existingIndex >= 0) {
        const existing = next.parts[existingIndex];
        if (existing.kind === "interim") {
          const parts = next.parts.map((part, index) => index === existingIndex ? { ...existing, text: event.message, phase: event.phase ?? existing.phase } : part);
          return {
            ...next,
            parts,
            activity: upsertActivity(next, `interim:${partId}`, event.message, event.timestamp),
          };
        }
      }
      return {
        ...next,
        parts: appendPart(next, { kind: "interim", partId, order: next.parts.length, createdAt: event.timestamp, text: event.message, phase: event.phase, sealed: false }),
        activity: upsertActivity(next, `interim:${partId}`, event.message, event.timestamp),
      };
    }
    case "assistant.delta":
      return { ...next, parts: appendOrCoalesceText(next, event.delta, event.timestamp, event.part_id ?? "assistant:text") };
    case "reasoning.delta":
      return event.visibility === "private"
        ? { ...next, reasoningText: next.reasoningText + event.delta }
        : {
            ...next,
            reasoningText: next.reasoningText + event.delta,
            parts: appendPart(next, { kind: "reasoning", partId: "reasoning:visible", order: next.parts.length, createdAt: event.timestamp, text: event.delta }),
          };
    case "tool.drafting": {
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: event.tool, label: event.label ?? event.tool.replaceAll("_", " "), state: "drafting", createdAt: event.timestamp });
      return { ...next, ...result, activity: upsertActivity(next, `tool:${event.tool_call_id}`, event.label ?? event.tool.replaceAll("_", " "), event.timestamp) };
    }
    case "tool.started": {
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: event.tool, label: event.label ?? event.tool.replaceAll("_", " "), state: "running", createdAt: event.timestamp });
      return { ...next, ...result, activity: upsertActivity(next, `tool:${event.tool_call_id}`, event.label ?? event.tool.replaceAll("_", " "), event.timestamp, { state: "active" }) };
    }
    case "tool.progress": {
      const current = next.parts.find((part) => part.kind === "tool" && part.toolCallId === event.tool_call_id);
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: current?.kind === "tool" ? current.tool : "tool", label: current?.kind === "tool" ? current.label : "Tool", state: current?.kind === "tool" ? current.state : "running", createdAt: event.timestamp, message: event.message, progress: event.progress });
      return { ...next, ...result, activity: event.message ? upsertActivity(next, `tool:${event.tool_call_id}`, current?.kind === "tool" ? current.label : "Tool", event.timestamp, { detail: event.message }) : next.activity };
    }
    case "tool.completed": {
      const existing = next.parts.find((part) => part.kind === "tool" && part.toolCallId === event.tool_call_id);
      const label = existing?.kind === "tool" ? existing.label : event.tool.replaceAll("_", " ");
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: event.tool, label, state: "completed", createdAt: event.timestamp, summary: event.summary, resultRef: event.result_ref, completedAt: event.timestamp });
      return { ...next, ...result, activity: upsertActivity(next, `tool:${event.tool_call_id}`, label, event.timestamp, { state: "completed", detail: event.summary, completedAt: event.timestamp }) };
    }
    case "tool.failed": {
      const existing = next.parts.find((part) => part.kind === "tool" && part.toolCallId === event.tool_call_id);
      const label = existing?.kind === "tool" ? existing.label : event.tool.replaceAll("_", " ");
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: event.tool, label, state: "failed", createdAt: event.timestamp, error: event.error, completedAt: event.timestamp });
      return { ...next, ...result, activity: upsertActivity(next, `tool:${event.tool_call_id}`, label, event.timestamp, { state: "failed", detail: event.error, completedAt: event.timestamp }) };
    }
    case "tool.interrupted": {
      const existing = next.parts.find((part) => part.kind === "tool" && part.toolCallId === event.tool_call_id);
      const label = existing?.kind === "tool" ? existing.label : event.tool.replaceAll("_", " ");
      const result = upsertToolPart(next, { toolCallId: event.tool_call_id, tool: event.tool, label, state: "interrupted", createdAt: event.timestamp, message: event.reason, completedAt: event.timestamp });
      return { ...next, ...result, activity: upsertActivity(next, `tool:${event.tool_call_id}`, label, event.timestamp, { state: "interrupted", detail: event.reason, completedAt: event.timestamp }) };
    }
    case "source.added": {
      if (next.sources.some((source) => source.source_id === event.source.source_id)) return next;
      const sourceIds = [...next.sources.map((source) => source.source_id), event.source.source_id];
      const existingPartIndex = next.parts.findIndex((part) => part.kind === "source_group");
      const parts = existingPartIndex >= 0
        ? next.parts.map((part, index) => index === existingPartIndex && part.kind === "source_group" ? { ...part, sourceIds } : part)
        : appendPart(next, { kind: "source_group", partId: "sources:turn", order: next.parts.length, createdAt: event.timestamp, sourceIds: [event.source.source_id] });
      return { ...next, sources: [...next.sources, event.source], parts };
    }
    case "artifact.created":
      return { ...next, artifacts: upsertArtifact(next.artifacts, event.artifact), parts: updateArtifactPart(next, event.artifact.artifact_id, event.timestamp) };
    case "artifact.processing": {
      const artifacts = upsertArtifact(next.artifacts, { artifact_id: event.artifact_id, name: event.artifact_id, media_type: "application/octet-stream", status: "processing" });
      return { ...next, artifacts, parts: updateArtifactPart(next, event.artifact_id, event.timestamp) };
    }
    case "artifact.ready": {
      const current = next.artifacts.find((artifact) => artifact.artifact_id === event.artifact_id);
      const artifacts = upsertArtifact(next.artifacts, { artifact_id: event.artifact_id, name: current?.name ?? event.artifact_id, media_type: current?.media_type ?? "application/octet-stream", status: "ready", download_url: event.download_url ?? current?.download_url });
      return { ...next, artifacts, parts: updateArtifactPart(next, event.artifact_id, event.timestamp) };
    }
    case "artifact.failed": {
      const current = next.artifacts.find((artifact) => artifact.artifact_id === event.artifact_id);
      const artifacts = upsertArtifact(next.artifacts, { artifact_id: event.artifact_id, name: current?.name ?? event.artifact_id, media_type: current?.media_type ?? "application/octet-stream", status: "failed", error: event.error });
      return { ...next, artifacts, parts: updateArtifactPart(next, event.artifact_id, event.timestamp) };
    }
    case "turn.completed": {
      const parts = event.final_markdown && !next.parts.some((part) => part.kind === "text")
        ? appendOrCoalesceText(next, event.final_markdown, event.timestamp)
        : next.parts;
      return { ...next, status: "completed", completedAt: event.timestamp, parts };
    }
    case "turn.interrupted":
      return { ...next, status: "interrupted", completedAt: event.timestamp, interruptReason: event.reason, resumable: event.resumable };
    case "turn.failed":
      return { ...next, status: "failed", completedAt: event.timestamp, error: event.error, parts: appendPart(next, { kind: "error", partId: `error:${event.event_id}`, order: next.parts.length, createdAt: event.timestamp, text: event.error }) };
    case "conversation.updated":
      return { ...next, conversationTitle: event.title ?? next.conversationTitle, pinned: event.pinned ?? next.pinned, archived: event.archived ?? next.archived };
    default:
      return next;
  }
}

export type { ChatEvent } from "./command-room-chat-contract";
