import { saveConversation, listConversations } from "./chat-history";
import type { RunPhase } from "./chat-stream-events";
import { normalizeChatEvent, type ChatEvent } from "./command-room-chat-contract";
import type { ChatAttachmentRef } from "./attachment-contract";
import {
  createChatTurnState,
  reduceChatEvent,
  type ActivityProjection,
  type ChatTurnState,
  type OrderedMessagePart,
} from "./command-room-chat-reducer";
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
  turnState: ChatTurnState;
  messageParts: OrderedMessagePart[];
  sources: ChatTurnState["sources"];
  artifacts: ChatTurnState["artifacts"];
  durable: boolean;
  queueEntryId?: string;
  parked?: boolean;
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
  connectors?: CommandRoomConnector[];
  conversationTitle?: string;
  messageSequence?: number;
  attachments?: ChatAttachmentRef[];
};

type Listener = () => void;

function createInitialRun(input: StartChatRunInput, runId: string, now: string, state: "queued" | "running"): ActiveRun {
  const queued = state === "queued";
  return {
    runId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    requestText: input.message,
    modelId: input.modelId,
    modelName: input.modelName,
    state,
    phase: queued ? "queued" : "preparing_prompt",
    statusLabel: queued ? "Menunggu giliran di antrian" : "Menghubungkan ke runtime Chat",
    activitySteps: [],
    reasoningContent: "",
    answerBuffer: "",
    hasReasoningStarted: false,
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    turnState: createChatTurnState(input.conversationId, runId),
    messageParts: [],
    sources: [],
    artifacts: [],
    durable: false,
  };
}

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

function activityKindFromLabel(label: string): ActivityStep["kind"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("sumber") || normalized.includes("mencari")) return "search";
  if (normalized.includes("konteks")) return "context";
  if (normalized.includes("model") || normalized.includes("menyusun")) return "compose";
  if (normalized.includes("gagal")) return "warning";
  return "inspect";
}

function activityStepsFromProjection(items: ActivityProjection[]): ActivityStep[] {
  return items.map((item) => ({
    id: item.id,
    kind: activityKindFromLabel(item.label),
    label: item.label,
    detail: item.detail,
    state: item.state === "interrupted" ? "warning" : item.state === "failed" ? "failed" : item.state,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
  }));
}

function answerTextFromParts(parts: OrderedMessagePart[]): string {
  return parts.filter((part) => part.kind === "text").map((part) => part.text).join("");
}

export class ChatRunStore {
  private state: CommandRoomRunStoreState = { runsById: {}, activeRunIdsByConversationId: {} };
  private listeners = new Set<Listener>();
  private abortControllers = new Map<string, AbortController>();
  private timers = new Map<string, NodeJS.Timeout>();
  private activeStreamRunIds = new Set<string>();
  private processedEventKeys = new Set<string>();
  private queuedInputs = new Map<string, StartChatRunInput>();

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

