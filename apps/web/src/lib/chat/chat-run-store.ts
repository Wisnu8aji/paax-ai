import { saveConversation, listConversations } from "./chat-history";
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

// Fase kognitif yang dideteksi dari POLA KALIMAT reasoning (bukan domain
// proyek seperti "schedule"/"cost"/"structural" pada versi lama) -- lebih
// dekat ke pengalaman AI coding modern: status mencerminkan APA yang
// sedang dilakukan model (memahami, menganalisis, merencanakan, membandingkan,
// menyimpulkan, menulis), bukan topik teknis yang sedang dibahas. Urutan array
// = urutan prioritas pengecekan -- pola yang lebih spesifik/akhir-proses
// dicek duluan supaya tidak keburu ketangkap pola generik "menganalisis".
type PhasePattern = { label: string; patterns: RegExp[] };

const REASONING_PHASE_PATTERNS: PhasePattern[] = [
  {
    // Menulis/menyusun jawaban akhir -- biasanya muncul di ekor reasoning,
    // menandakan model sudah mendekati selesai berpikir.
    label: "Drafting the answer...",
    patterns: [
      /\b(i'll write|i will write|let me write|now i'll|now i will|writing the|drafting|final answer|let me draft|i should present|i'll present|i'll summarize|let me summarize)\b/i,
      /\b(saya akan menulis|mari saya tulis|saya akan menyajikan|saya akan merangkum|jawaban akhir)\b/i,
    ],
  },
  {
    // Menyimpulkan / memutuskan di antara opsi.
    label: "Weighing the conclusion...",
    patterns: [
      /\b(therefore|so the best|the better (option|choice)|i conclude|in conclusion|the answer is|this means that|so i (should|will) recommend)\b/i,
      /\b(jadi|oleh karena itu|kesimpulannya|dengan demikian|maka|sebaiknya)\b/i,
    ],
  },
  {
    // Membandingkan beberapa opsi/skenario secara eksplisit.
    label: "Weighing the options...",
    patterns: [
      /\b(compare|comparing|on one hand|on the other hand|alternatively|versus|option a|option b|trade-?off)\b/i,
      /\b(dibandingkan|di sisi lain|sebagai alternatif|atau bisa juga|trade-?off)\b/i,
    ],
  },
  {
    // Menyusun rencana/langkah kerja.
    label: "Planning the approach...",
    patterns: [
      /\b(i need to|i'll need to|first,? i|the plan is|steps? (are|would be)|i should (first|start by)|next,? i)\b/i,
      /\b(saya perlu|langkah pertama|rencananya|saya akan mulai dengan|selanjutnya saya)\b/i,
    ],
  },
  {
    // Mendalami/menggali detail teks atau data yang diberikan user.
    label: "Digging into the details...",
    patterns: [
      /\b(looking at|examining|the data shows|according to the|based on the (result|data|tool)|let me check|checking the)\b/i,
      /\b(melihat|memeriksa|berdasarkan (data|hasil|tool)|mari saya cek|mengecek)\b/i,
    ],
  },
  {
    // Memahami permintaan/pertanyaan user -- fase paling awal reasoning.
    label: "Understanding the request...",
    patterns: [
      /\b(the user (wants|is asking|needs)|what (they're|is being) asking|let me understand|to answer this)\b/i,
      /\b(pengguna (ingin|bertanya|meminta)|untuk menjawab ini|memahami permintaan)\b/i,
    ],
  },
];

// Status berdasarkan FASE PROSES reasoning (bukan domain/topik, bukan teks
// reasoning mentah). User tidak ingin isi reasoning ditampilkan untuk
// Lucent/Arete; ia ingin ringkasan "AI sedang ngapain" yang benar-benar
// mencerminkan tahap kognitif, diperbarui pelan (lihat startTimer, max
// 1x/detik) agar tidak berkedip-kedip. TIDAK dipakai untuk Noir -- Noir
// menampilkan reasoning penuh apa adanya (lihat RunStatus.tsx), bukan label
// ringkasan.
function getReasoningContextStatus(reasoningContent: string): string {
  const latest = reasoningContent.slice(-1200);

  for (const { label, patterns } of REASONING_PHASE_PATTERNS) {
    if (patterns.some((re) => re.test(latest))) {
      return label;
    }
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

export type AIModelName = "Lucent" | "Arete" | "Noir";

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
  // Timestamp (ms) event reasoning_summary (status-summary Mistral Small 3)
  // PERTAMA diterima untuk run ini -- dipakai timer di startTimer() sebagai
  // flag permanen "run ini sudah mode Mistral", bukan window waktu. Begitu
  // terisi, timer TIDAK PERNAH lagi menimpa statusLabel dengan label regex
  // generik (getReasoningContextStatus) -- dua gaya bahasa berbeda yang
  // bergantian terlihat bolak-balik/membingungkan (dilaporkan user 2026-07-18).
  lastStatusSummaryAt?: number;

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
  modelName: "Lucent" | "Arete" | "Noir";
  effort?: "low" | "medium" | "high" | "max";
  thinking?: "on" | "off";
  // Proyek aktif (folderId percakapan) -- diteruskan ke /api/command-room/chat
  // supaya tool_call (query_project_graph/query_rab/dst) bisa ambil data proyek
  // nyata via DB_API_URL, bukan hanya konteks teks bebas connector. Opsional:
  // tanpa ini tool tetap fallback "data tidak tersedia" (route.ts sudah
  // mendukung projectId opsional sejak awal, client ini yang belum mengirimnya).
  projectId?: string;
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
      } else if (run.phase === "receiving_reasoning" && run.modelName !== "Noir") {
        // Status diperbarui MAX 1x/detik di sini (timer ini), bukan langsung
        // di setiap delta reasoning — delta bisa masuk puluhan kali/detik,
        // kalau statusLabel ikut berubah tiap delta jadinya berkedip-kedip.
        // Isinya ringkasan FASE PROSES, BUKAN teks reasoning mentah -- Lucent/
        // Arete TIDAK menampilkan isi reasoning langsung.
        // Noir SENGAJA dikecualikan dari klasifikasi label ini -- Noir
        // menampilkan reasoningContent penuh apa adanya (lihat RunStatus.tsx),
        // jadi statusLabel-nya cukup generik, tidak perlu diringkas jadi fase.
        //
        // Begitu status-summary (Mistral) pernah masuk sekali untuk run ini,
        // JANGAN PERNAH balik ke label regex generik lagi -- dua gaya bahasa
        // berbeda (kontekstual spesifik vs fase abstrak "Weighing the
        // options...") yang bergantian terlihat bolak-balik dan membingungkan
        // (dilaporkan user 2026-07-18). lastStatusSummaryAt dipakai sebagai flag
        // permanen "sudah pernah dapat label Mistral", bukan window waktu --
        // begitu terisi, timer berhenti menyentuh statusLabel sampai event
        // reasoning_summary berikutnya yang mengisinya sendiri.
        if (run.lastStatusSummaryAt === undefined) {
          this.updateRun(runId, { elapsedMs, statusLabel: getReasoningContextStatus(run.reasoningContent) });
        } else {
          this.updateRun(runId, { elapsedMs });
        }
      } else if (run.phase === "receiving_reasoning") {
        // Noir: status tetap statis/generik selama reasoning berlangsung --
        // konten reasoning penuhnya ditampilkan terpisah di UI, bukan diringkas.
        this.updateRun(runId, { elapsedMs, statusLabel: "Reasoning (shown live below)..." });
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
              // Handle reasoning_summary (Mistral Small 3) fire-and-forget: update statusLabel
              // saja TANPA mengubah phase (tetap "receiving_reasoning" agar timer tidak
              // bingung). Client UI akan menampilkan statusLabel baru ini sebagai ringkasan
              // topik reasoning kontekstual.
              if (parsed.phase === "reasoning_summary") {
                this.updateRun(runId, { statusLabel: parsed.statusLabel, lastStatusSummaryAt: Date.now() });
              } else {
                this.updateRun(runId, { phase: parsed.phase, statusLabel: parsed.statusLabel, statusDetail: parsed.statusDetail });
              }
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
    };
    saveConversation(conv);
    this.updateRun(runId, { phase: "updating_conversation", assistantMessageId: newMsg.id });
  }
}

export const chatRunStore = new ChatRunStore();
