import { saveConversation, listConversations } from "./chat-history";
import type { RunPhase } from "./chat-stream-events";
import { formatRunDuration } from "./format-run-duration";
import type { CommandRoomConnector } from "@/app/api/command-room/chat/connector-permissions";
import {
  activityForTool,
  appendOrUpdateActivity,
  completeActiveActivities,
  safeReasoningActivityId,
  toolActivityId,
  type ActivityEventPayload,
  type ActivityStep,
} from "./activity-timeline";

export type RunState = "queued" | "running" | "streaming" | "completed" | "failed" | "cancelled";
export type AIModelName = "Lucent" | "Arete" | "Noir";

export type ActiveRun = {
  runId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId?: string;
  requestText: string;

  modelId: string;
  modelName: AIModelName;
  state: RunState;
  phase: RunPhase;

  statusLabel: string;
  statusDetail?: string;
  activitySteps: ActivityStep[];

  reasoningContent: string;
  answerBuffer: string;
  hasReasoningStarted: boolean;
  finalMarkdown?: string;
  finalRenderedContent?: string;

  startedAt: string;
  updatedAt: string;
  firstReasoningAt?: string;
  firstTokenAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  elapsedMs: number;
  finalDurationLabel?: string;
  errorMessage?: string;
};

export type CommandRoomRunStoreState = {
  runsById: Record<string, ActiveRun>;
  activeRunIdsByConversationId: Record<string, string[]>;
};

export type StartChatRunInput = {
  runId?: string;
  conversationId: string;
  userMessageId: string;
  message: string;
  historyMessages: { role: "user" | "assistant"; content: string }[];
  modelId: string;
  modelName: AIModelName;
  effort?: "low" | "medium" | "high" | "max";
  thinking?: "on" | "off";
  projectId?: string;
  connectors: CommandRoomConnector[];
};

type Listener = () => void;

function initialActivity(now: string): ActivityStep {
  return {
    id: "request:inspect",
    kind: "inspect",
    label: "Memeriksa permintaan, konteks, dan batasan",
    state: "active",
    startedAt: now,
  };
}

function activityFromStatus(phase: string, label: string, detail?: string): ActivityEventPayload | null {
  if (phase === "reasoning_summary") return null;
  const kind = phase.includes("project_context") ? "context"
    : phase.includes("planning") || phase.includes("preparing") ? "inspect"
    : phase.includes("saving") || phase.includes("updating") ? "save"
    : phase.includes("streaming_response") ? "compose"
    : "context";
  return {
    action: phase.includes("streaming_response") ? "start" : "complete",
    step: { id: `status:${phase}`, kind, label, detail },
  };
}

class ChatRunStore {
  private state: CommandRoomRunStoreState = { runsById: {}, activeRunIdsByConversationId: {} };
  private listeners = new Set<Listener>();
  private abortControllers = new Map<string, AbortController>();
  private timers = new Map<string, NodeJS.Timeout>();
  private activeStreamRunIds = new Set<string>();
  private processedEventKeys = new Set<string>();

  getSnapshot = (): CommandRoomRunStoreState => this.state;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private notify() { this.listeners.forEach((listener) => listener()); }

  getRunsByConversationId(conversationId: string): ActiveRun[] {
    return (this.state.activeRunIdsByConversationId[conversationId] || [])
      .map((id) => this.state.runsById[id]).filter(Boolean);
  }

  getActiveRunsByConversationId(conversationId: string): ActiveRun[] {
    return this.getRunsByConversationId(conversationId)
      .filter((run) => run.state === "queued" || run.state === "running" || run.state === "streaming");
  }

  updateRun(runId: string, patch: Partial<ActiveRun>) {
    const run = this.state.runsById[runId];
    if (!run) return;
    this.state = {
      ...this.state,
      runsById: {
        ...this.state.runsById,
        [runId]: { ...run, ...patch, updatedAt: new Date().toISOString() },
      },
    };
    this.notify();
  }

  private applyActivity(runId: string, activity: ActivityEventPayload) {
    const run = this.state.runsById[runId];
    if (!run) return;
    const activitySteps = appendOrUpdateActivity(run.activitySteps, activity);
    const latest = activitySteps[activitySteps.length - 1];
    this.updateRun(runId, {
      activitySteps,
      statusLabel: latest?.label ?? run.statusLabel,
      statusDetail: latest?.detail ?? run.statusDetail,
    });
  }

  cancelRun(runId: string) {
    const run = this.state.runsById[runId];
    if (!run || ["completed", "failed", "cancelled"].includes(run.state)) return;
    this.abortControllers.get(runId)?.abort();
    this.abortControllers.delete(runId);
    this.stopTimer(runId);
    const now = new Date().toISOString();
    const elapsedMs = Date.now() - new Date(run.startedAt).getTime();
    const steps = completeActiveActivities(run.activitySteps, now);
    this.updateRun(runId, {
      state: "cancelled", phase: "cancelled", statusLabel: "Proses dihentikan",
      cancelledAt: now, elapsedMs, activitySteps: steps,
      finalDurationLabel: formatRunDuration(elapsedMs, "stopped"),
    });
  }