  hydrateQueuedRun(entry: { id: string; turn_id: string; state: "queued" | "parked"; payload: unknown; conversation_id: string }): void {
    if (this.state.runsById[entry.turn_id] || !entry.turn_id || !entry.conversation_id) return;
    if (!entry.payload || typeof entry.payload !== "object") return;
    const payload = entry.payload as Partial<StartChatRunInput>;
    if (typeof payload.message !== "string" || !Array.isArray(payload.historyMessages)) return;
    if (payload.modelId !== "lucent" && payload.modelId !== "arete" && payload.modelId !== "noir") return;
    const modelName = payload.modelName === "Arete" || payload.modelName === "Noir" ? payload.modelName : "Lucent";
    const input: StartChatRunInput = {
      runId: entry.turn_id,
      conversationId: entry.conversation_id,
      userMessageId: `queued-${entry.turn_id}`,
      message: payload.message,
      historyMessages: payload.historyMessages.filter((item): item is { role: "user" | "assistant"; content: string } => Boolean(item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")),
      modelId: payload.modelId,
      modelName,
      effort: payload.effort,
      thinking: payload.thinking,
      projectId: payload.projectId,
      conversationTitle: payload.conversationTitle,
      messageSequence: payload.messageSequence,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    };
    const now = new Date().toISOString();
    const run = { ...createInitialRun(input, entry.turn_id, now, "queued"), durable: true, queueEntryId: entry.id, parked: entry.state === "parked" };
    const existing = this.state.activeRunIdsByConversationId[entry.conversation_id] || [];
    this.queuedInputs.set(entry.turn_id, input);
    this.state = {
      ...this.state,
      runsById: { ...this.state.runsById, [entry.turn_id]: run },
      activeRunIdsByConversationId: { ...this.state.activeRunIdsByConversationId, [entry.conversation_id]: [...existing, entry.turn_id] },
    };
    this.notify();
    this.drainNextQueued(entry.conversation_id);
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
    this.queuedInputs.delete(runId);
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
    void this.updateQueueEntry({ ...run, state: "cancelled" }, "cancelled");
  }

  async stopRun(runId: string): Promise<void> {
    const run = this.state.runsById[runId];
    if (!run || ["completed", "failed", "cancelled"].includes(run.state)) return;
    await fetch("/api/command-room/chat/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: runId, action: "stop" }),
    }).catch(() => undefined);
    this.cancelRun(runId);
    const queued = this.getRunsByConversationId(run.conversationId).filter((item) => item.state === "queued");
    queued.forEach((item) => {
      this.updateRun(item.runId, {
        parked: true,
        statusLabel: "Antrian diparkir",
        statusDetail: "Resume untuk melanjutkan pekerjaan yang menunggu.",
      });
      void this.updateQueueEntry(item, "parked");
    });
  }

  async steerRun(runId: string, message: string): Promise<boolean> {
    const run = this.state.runsById[runId];
    const trimmed = message.trim();
    if (!run || !trimmed || !["running", "streaming"].includes(run.state)) return false;
    const response = await fetch("/api/command-room/chat/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: runId, action: "steer", message: trimmed }),
    }).catch(() => null);
    if (!response?.ok) return false;
    this.updateRun(runId, {
      statusLabel: "Steer diterima",
      statusDetail: "Instruksi tambahan akan dipakai pada batas provider berikutnya.",
    });
    return true;
  }

  resumeQueued(conversationId: string): void {
    const queued = this.getRunsByConversationId(conversationId).filter((run) => run.state === "queued" && run.parked);
    queued.forEach((run) => this.updateRun(run.runId, {
      parked: false,
      statusLabel: "Menunggu giliran di antrian",
      statusDetail: undefined,
    }));
    queued.forEach((run) => { void this.updateQueueEntry(run, "queued"); });
    this.drainNextQueued(conversationId);
  }

  private drainNextQueued(conversationId: string): void {
    if (this.getActiveRunsByConversationId(conversationId).some((run) => run.state === "running" || run.state === "streaming")) return;
    const next = this.getRunsByConversationId(conversationId).find((run) => run.state === "queued" && !run.parked);
    const input = next ? this.queuedInputs.get(next.runId) : undefined;
    if (!next || !input) return;
    this.queuedInputs.delete(next.runId);
    // Preserve the durable FIFO turn identity. Without this, the queued
    // placeholder remains queued while a second, untracked run executes.
    void this.startChatRun({ ...input, runId: next.runId });
  }

  private queuePayload(input: StartChatRunInput): Record<string, unknown> {
    return {
      message: input.message,
      historyMessages: input.historyMessages,
      modelId: input.modelId,
      modelName: input.modelName,
      effort: input.effort,
      thinking: input.thinking,
      projectId: input.projectId,
      conversationTitle: input.conversationTitle,
      messageSequence: input.messageSequence,
      attachments: input.attachments,
    };
  }

