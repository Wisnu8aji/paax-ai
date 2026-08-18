import { GatewayWorkEventSchema, type GatewayWorkEvent, type GatewayWorkEventType } from "@paax/schemas";
import type { ConversationEvent } from "../agent/conversation-loop";

const MAX_PAYLOAD_BYTES = 120_000;
const SECRET_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)/i;

export interface GatewayWorkEventEmitterOptions {
  runId: string;
  conversationId: string;
  now?: () => string;
  onEvent?: (event: GatewayWorkEvent) => void;
  maxPayloadBytes?: number;
}

export class WorkEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkEventError";
  }
}

function redactedText(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 16_000);
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactedText(value);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 256).map((item) => redactValue(item, depth + 1));
  if (!value || typeof value !== "object") return "[UNSUPPORTED]";
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 256)) {
    output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactValue(child, depth + 1);
  }
  return output;
}

/** Validates and redacts a persisted or externally supplied WorkEvent before delivery. */
export function sanitizeGatewayWorkEvent(value: unknown): GatewayWorkEvent | null {
  const parsed = GatewayWorkEventSchema.safeParse(redactValue(value));
  return parsed.success ? parsed.data : null;
}

export class GatewayWorkEventEmitter {
  private sequence = 0;
  private closed = false;
  private readonly now: () => string;
  private readonly maxPayloadBytes: number;

  constructor(private readonly options: GatewayWorkEventEmitterOptions) {
    if (!options.runId.trim() || !options.conversationId.trim()) throw new WorkEventError("work event identity is required");
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxPayloadBytes = Math.max(1_024, Math.min(options.maxPayloadBytes ?? MAX_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES));
  }

  emit(type: GatewayWorkEventType, data: Record<string, unknown> = {}): GatewayWorkEvent | null {
    if (this.closed) return null;
    const sequence = this.sequence++;
    const candidate = {
      ...redactValue(data) as Record<string, unknown>,
      type,
      runId: this.options.runId,
      conversationId: this.options.conversationId,
      eventId: `${this.options.runId}:${sequence}`,
      sequence,
      timestamp: this.now(),
    };
    const parsed = GatewayWorkEventSchema.safeParse(candidate);
    if (!parsed.success) throw new WorkEventError("work event payload is invalid");
    if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > this.maxPayloadBytes) throw new WorkEventError("work event payload is too large");
    this.options.onEvent?.(parsed.data);
    return parsed.data;
  }

  serialize(event: GatewayWorkEvent): string {
    const parsed = sanitizeGatewayWorkEvent(event);
    if (!parsed) return "";
    const payload = JSON.stringify(parsed);
    if (Buffer.byteLength(payload, "utf8") > this.maxPayloadBytes) return "";
    return `event: message\ndata: ${payload}\n\n`;
  }

  close(): void {
    this.closed = true;
  }
}

function toolPayload(event: ConversationEvent, state: "generating" | "running" | "completed" | "failed") {
  return {
    tool: {
      toolId: typeof event.toolCallId === "string" ? event.toolCallId : "tool-call",
      name: typeof event.name === "string" ? event.name : "unknown",
      state,
      ...(typeof event.summary === "string" ? { summary: event.summary } : {}),
    },
  };
}

/** Maps internal loop metadata to the shared browser vocabulary without exposing prompts or raw reasoning. */
export function emitConversationEvent(emitter: GatewayWorkEventEmitter, event: ConversationEvent): GatewayWorkEvent | null {
  switch (event.type) {
    case "calling_model":
      return emitter.emit("status.update", { phase: "calling_model", statusLabel: "Memanggil model" });
    case "model_retry":
      return emitter.emit("status.update", { phase: "model_retry", statusLabel: "Mencoba ulang provider" });
    case "assistant_delta":
      return typeof event.delta === "string" ? emitter.emit("assistant.delta", { delta: event.delta }) : null;
    case "reasoning_delta":
      return emitter.emit("status.update", { phase: "reasoning", statusLabel: "Model sedang menilai konteks" });
    case "before_tools":
      return emitter.emit("status.update", { phase: "tools", statusLabel: "Menjalankan tool terverifikasi" });
    case "tool.generating":
      return emitter.emit("tool.generating", toolPayload(event, "generating"));
    case "tool.started":
      return emitter.emit("tool.started", toolPayload(event, "running"));
    case "tool.completed":
      return emitter.emit("tool.completed", toolPayload(event, event.status === "completed" ? "completed" : "failed"));
    case "approval.requested": {
      const timestamp = new Date().toISOString();
      return emitter.emit("approval.requested", {
        approval: {
          approvalId: typeof event.approvalId === "string" ? event.approvalId : "approval",
          action: typeof event.action === "string" ? event.action : "tool",
          reason: "Tool memerlukan persetujuan manusia.",
          createdAt: timestamp,
          expiresAt: typeof event.expiresAt === "string" ? event.expiresAt : timestamp,
          state: "pending",
        },
      });
    }
    case "approval.resolved": {
      const timestamp = new Date().toISOString();
      return emitter.emit("approval.resolved", {
        approval: {
          approvalId: typeof event.approvalId === "string" ? event.approvalId : "approval",
          action: typeof event.name === "string" ? event.name : "tool",
          reason: "Keputusan persetujuan diterima.",
          createdAt: timestamp,
          expiresAt: timestamp,
          state: event.state === "approved" ? "approved" : event.state === "expired" ? "expired" : "denied",
        },
      });
    }
    case "error":
      return emitter.emit("error", { errorCode: "turn_error", errorMessage: "turn gagal" });
    default:
      return null;
  }
}