  private startTimer(runId: string) {
    if (this.timers.has(runId)) return;
    const interval = setInterval(() => {
      const run = this.state.runsById[runId];
      if (!run || ["completed", "failed", "cancelled"].includes(run.state)) {
        this.stopTimer(runId);
        return;
      }
      this.updateRun(runId, { elapsedMs: Date.now() - new Date(run.startedAt).getTime() });
    }, 1000);
    this.timers.set(runId, interval);
  }

  private stopTimer(runId: string) {
    const timer = this.timers.get(runId);
    if (timer) clearInterval(timer);
    this.timers.delete(runId);
  }

  async startChatRun(input: StartChatRunInput): Promise<void> {
    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (this.activeStreamRunIds.has(runId)) return;
    this.activeStreamRunIds.add(runId);

    const now = new Date().toISOString();
    const newRun: ActiveRun = {
      runId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      requestText: input.message,
      modelId: input.modelId,
      modelName: input.modelName,
      state: "running",
      phase: "preparing_prompt",
      statusLabel: "Memeriksa permintaan, konteks, dan batasan",
      activitySteps: [initialActivity(now)],
      reasoningContent: "",
      answerBuffer: "",
      hasReasoningStarted: false,
      startedAt: now,
      updatedAt: now,
      elapsedMs: 0,
    };

    const existing = this.state.activeRunIdsByConversationId[input.conversationId] || [];
    this.state = {
      ...this.state,
      runsById: { ...this.state.runsById, [runId]: newRun },
      activeRunIdsByConversationId: {
        ...this.state.activeRunIdsByConversationId,
        [input.conversationId]: [...existing, runId],
      },
    };

    const controller = new AbortController();
    this.abortControllers.set(runId, controller);
    this.startTimer(runId);
    this.notify();

    try {
      const response = await fetch("/api/command-room/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          conversationId: input.conversationId,
          messages: input.historyMessages,
          modelAlias: input.modelId,
          reasoningEffort: input.effort,
          thinking: input.thinking,
          projectId: input.projectId,
          connectors: input.connectors,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `HTTP ${response.status} ${response.statusText}`;
        try { const body = await response.json(); if (body.error) message = body.error; } catch { /* non-json */ }
        throw new Error(message);
      }
      if (!response.body) throw new Error("No response stream");

      this.updateRun(runId, { phase: "waiting_for_model" });
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const data = dataLine.slice(6);
          if (!data || data === "[DONE]") continue;

          let parsed: any;
          try { parsed = JSON.parse(data); } catch { continue; }
          if (parsed.sequence !== undefined) {
            const key = `${runId}:${parsed.sequence}`;
            if (this.processedEventKeys.has(key)) continue;
            this.processedEventKeys.add(key);
          }

          if (parsed.type === "activity" && parsed.activity) {
            this.applyActivity(runId, { ...parsed.activity, timestamp: parsed.timestamp });
          } else if (parsed.type === "status") {
            const event = activityFromStatus(parsed.phase, parsed.statusLabel, parsed.statusDetail);
            if (event) this.applyActivity(runId, { ...event, timestamp: parsed.timestamp });
            this.updateRun(runId, { phase: parsed.phase, statusLabel: parsed.statusLabel, statusDetail: parsed.statusDetail });
          } else if (parsed.type === "tool_call") {
            const definition = activityForTool(parsed.tool);
            const activityId = parsed.toolCallId ? `tool:${parsed.toolCallId}` : toolActivityId(parsed.tool);
            this.applyActivity(runId, {
              action: "start",
              step: { id: activityId, ...definition },
              timestamp: parsed.timestamp,
            });
            this.updateRun(runId, { phase: "using_tool", state: "streaming" });
          } else if (parsed.type === "tool_result") {
            const definition = activityForTool(parsed.tool);
            const activityId = parsed.toolCallId ? `tool:${parsed.toolCallId}` : toolActivityId(parsed.tool);
            this.applyActivity(runId, {
              action: "complete",
              step: { id: activityId, ...definition, detail: parsed.summary },
              timestamp: parsed.timestamp,
            });
          } else if (parsed.type === "reasoning") {
            const run = this.state.runsById[runId];
            const delta = parsed.delta || "";
            if (delta.trim() && !run.hasReasoningStarted) {
              this.applyActivity(runId, {
                action: "start",
                step: {
                  id: safeReasoningActivityId(),
                  kind: "reason",
                  label: "Menganalisis konteks, evidence, dan kemungkinan jawaban",
                  detail: "Menilai hubungan fakta, ketidakpastian, dan batas authority jawaban.",
                },
                timestamp: parsed.timestamp,
              });
            }
            this.updateRun(runId, {
              state: "streaming",
              phase: "receiving_reasoning",
              reasoningContent: run.reasoningContent + delta,
              hasReasoningStarted: run.hasReasoningStarted || delta.trim().length > 0,
              firstReasoningAt: run.firstReasoningAt || new Date().toISOString(),
            });
          } else if (parsed.type === "content") {
            const run = this.state.runsById[runId];
            this.applyActivity(runId, {
              action: "complete",
              step: {
                id: safeReasoningActivityId(), kind: "reason",
                label: "Menganalisis konteks, evidence, dan kemungkinan jawaban",
              },
              timestamp: parsed.timestamp,
            });
            this.applyActivity(runId, {
              action: "start",
              step: { id: "response:compose", kind: "compose", label: "Menyusun jawaban teknis yang mudah dibaca" },
              timestamp: parsed.timestamp,
            });
            this.updateRun(runId, {
              state: "streaming", phase: "streaming_response",
              answerBuffer: run.answerBuffer + (parsed.delta || ""),
              firstTokenAt: run.firstTokenAt || new Date().toISOString(),
            });
          } else if (parsed.type === "claim_verification") {
            this.applyActivity(runId, {
              action: "complete",
              step: {
                id: "answer:verify", kind: "verify",
                label: "Memeriksa angka, authority, dan sumber evidence",
                detail: parsed.rejectedCount ? `${parsed.rejectedCount} klaim ditahan` : "Klaim terverifikasi sesuai authority",
              },
              timestamp: parsed.timestamp,
            });
          } else if (parsed.type === "evidence_gate") {
            this.applyActivity(runId, {
              action: "complete",
              step: {
                id: "evidence:gate", kind: "verify",
                label: "Memeriksa keterlacakan jawaban ke sumber",
                detail: parsed.status === "pass" ? "Evidence gate lulus" : "Sebagian klaim perlu review",
              },
              timestamp: parsed.timestamp,
            });
          } else if (parsed.type === "done") {
            this.applyActivity(runId, {
              action: "complete",
              step: { id: "response:compose", kind: "compose", label: "Menyusun jawaban teknis yang mudah dibaca" },
              timestamp: parsed.timestamp,
            });
          } else if (parsed.type === "error") {
            throw new Error(parsed.errorMessage);
          }
        }
      }