  private async persistQueueEntry(input: StartChatRunInput, runId: string, state: "queued" | "parked"): Promise<void> {
    try {
      const response = await fetch(`/api/command-room/conversations/${encodeURIComponent(input.conversationId)}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: runId, sequence: input.messageSequence ?? input.historyMessages.length, state, payload: this.queuePayload(input) }),
      });
      const body = await response.json().catch(() => null);
      const entryId = body?.entry?.id;
      if (response.ok && typeof entryId === "string") this.updateRun(runId, { durable: true, queueEntryId: entryId });
    } catch {
      // Queue remains available in memory while the server adapter is offline.
    }
  }

  private async updateQueueEntry(run: ActiveRun, state: "queued" | "parked" | "running" | "completed" | "cancelled" | "failed"): Promise<void> {
    if (!run.queueEntryId) return;
    try {
      await fetch(`/api/command-room/conversations/${encodeURIComponent(run.conversationId)}/queue/${encodeURIComponent(run.queueEntryId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
    } catch {
      // Queue state reconciliation can be retried by session hydration.
    }
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
    const existingRun = this.state.runsById[runId];
    if (existingRun && ["completed", "failed", "cancelled"].includes(existingRun.state)) return;
    if (existingRun?.state === "queued" && this.queuedInputs.has(runId)) return;
    const existing = this.state.activeRunIdsByConversationId[input.conversationId] || [];
    const otherActive = this.getActiveRunsByConversationId(input.conversationId)
      .some((run) => run.runId !== runId && (run.state === "running" || run.state === "streaming"));
    const now = new Date().toISOString();

    if (!existingRun && otherActive) {
      const queuedRun = createInitialRun(input, runId, now, "queued");
      this.queuedInputs.set(runId, input);
      this.state = {
        ...this.state,
        runsById: { ...this.state.runsById, [runId]: queuedRun },
        activeRunIdsByConversationId: {
          ...this.state.activeRunIdsByConversationId,
          [input.conversationId]: [...existing, runId],
        },
      };
      this.notify();
      void this.persistConversation(input).then((durable) => {
        if (durable) this.updateRun(runId, { durable: true });
        return this.persistQueueEntry(input, runId, "queued");
      });
      return;
    }

    this.activeStreamRunIds.add(runId);
    const newRun = existingRun?.state === "queued"
      ? { ...existingRun, state: "running" as const, phase: "preparing_prompt" as const, statusLabel: "Menghubungkan ke runtime Chat", statusDetail: undefined, parked: false }
      : createInitialRun(input, runId, now, "running");
    this.queuedInputs.delete(runId);
    if (existingRun?.state === "queued") void this.updateQueueEntry(newRun, "running");
    this.state = {
      ...this.state,
      runsById: { ...this.state.runsById, [runId]: newRun },
      activeRunIdsByConversationId: {
        ...this.state.activeRunIdsByConversationId,
        [input.conversationId]: existing.includes(runId) ? existing : [...existing, runId],
      },
    };

    const controller = new AbortController();
    this.abortControllers.set(runId, controller);
    this.startTimer(runId);
    this.notify();

    try {
      const durable = await this.persistConversation(input);
      if (durable) {
        this.updateRun(runId, { durable: true });
        await this.persistMessage(input.conversationId, {
          role: "user",
          content: input.message,
          parts: [],
          sources: [],
          artifacts: [],
          modelAlias: input.modelId,
          turnId: runId,
          sequence: input.messageSequence ?? Math.max(0, input.historyMessages.length - 1),
        });
      }
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
          turnId: runId,
          attachments: input.attachments?.map((attachment) => ({
            attachment_id: attachment.attachment_id,
            name: attachment.name,
            media_type: attachment.media_type,
            size_bytes: attachment.size_bytes,
            status: attachment.status,
          })),
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

          const canonical = normalizeChatEvent(parsed);
          if (canonical) {
            this.applyCanonicalEvent(runId, canonical);
            continue;
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
      if (finishedRun.state === "cancelled" || finishedRun.state === "failed") return;
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
      void this.updateQueueEntry(this.state.runsById[runId], "completed");
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
      void this.updateQueueEntry(this.state.runsById[runId], "failed");
    } finally {
      this.abortControllers.delete(runId);
      this.activeStreamRunIds.delete(runId);
      this.drainNextQueued(input.conversationId);
    }
  }

  private applyCanonicalEvent(runId: string, event: ChatEvent) {
    const run = this.state.runsById[runId];
    if (!run) return;
    const turnState = reduceChatEvent(run.turnState, event);
    if (turnState === run.turnState) return;
    const answerBuffer = answerTextFromParts(turnState.parts);
    const terminal = turnState.status === "completed" || turnState.status === "failed" || turnState.status === "interrupted";
    const latestActivity = turnState.activity[turnState.activity.length - 1];
    const displayName = turnState.model?.display_name;
    const modelName: AIModelName = displayName === "Arete" || displayName === "Noir" ? displayName : "Lucent";
    const state: RunState = turnState.status === "completed" ? "completed" : turnState.status === "failed" ? "failed" : turnState.status === "interrupted" ? "cancelled" : event.type.startsWith("assistant.") || event.type.startsWith("reasoning.") ? "streaming" : run.state;
    const phase: RunPhase = event.type === "tool.started" || event.type === "tool.progress" ? "using_tool" : event.type === "turn.completed" ? "completed" : event.type === "turn.interrupted" ? "cancelled" : event.type === "turn.failed" ? "failed" : event.type === "assistant.delta" ? "streaming_response" : run.phase;
    this.updateRun(runId, {
      turnState,
      messageParts: turnState.parts,
      sources: turnState.sources,
      artifacts: turnState.artifacts,
      answerBuffer,
      reasoningContent: turnState.reasoningText,
      hasReasoningStarted: Boolean(turnState.reasoningText.trim()),
      modelName,
      state,
      phase,
      statusLabel: latestActivity?.label ?? run.statusLabel,
      statusDetail: latestActivity?.detail,
      activitySteps: activityStepsFromProjection(turnState.activity),
      firstTokenAt: event.type === "assistant.delta" ? run.firstTokenAt ?? event.timestamp : run.firstTokenAt,
      completedAt: terminal ? turnState.completedAt : run.completedAt,
      errorMessage: turnState.error ?? run.errorMessage,
    });
  }

  private async persistConversation(input: StartChatRunInput): Promise<boolean> {
    try {
      const response = await fetch("/api/command-room/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: input.conversationId,
          projectId: input.projectId ?? null,
          modelAlias: input.modelId,
          title: input.conversationTitle,
        }),
      });
      if (!response.ok) return false;
      const conv = listConversations("command-room").find((item) => item.id === input.conversationId);
      if (conv) saveConversation({ ...conv, persistence: "server" });
      return Boolean((await response.json().catch(() => null))?.durable);
    } catch {
      return false;
    }
  }

  private async persistMessage(conversationId: string, message: {
    role: "user" | "assistant" | "system";
    content: string;
    parts: OrderedMessagePart[];
    sources: ChatTurnState["sources"];
    artifacts: ChatTurnState["artifacts"];
    modelAlias?: string;
    turnId?: string;
    sequence: number;
  }): Promise<void> {
    try {
      await fetch(`/api/command-room/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: message.role,
          content: message.content,
          parts: message.parts,
          sources: message.sources,
          artifacts: message.artifacts,
          modelAlias: message.modelAlias,
          turnId: message.turnId,
          sequence: message.sequence,
        }),
      });
    } catch {
      // A durable-store outage must not interrupt a live provider stream.
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
      parts: run.messageParts,
      model: {
        alias: run.modelId,
        displayName: run.modelName,
      },
      sources: run.sources,
      artifacts: run.artifacts,
      turnId: run.runId,
      status: "completed" as const,
    };
    saveConversation({ ...conv, messages: [...conv.messages, newMsg], persistence: run.durable ? "server" : "cache" });
    if (run.durable) {
      void this.persistMessage(run.conversationId, {
        role: "assistant",
        content: run.answerBuffer,
        parts: run.messageParts,
        sources: run.sources,
        artifacts: run.artifacts,
        modelAlias: run.modelId,
        turnId: run.runId,
        sequence: conv.messages.length,
      });
    }
    this.updateRun(runId, { phase: "updating_conversation", assistantMessageId: newMsg.id });
  }
}

export const chatRunStore = new ChatRunStore();
