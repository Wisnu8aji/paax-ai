import { saveConversation, listConversations, summarizeConversation } from "./chat-history";
import type { RunPhase, CommandRoomStreamEvent } from "./chat-stream-events";
import { formatRunDuration } from "./format-run-duration";

const PRE_REASONING_STATUS_LABELS = [
  "Thinking...",
  "Reading the request...",
  "Understanding the context...",
  "Mapping the problem...",
  "Checking constraints...",
  "Planning the answer...",
  "Structuring the response...",
  "Reviewing the direction...",
  "Working through details...",
  "Still thinking carefully..."
];

function getPreReasoningStatusLabel(elapsedMs: number) {
  const index = Math.min(
    Math.floor(elapsedMs / 10_000),
    PRE_REASONING_STATUS_LABELS.length - 1
  );
  return PRE_REASONING_STATUS_LABELS[index];
}

// Status berdasarkan konteks reasoning — bukan teks reasoning mentah. User
// tidak ingin isi reasoning ditampilkan; ia ingin ringkasan "AI sedang
// ngapain", diperbarui pelan (lihat startTimer, max 1x/detik) agar tidak
// berkedip-kedip.
function getReasoningContextStatus(reasoningContent: string): string {
  const latest = reasoningContent.slice(-1000).toLowerCase();

  if (latest.includes("schedule") || latest.includes("timeline") || latest.includes("jadwal") || latest.includes("durasi") || latest.includes("waktu")) {
    return "Evaluating schedule risks...";
  }
  if (latest.includes("cost") || latest.includes("budget") || latest.includes("biaya") || latest.includes("anggaran")) {
    return "Reviewing cost impact...";
  }
  if (latest.includes("structure") || latest.includes("concrete") || latest.includes("reinforcement") || latest.includes("struktur") || latest.includes("beton") || latest.includes("tulangan")) {
    return "Analyzing structural constraints...";
  }
  if (latest.includes("contract") || latest.includes("owner") || latest.includes("variation order") || latest.includes("kontrak") || latest.includes("pemilik") || latest.includes("vo")) {
    return "Checking contractual implications...";
  }
  if (latest.includes("option") || latest.includes("scenario") || latest.includes("skenario") || latest.includes("opsi")) {
    return "Comparing possible scenarios...";
  }
  if (latest.includes("recommendation") || latest.includes("conclusion") || latest.includes("rekomendasi") || latest.includes("kesimpulan")) {
    return "Forming the recommendation...";
  }

  return "Reasoning through the problem...";
}

export type RunState =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export type AIModelName = "Lucent" | "Solace";

export type ActiveRun = {
  runId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId?: string;

  modelId: string;
  modelName: AIModelName;

  state: RunState;
  phase: RunPhase;

  statusLabel: string;
  statusDetail?: string;

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
  modelName: "Lucent" | "Solace";
  effort?: "low" | "medium" | "high" | "max";
  thinking?: "on" | "off";
  projectId?: string | null;
  conversationSummary?: string;
};

type Listener = () => void;

class ChatRunStore {
  private state: CommandRoomRunStoreState = {
    runsById: {},
    activeRunIdsByConversationId: {},
  };
  private listeners: Set<Listener> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private activeStreamRunIds: Set<string> = new Set();
  private processedEventKeys: Set<string> = new Set();