      this.stopTimer(runId);
      const finishedRun = this.state.runsById[runId];
      if (finishedRun.state === "cancelled") return;
      const finishedAt = new Date().toISOString();
      const elapsedMs = Date.now() - new Date(finishedRun.startedAt).getTime();
      const activitySteps = completeActiveActivities(finishedRun.activitySteps, finishedAt);
      const hasReasoning = Boolean(finishedRun.reasoningContent.trim());
      this.updateRun(runId, {
        state: "completed", phase: "completed", statusLabel: "Jawaban selesai",
        completedAt: finishedAt, elapsedMs, activitySteps,
        finalMarkdown: finishedRun.answerBuffer,
        finalRenderedContent: finishedRun.answerBuffer,
        finalDurationLabel: formatRunDuration(elapsedMs, hasReasoning ? "reasoned" : "thought"),
      });
      this.saveFinishedRunToHistory(runId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      this.stopTimer(runId);
      const run = this.state.runsById[runId];
      if (run.state === "cancelled") return;
      const failedAt = new Date().toISOString();
      const elapsedMs = Date.now() - new Date(run.startedAt).getTime();
      this.updateRun(runId, {
        state: "failed", phase: "failed", statusLabel: "Proses gagal",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        failedAt, elapsedMs, activitySteps: completeActiveActivities(run.activitySteps, failedAt),
        finalDurationLabel: formatRunDuration(elapsedMs, "failed"),
      });
    } finally {
      this.abortControllers.delete(runId);
      this.activeStreamRunIds.delete(runId);
    }
  }

  private saveFinishedRunToHistory(runId: string) {
    const run = this.state.runsById[runId];
    if (!run || run.state !== "completed") return;
    const conv = listConversations("command-room").find((item) => item.id === run.conversationId);
    if (!conv) return;
    const newMsg = {
      id: `a-${Date.now()}`,
      role: "assistant" as const,
      text: run.answerBuffer,
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      processing: {
        modelName: run.modelName,
        durationMs: run.elapsedMs,
        durationLabel: run.finalDurationLabel || formatRunDuration(run.elapsedMs, "reasoned"),
        steps: run.activitySteps,
      },
    };
    saveConversation({ ...conv, messages: [...conv.messages, newMsg] });
    this.updateRun(runId, { phase: "updating_conversation", assistantMessageId: newMsg.id });
  }
}

export const chatRunStore = new ChatRunStore();
