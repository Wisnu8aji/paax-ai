import { redactWorkPayload } from "@/lib/command-room/work-agent-redaction";
import type { WorkEvent, WorkEventType } from "@/lib/command-room/work-agent-types";

type WorkEventSink = (event: WorkEvent) => void;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export class WorkEventEmitter {
  private sequence = 0;

  constructor(
    private readonly runId: string,
    private readonly conversationId: string,
    private readonly sink: WorkEventSink,
  ) {}

  emit(type: WorkEventType, data: Record<string, unknown> = {}): WorkEvent {
    const sequence = this.sequence;
    this.sequence += 1;
    const event = {
      ...redactWorkPayload(data),
      type,
      runId: this.runId,
      conversationId: this.conversationId,
      eventId: `${this.runId}:${sequence}`,
      sequence,
      timestamp: new Date().toISOString(),
    } as WorkEvent;
    this.sink(event);
    return event;
  }

  fromChatEvent(data: Record<string, unknown>): WorkEvent | null {
    const type = text(data.type);
    if (!type) return null;
    if (type === "activity") {
      const activity = (data.activity && typeof data.activity === "object" ? data.activity : {}) as Record<string, unknown>;
      const step = (activity.step && typeof activity.step === "object" ? activity.step : {}) as Record<string, unknown>;
      return this.emit("status.update", {
        phase: text(data.phase) ?? text(step.kind) ?? "activity",
        statusLabel: text(step.label) ?? "Agent bekerja",
        statusDetail: text(step.detail),
      });
    }
    if (type === "status") {
      return this.emit("status.update", {
        phase: text(data.phase) ?? "working",
        statusLabel: text(data.statusLabel) ?? "Agent bekerja",
        statusDetail: text(data.statusDetail),
      });
    }
    if (type === "tool_call") {
      const name = text(data.tool) ?? "tool";
      const toolId = text(data.toolCallId) ?? `${name}:${this.sequence}`;
      return this.emit("tool.started", {
        tool: { toolId, name, state: "running", args: data.args === undefined ? undefined : redactWorkPayload(data.args) },
      });
    }
    if (type === "tool_result") {
      const name = text(data.tool) ?? "tool";
      const toolId = text(data.toolCallId) ?? `${name}:${Math.max(0, this.sequence - 1)}`;
      const result = data.result === undefined ? undefined : redactWorkPayload(data.result);
      const completed = this.emit("tool.completed", {
        tool: { toolId, name, state: "completed", result, summary: text(data.summary) },
      });
      if (result && typeof result === "object" && !Array.isArray(result) && (result as Record<string, unknown>).approval_required === true) {
        this.emit("approval.requested", {
          approval: {
            approvalId: `approval-${this.runId}-${this.sequence}`,
            action: name,
            reason: text((result as Record<string, unknown>).reason) ?? "Tindakan ini memerlukan persetujuan.",
            args: (result as Record<string, unknown>).args,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            state: "pending",
          },
        });
      }
      return completed;
    }
    if (type === "reasoning") return this.emit("reasoning.delta", { delta: text(data.delta) ?? "" });
    if (type === "content") return this.emit("assistant.delta", { delta: text(data.delta) ?? "" });
    if (type === "artifact") return this.emit("artifact.created", { artifact: redactWorkPayload(data) });
    if (type === "done") return this.emit("turn.completed", { finalMarkdown: text(data.finalMarkdown) });
    if (type === "error") return this.emit("error", { errorMessage: text(data.errorMessage) ?? "Work failed" });
    return null;
  }
}