  getSnapshot = (): CommandRoomRunStoreState => {
    return this.state;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getRunsByConversationId(conversationId: string): ActiveRun[] {
    const runIds = this.state.activeRunIdsByConversationId[conversationId] || [];
    return runIds.map((id) => this.state.runsById[id]).filter(Boolean);
  }

  getActiveRunsByConversationId(conversationId: string): ActiveRun[] {
    return this.getRunsByConversationId(conversationId).filter(
      (r) => r.state === "queued" || r.state === "running" || r.state === "streaming"
    );
  }

  updateRun(runId: string, patch: Partial<ActiveRun>) {
    const run = this.state.runsById[runId];
    if (!run) return;
    this.state = {
      ...this.state,
      runsById: {
        ...this.state.runsById,
        [runId]: { ...run, ...patch, updatedAt: new Date().toISOString() }
      }
    };
    this.notify();
  }

  cancelRun(runId: string) {
    const run = this.state.runsById[runId];
    if (!run || run.state === "completed" || run.state === "failed" || run.state === "cancelled") return;

    this.abortControllers.get(runId)?.abort();
    this.abortControllers.delete(runId);
    this.stopTimer(runId);

    const now = new Date().toISOString();
    const elapsedMs = new Date(now).getTime() - new Date(run.startedAt).getTime();
    
    this.updateRun(runId, {
      state: "cancelled",
      phase: "cancelled",
      statusLabel: "Cancelled",
      cancelledAt: now,
      elapsedMs,
      finalDurationLabel: formatRunDuration(elapsedMs, 'stopped')
    });
  }

  private startTimer(runId: string) {
    if (this.timers.has(runId)) return;
    const interval = setInterval(() => {
      const run = this.state.runsById[runId];
      if (!run || run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
        this.stopTimer(runId);
        return;
      }
      const elapsedMs = new Date().getTime() - new Date(run.startedAt).getTime();

      if (!run.hasReasoningStarted) {
        // Belum ada reasoning sama sekali — label generik yang berputar
        // sambil menunggu token pertama dari model.
        this.updateRun(runId, { elapsedMs, statusLabel: getPreReasoningStatusLabel(elapsedMs) });
      } else if (run.phase === "receiving_reasoning") {
        // Status diperbarui MAX 1x/detik di sini (timer ini), bukan langsung
        // di setiap delta reasoning — delta bisa masuk puluhan kali/detik,
        // kalau statusLabel ikut berubah tiap delta jadinya berkedip-kedip.
        // Isinya ringkasan konteks, BUKAN teks reasoning mentah — user tidak
        // ingin isi reasoning ditampilkan langsung.
        this.updateRun(runId, { elapsedMs, statusLabel: getReasoningContextStatus(run.reasoningContent) });
      } else {
        this.updateRun(runId, { elapsedMs });
      }
    }, 1000);
    this.timers.set(runId, interval);
  }

  private stopTimer(runId: string) {
    const interval = this.timers.get(runId);
    if (interval) clearInterval(interval);
    this.timers.delete(runId);
  }

  async startChatRun(input: StartChatRunInput): Promise<void> {
    if (this.activeStreamRunIds.has(input.runId || "")) {
      return;
    }
    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.activeStreamRunIds.add(runId);
    
    const now = new Date().toISOString();

    const newRun: ActiveRun = {
      runId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      modelId: input.modelId,
      modelName: input.modelName,
      state: "running",
      phase: "preparing_prompt",
      statusLabel: "Thinking...",
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
      runsById: {
        ...this.state.runsById,
        [runId]: newRun
      },
      activeRunIdsByConversationId: {
        ...this.state.activeRunIdsByConversationId,
        [input.conversationId]: [...existing, runId]
      }
    };

    const controller = new AbortController();
    this.abortControllers.set(runId, controller);
    this.startTimer(runId);
    this.notify();

    try {
      this.updateRun(runId, { phase: "calling_model" });

      const response = await fetch("/api/command-room/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: input.historyMessages,
          modelAlias: input.modelId,
          reasoningEffort: input.effort,
          thinking: input.thinking,
          projectId: input.projectId,
          conversationSummary: input.conversationSummary,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody.error) errMessage = errBody.error;
        } catch (e) {}
        throw new Error(errMessage);
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
        
        // Split by SSE newline boundary
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the last incomplete part in the buffer

        for (const block of lines) {
          const parts = block.split("\n");
          let eventType = "message";
          let data = "";

          for (const line of parts) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              data = line.slice(6);
            }
          }

          if (data === "[DONE]") continue;
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            
            // Deduplication logic
            if (parsed.sequence !== undefined) {
              const eventKey = `${runId}:${parsed.sequence}`;
              if (this.processedEventKeys.has(eventKey)) {
                continue;
              }
              this.processedEventKeys.add(eventKey);
            }

            if (parsed.type === "status") {
              this.updateRun(runId, { phase: parsed.phase, statusLabel: parsed.statusLabel, statusDetail: parsed.statusDetail });
            } else if (parsed.type === "reasoning") {
              const run = this.state.runsById[runId];
              const deltaText = parsed.delta || "";
              // statusLabel TIDAK diubah di sini — delta reasoning bisa masuk
              // puluhan kali/detik, kalau ticker ikut berubah tiap delta jadi
              // berkedip-kedip dan tidak terbaca. Ticker diperbarui max 1x/detik
              // oleh timer di startTimer().
              this.updateRun(runId, {
                state: "streaming",
                phase: "receiving_reasoning",
                reasoningContent: run.reasoningContent + deltaText,
                hasReasoningStarted: run.hasReasoningStarted || deltaText.trim().length > 0,
                firstReasoningAt: run.firstReasoningAt || new Date().toISOString(),
              });
            } else if (parsed.type === "content") {
              const run = this.state.runsById[runId];
              this.updateRun(runId, {
                state: "streaming",
                phase: "streaming_response",
                answerBuffer: run.answerBuffer + (parsed.delta || ""),
                statusLabel: "Writing the response...",
                firstTokenAt: run.firstTokenAt || new Date().toISOString(),
              });
            } else if (parsed.type === "error") {
              throw new Error(parsed.errorMessage);
            }
          } catch (e) {
            // Ignore parse errors from partial chunks
          }
        }
      }

      // Done
      this.stopTimer(runId);
      const finishedRun = this.state.runsById[runId];
      if (finishedRun.state === "cancelled") return; // Was cancelled during read

      const finishedNow = new Date().toISOString();
      const totalMs = new Date(finishedNow).getTime() - new Date(finishedRun.startedAt).getTime();
      const hasReasoning = Boolean(finishedRun.reasoningContent?.trim());
      
      this.updateRun(runId, {
        state: "completed",
        phase: "completed",
        statusLabel: "Response completed.",
        completedAt: finishedNow,
        elapsedMs: totalMs,
        finalMarkdown: finishedRun.answerBuffer,
        finalRenderedContent: finishedRun.answerBuffer,
        finalDurationLabel: formatRunDuration(totalMs, hasReasoning ? 'reasoned' : 'thought'),
      });

      // Save to chat-history.ts
      this.saveFinishedRunToHistory(runId);

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Cancelled explicitly handled in cancelRun
        return;
      }
      this.stopTimer(runId);
      const errRun = this.state.runsById[runId];
      if (errRun.state === "cancelled") return;

      const errNow = new Date().toISOString();
      const totalMs = new Date(errNow).getTime() - new Date(errRun.startedAt).getTime();

      this.updateRun(runId, {
        state: "failed",
        phase: "failed",
        statusLabel: "Failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        failedAt: errNow,
        elapsedMs: totalMs,
        finalDurationLabel: formatRunDuration(totalMs, 'failed'),
      });
    } finally {
      this.abortControllers.delete(runId);
      this.activeStreamRunIds.delete(runId);
    }
  }

  private saveFinishedRunToHistory(runId: string) {
    const run = this.state.runsById[runId];
    if (!run || run.state !== "completed") return;
    
    // Find conversation
    const conversations = listConversations(run.conversationId.split('_')[0] || "command-room"); 
    // Wait, chat history is local storage scoped by 'command-room'. 
    // Actually the scope is always 'command-room'. Let's search all to be safe or we need the exact conversation object.
    // The safest way is to let the user get the current conversation from `chat-history.ts` by searching all conversations
    // Since `listConversations(projectId)` exists. For Command Room, projectId = 'command-room'.
    const convList = listConversations("command-room");
    let conv = convList.find((c) => c.id === run.conversationId);
    if (!conv) return;

    const newMsg = {
      id: `a-${Date.now()}`,
      role: "assistant" as const,
      text: run.answerBuffer,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    conv = {
      ...conv,
      messages: [...conv.messages, newMsg],
      summary: summarizeConversation([...conv.messages, newMsg]),
    };
    saveConversation(conv);
    this.updateRun(runId, { phase: "updating_conversation", assistantMessageId: newMsg.id });
  }
}

export const chatRunStore = new ChatRunStore();
