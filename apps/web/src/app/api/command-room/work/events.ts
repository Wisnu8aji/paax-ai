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
    const safeData = redactWorkPayload(data);
    const event = {
      ...(safeData && typeof safeData === "object" && !Array.isArray(safeData) ? safeData : {}),
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
      const status = this.emit("status.update", {
        phase: text(data.phase) ?? text(step.kind) ?? "activity",
        statusLabel: text(step.label) ?? "Agent bekerja",
        statusDetail: text(step.detail),
      });
      if (step.kind === "reason" || text(data.phase) === "reasoning") {
        this.emit("reasoning.delta", {
          delta: [text(step.label), text(step.detail)].filter(Boolean).join(" — ") || "Agent menilai konteks kerja.",
        });
      }
      return status;
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
      this.emit("tool.generating", {
        tool: { toolId, name, state: "generating", args: data.args === undefined ? undefined : redactWorkPayload(data.args) },
      });
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
      const resultRecord = result && typeof result === "object" && !Array.isArray(result)
        ? result as Record<string, unknown>
        : null;
      if (text(data.summary) || resultRecord) {
        const level = resultRecord?.error || resultRecord?.executed === false ? "warn" : "info";
        this.emit("log.line", {
          log: {
            level,
            text: `${name}: ${text(data.summary) ?? (level === "warn" ? "tool reported an error" : "tool completed")}`,
          },
        });
      }
      if (resultRecord && Array.isArray(resultRecord.tasks)) {
        this.emit("plan.updated", { tasks: redactWorkPayload(resultRecord.tasks) });
      }
      if (resultRecord && resultRecord.approval_required === true && data._workApprovalHandled !== true) {
        this.emit("approval.requested", {
          approval: {
            approvalId: `approval-${this.runId}-${this.sequence}`,
            action: name,
            reason: text(resultRecord.reason) ?? "Tindakan ini memerlukan persetujuan.",
            args: resultRecord.args,
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
    if (type === "artifact") {
      const artifact = data.artifact && typeof data.artifact === "object" && !Array.isArray(data.artifact)
        ? data.artifact as Record<string, unknown>
        : data;
      return this.emit("artifact.created", {
        artifact: {
          artifactId: text(artifact.artifactId) ?? text(artifact.id) ?? `artifact-${this.sequence}`,
          name: text(artifact.name) ?? text(artifact.filename) ?? "Unnamed artifact",
          kind: text(artifact.kind) ?? text(artifact.type) ?? "file",
          uri: text(artifact.uri),
          sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : undefined,
          summary: text(artifact.summary),
          createdAt: new Date().toISOString(),
        },
      });
    }
    if (type === "done") return this.emit("turn.completed", { finalMarkdown: text(data.finalMarkdown) });
    if (type === "error") return this.emit("error", { errorMessage: text(data.errorMessage) ?? "Work failed" });
    return null;
  }
}
