import type {
  ChatArtifactRef,
  ChatEvent,
  ChatModelMetadata,
} from "@/lib/chat/command-room-chat-contract";

export interface ChatEventStreamOptions {
  conversationId: string;
  turnId: string;
  runtimeId: string;
  model: ChatModelMetadata;
  eventIdFactory?: (sequence: number) => string;
  now?: () => string;
}

type EventSink = (event: ChatEvent) => void;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function artifactFromLegacy(data: Record<string, unknown>, fallbackId: string): ChatArtifactRef | null {
  const artifactId = asString(data.artifact_id) ?? asString(data.artifactId) ?? fallbackId;
  const name = asString(data.filename) ?? asString(data.name) ?? "File hasil";
  const mediaType = asString(data.media_type) ?? asString(data.mediaType) ?? "application/octet-stream";
  const size = typeof data.sizeBytes === "number" ? data.sizeBytes : undefined;
  const downloadUrl = asString(data.download_url) ?? asString(data.downloadUrl);
  return artifactId ? { artifact_id: artifactId, name, media_type: mediaType, status: downloadUrl ? "ready" : "created", size_bytes: size, download_url: downloadUrl } : null;
}

/**
 * Converts the existing provider/tool callback vocabulary into the v1.5
 * durable event envelope. The provider never writes client-facing JSON
 * directly; this is the single Chat boundary where event IDs and sequence are
 * assigned. Work has its own emitter and does not use this adapter.
 */
export class ChatEventStream {
  private sequence = 0;
  private readonly options: Required<Pick<ChatEventStreamOptions, "eventIdFactory" | "now">>;

  constructor(private readonly context: ChatEventStreamOptions, private readonly sink: EventSink) {
    this.options = {
      eventIdFactory: context.eventIdFactory ?? ((sequence) => `chat-event-${context.turnId}-${sequence}`),
      now: context.now ?? (() => new Date().toISOString()),
    };
  }

  emit(type: ChatEvent["type"], payload: Record<string, unknown> = {}): ChatEvent {
    const sequence = this.sequence++;
    const event = {
      type,
      event_id: this.options.eventIdFactory(sequence),
      conversation_id: this.context.conversationId,
      turn_id: this.context.turnId,
      runtime_id: this.context.runtimeId,
      sequence,
      timestamp: this.options.now(),
      ...payload,
    } as ChatEvent;
    this.sink(event);
    return event;
  }

  turnStarted(requestText?: string): ChatEvent {
    return this.emit("turn.started", { model: this.context.model, request_text: requestText });
  }

  fromLegacy(data: Record<string, unknown>): ChatEvent | null {
    const type = data.type;
    if (type === "content" && typeof data.delta === "string") return this.emit("assistant.delta", { delta: data.delta });
    if (type === "reasoning" && typeof data.delta === "string") {
      return this.emit("reasoning.delta", { delta: data.delta, visibility: "visible" });
    }
    if (type === "status" && typeof data.statusLabel === "string") {
      return this.emit("assistant.interim", { message: data.statusLabel, phase: asString(data.phase) });
    }
    if (type === "activity" && data.activity && typeof data.activity === "object") {
      const activity = data.activity as Record<string, unknown>;
      const step = activity.step && typeof activity.step === "object" ? activity.step as Record<string, unknown> : {};
      const label = asString(step.label);
      if (label) return this.emit("assistant.interim", { message: label, phase: asString(step.kind) });
    }
    if (type === "tool_call" && typeof data.tool === "string") {
      return this.emit("tool.started", {
        tool_call_id: asString(data.toolCallId) ?? `tool-${this.sequence}`,
        tool: data.tool,
        label: asString(data.label) ?? data.tool.replaceAll("_", " "),
      });
    }
    if (type === "tool_result" && typeof data.tool === "string") {
      const toolCallId = asString(data.toolCallId) ?? `tool-${this.sequence}`;
      const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : undefined;
      if (result && typeof result.error === "string") {
        return this.emit("tool.failed", { tool_call_id: toolCallId, tool: data.tool, error: result.error });
      }
      return this.emit("tool.completed", {
        tool_call_id: toolCallId,
        tool: data.tool,
        summary: asString(data.summary),
        result_ref: asString(data.resultRef),
      });
    }
    if (type === "artifact") {
      const artifact = artifactFromLegacy(data, `artifact-${this.context.turnId}-${this.sequence}`);
      return artifact ? this.emit("artifact.created", { artifact }) : null;
    }
    if (type === "done") return this.emit("turn.completed", { final_markdown: asString(data.finalMarkdown) });
    if (type === "error") return this.emit("turn.failed", { error: asString(data.errorMessage) ?? "Stream error" });
    return null;
  }
}
