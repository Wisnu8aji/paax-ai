/**
 * POST /api/command-room/chat
 *
 * Server-side API route untuk Command Room (Streaming).
 * 3 model: Lucent (DeepSeek V4 Pro), Arete (Qwen3.7-Plus), Noir
 * (model reasoning native). Semua bisa lewat 1 API key OpenRouter (sk-or-v1-...) yang
 * dibaca dari DEEPSEEK_API_KEY, ATAU lewat API key native per-provider
 * (DASHSCOPE_API_KEY / ANTHROPIC_API_KEY) kalau ada — native diprioritaskan
 * kalau keduanya kebetulan terisi. API key TIDAK PERNAH dikirim ke client.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import {
  type ModelAlias,
  type ReasoningEffort,
  type ThinkingMode,
  getModel,
  resolveThinking,
  PAAX_MODELS,
} from "@/lib/paax-models";
import { extractDelta } from "./sse-helpers";
import {
  isToolsEnabled,
  withToolSystemPrompt,
  runOpenRouterWithTools,
  runDeepSeekNativeWithTools,
  runAnthropicWithTools,
  type ToolChatMessage,
} from "./tools";
import { evaluateEvidenceGate, buildIntentFrame, planDepthStatusMessage, buildExecutionPlan } from "@paax/ai-orchestrator/router";
import {
  buildServerChatContext,
  CHAT_CONTEXT_LIMITS,
  createDbContextLoaders,
  outputTokenLimit,
  validateChatPayload,
} from "./context";
import { verifyAndComposeClaims } from "./claim-pipeline";
import { persistConversationSummary } from "./memory-runtime";
import { createStatusSummaryScheduler } from "./status-summarizer";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 menit

// ─── Schema validasi request ─────────────────────────────────────────────────

const CommandRoomChatSchema = z.object({
  runId: z.string().optional(),
  conversationId: z.string().optional(),
  // Fase 10 (PLAN.md §9): projectId OPSIONAL -- kalau dikirim, tool_call
  // (query_rab/query_schedule/export_rab_xlsx/project_diagnostics) bisa ambil
  // data proyek nyata via DB_API_URL. Client saat ini (chat-run-store.ts) BELUM
  // mengirim field ini -- context proyek masih lewat teks bebas di messages
  // (lib/ai/project-context.ts, buildProjectContextPack). Field ini backward-
  // compatible: tidak dikirim = tool tetap fallback "data tidak tersedia"
  // seperti perilaku sebelumnya, TIDAK merusak apa pun yang sudah jalan.
  projectId: z.string().optional(),
  snapshotId: z.string().optional(),
  // rabLines opsional -- alternatif projectId+DB_API_URL untuk kirim data RAB
  // langsung tanpa services/db (mis. client sudah punya draft RAB di state lokal).
  rabLines: z
    .array(
      z.object({
        id: z.string(),
        ahsp_code: z.string(),
        volume: z.number().nullable(),
        duration_days: z.number().nullable().optional(),
        ahsp_suggested: z.boolean().optional(),
      }),
    )
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(40),
  modelAlias: z.enum(["lucent", "arete", "noir"]),
  reasoningEffort: z.enum(["low", "medium", "high", "max"]).default("high"),
  thinking: z.enum(["on", "off"]).default("off"),
});

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type RabLineSnapshotInput = NonNullable<z.infer<typeof CommandRoomChatSchema>["rabLines"]>[number];

const SYSTEM_PROMPT =
  "Anda adalah PAAX, asisten AI untuk insinyur sipil Indonesia. Anda WAJIB dan SELALU menjawab menggunakan Bahasa Indonesia yang natural dan profesional. Jangan pernah menjawab menggunakan bahasa Mandarin (Chinese). Jika pengguna menyapa dengan 'halo', balaslah dengan Bahasa Indonesia yang ramah.";

function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const hasSystem = messages.some((m) => m.role === "system");
  return hasSystem ? messages : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
}

type SendEvent = (type: string, data: Record<string, unknown>) => void;

// ─── Status summarizer (Mistral Small 3 via OpenRouter) ───────────────────────

/**
 * Ringkas cuplikan reasoning jadi status super pendek (maks ~8 kata) via
 * Mistral Small 3 (OpenRouter, key sama dengan DEEPSEEK_API_KEY/getSharedKey()
 * yang sudah dipakai Command Room -- TIDAK perlu key/provider baru) --
 * menggantikan label regex generik supaya status benar-benar mencerminkan
 * topik yang sedang dipikirkan model (mis. "Membandingkan HSPK galian tanah
 * dan pondasi batu kali"), bukan sekadar fase abstrak ("Weighing the
 * options..."). Dipanggil server-side, TIDAK di-stream -- harus cepat (model
 * kecil, tanpa reasoning) dan tidak boleh pernah menggagalkan chat utama:
 * kalau gagal/timeout, caller wajib fallback ke label lama (lihat
 * getReasoningContextStatus di chat-run-store.ts, tapi versi servernya di sini).
 */
async function summarizeReasoningStatus(
  reasoningSnippet: string,
  req: NextRequest,
): Promise<string | null> {
  const apiKey = getSharedKey();
  if (!apiKey || !isOpenRouterKey(apiKey)) return null;
  try {
    const controller = new AbortController();
    // 4s awalnya terlalu ketat -- live-test 2026-07-18 menunjukkan hampir
    // SEMUA panggilan Mistral timeout (AbortError) sebelum sempat selesai,
    // sehingga label kontekstual nyaris tidak pernah sampai ke user meski
    // request-nya tercatat di dashboard OpenRouter. 12s memberi ruang untuk
    // model kecil yang sedang antre di provider tanpa menahan stream utama
    // terlalu lama (dipanggil fire-and-forget, tidak pernah di-await di jalur
    // kritis kecuali saat penutupan stream lewat pendingStatusSummaries).
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: STATUS_SUMMARY_MODEL,
        messages: [
          {
            role: "system",
            content: "Summarize the following AI reasoning excerpt into ONE short English phrase (max 8 words), present tense, describing WHAT is currently being thought about/worked on -- not a conclusion, no trailing punctuation, no quotes. Example: 'Comparing HSPK for earthwork and stone foundation'. Reply with ONLY that phrase, nothing else.",
          },
          { role: "user", content: reasoningSnippet.slice(-1500) },
        ],
        max_tokens: 32,
        temperature: 0.3,
        stream: false,
        reasoning: { enabled: false, effort: "none", exclude: true },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[status-summary] HTTP ${res.status}: ${errBody.slice(0, 500)}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      console.error(`[status-summary] no content in response: ${JSON.stringify(data).slice(0, 500)}`);
      return null;
    }
    const trimmed = text.trim().replace(/^["']|["']$/g, "");
    return trimmed.length > 0 && trimmed.length < 200 ? trimmed : null;
  } catch (err) {
    console.error(`[status-summary] exception:`, err); // timeout/error apa pun -- diamkan, caller fallback ke label lama
    return null;
  }
}

// ─── Helper: baca env ──────────

function getSharedKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY?.trim() || undefined;
}

function getDeepSeekBaseUrl(): string {
  return (
    process.env.DEEPSEEK_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.deepseek.com"
  );
}

function getDashScopeKey(): string | undefined {
  return process.env.DASHSCOPE_API_KEY?.trim() || undefined;
}

function getDashScopeBaseUrl(): string {
  return (
    process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  );
}

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
}

// Slug OpenRouter untuk Mistral Small 3 -- model kecil/cepat khusus meringkas
// status, TIDAK dipakai untuk jawaban chat utama. Override via env kalau slug
// OpenRouter berubah.
const STATUS_SUMMARY_MODEL =
  process.env.STATUS_SUMMARY_MODEL?.trim() || "mistralai/mistral-small-3.1-24b-instruct";

function isOpenRouterKey(apiKey: string): boolean {
  return apiKey.trim().startsWith("sk-or-v1-");
}

/** Slug model per provider di OpenRouter — dipakai kalau routing lewat 1 shared key. */
const OPENROUTER_MODEL_SLUG: Record<ModelAlias, string> = {
  lucent: "deepseek/deepseek-v4-pro",
  arete: "qwen/qwen3.7-plus",
  noir: `anthropic/${getModel("noir").apiModel}`,
};

/**
 * Mapping effort app (high/max) -> string reasoning.effort yang dikirim ke
 * OpenRouter, PER MODEL — bukan satu mapping generik. Dibuktikan lewat probe
 * langsung (2026-07-12): Noir via OpenRouter praktis tidak
 * menghasilkan reasoning yang terlihat di effort "high" untuk pertanyaan
 * sederhana (0 char), baru muncul jelas di "xhigh" (282 char) dan "max" (746
 * char) — jadi utk Noir, app "high" HARUS dipetakan ke provider "xhigh" biar
 * thinking benar-benar terasa aktif, bukan ke provider "high" yang literal.
 * DeepSeek (Lucent) dan Qwen (Arete) sudah terbukti reasoning-nya jelas di
 * kedua effort dengan mapping high/xhigh biasa.
 */
const OPENROUTER_EFFORT_MAP: Record<ModelAlias, { high: string; max: string }> = {
  lucent: { high: "high", max: "xhigh" },
  arete: { high: "high", max: "xhigh" },
  noir: { high: "xhigh", max: "max" },
};

type KeyResolution = { apiKey: string; viaOpenRouter: boolean };

/**
 * Resolusi key per model: native key (DASHSCOPE_API_KEY/ANTHROPIC_API_KEY)
 * diprioritaskan kalau ada; kalau tidak, jatuh ke shared key (DEEPSEEK_API_KEY)
 * — dan HANYA dipakai untuk Arete/Noir kalau shared key itu memang key
 * OpenRouter (banyak user cuma punya 1 OpenRouter key untuk ketiga model).
 */
function resolveKeyForModel(modelAlias: ModelAlias): KeyResolution | null {
  const shared = getSharedKey();
  const sharedIsOr = shared ? isOpenRouterKey(shared) : false;

  if (modelAlias === "lucent") {
    if (!shared) return null;
    return { apiKey: shared, viaOpenRouter: sharedIsOr };
  }
  if (modelAlias === "arete") {
    const native = getDashScopeKey();
    if (native) return { apiKey: native, viaOpenRouter: false };
    if (shared && sharedIsOr) return { apiKey: shared, viaOpenRouter: true };
    return null;
  }
  // noir
  const native = getAnthropicKey();
  if (native) return { apiKey: native, viaOpenRouter: false };
  if (shared && sharedIsOr) return { apiKey: shared, viaOpenRouter: true };
  return null;
}

// ─── Shared OpenAI-compatible SSE consumer (dipakai oleh semua path fetch) ────

async function consumeOpenAiCompatibleStream(
  res: Response,
  sendEvent: SendEvent,
  pendingStatusSummaries: Promise<unknown>[],
  runId: string | undefined,
  conversationId: string | undefined,
  modelAlias?: ModelAlias,
  req?: NextRequest,
): Promise<{ finishedOnLength: boolean; fullContent: string }> {
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullContent = "";
  let finishedOnLength = false;
  const statusScheduler = createStatusSummaryScheduler({
    enabled: process.env.COMMAND_ROOM_STATUS_SUMMARY_ENABLED?.trim().toLowerCase() !== "false",
    minIntervalMs: Number.parseInt(process.env.COMMAND_ROOM_STATUS_SUMMARY_MIN_INTERVAL_MS ?? "15000", 10) || 15_000,
    executor: async (snippet) => req ? summarizeReasoningStatus(snippet, req) : null,
  });

  // Akumulasi reasoning + throttle status-summary setiap ~500 karakter baru
  // (fire-and-forget, TIDAK menahan stream utama). Awalnya berbasis hitung
  // kalimat (titik/tanda tanya), tapi reasoning model kerap berbentuk outline
  // terstruktur ("1. **Analyze...**", "* User wants...") tanpa banyak kalimat
  // naratif berakhiran titik+spasi -- ditemukan lewat live-test 2026-07-18:
  // Arete 613 reasoning delta tapi 0 event reasoning_summary karena threshold
  // kalimat tidak pernah tercapai. Hitung karakter jauh lebih andal lintas gaya
  // reasoning (naratif maupun bullet list).
  let reasoningAccumulator = "";
  let charsSinceLastSummary = 0;
  const SUMMARY_TRIGGER_CHARS = 500;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const chunk of lines) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const dataStr = dataLine.slice(6).trim();
      if (!dataStr || dataStr === "[DONE]") continue;

      try {
        const parsedChunk = JSON.parse(dataStr);
        const delta = parsedChunk.choices?.[0]?.delta;
        const finishReason = parsedChunk.choices?.[0]?.finish_reason;
        if (finishReason === "length") finishedOnLength = true;
        if (!delta) continue;

        const { content, reasoning } = extractDelta(delta);
        if (reasoning) {
          sendEvent("message", { type: "reasoning", runId, conversationId, delta: reasoning, timestamp: new Date().toISOString() });

          // Status-summary (Mistral Small 3) HANYA untuk Lucent/Arete, BUKAN Noir.
          if (modelAlias && (modelAlias === "lucent" || modelAlias === "arete") && req) {
            reasoningAccumulator += reasoning;
            charsSinceLastSummary += reasoning.length;

            // Trigger status-summary setiap ~500 karakter baru, TIDAK menahan stream utama.
            if (charsSinceLastSummary >= SUMMARY_TRIGGER_CHARS) {
              charsSinceLastSummary = 0;
              const snippet = reasoningAccumulator;
              statusScheduler.schedule(runId ?? "anonymous", snippet, (label) => {
                sendEvent("message", {
                  type: "status", phase: "reasoning_summary", statusLabel: label,
                  runId, conversationId, timestamp: new Date().toISOString(),
                });
              });
            }
          }
        }
        if (content) {
          fullContent += content;
          sendEvent("message", { type: "content", runId, conversationId, delta: content, timestamp: new Date().toISOString() });
        }
      } catch { /* partial chunk, abaikan */ }
    }
  }
  return { finishedOnLength, fullContent };
}

async function fetchOrThrow(url: string, apiKey: string, payload: unknown, req: NextRequest): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: req.signal,
  });
  if (!res.ok) {
    let errMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errBody = await res.json();
      if (errBody.error?.message) errMessage = errBody.error.message;
    } catch { /* body bukan JSON */ }
    throw new Error(errMessage);
  }
  return res;
}

// ─── OpenRouter — unified path untuk Lucent/Arete/Noir dengan 1 shared key ────
// OpenRouter punya kontrol reasoning yang SAMA lintas provider (`reasoning`,
// `reasoning_effort`, `include_reasoning`) — jangan sisipkan field native
// provider tertentu (mis. `thinking` ala DeepSeek) di jalur ini, berisiko
// ditolak provider lain saat `require_parameters: true`.

async function streamOpenRouter(
  modelAlias: ModelAlias,
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
  req: NextRequest,
  sendEvent: SendEvent,
  pendingStatusSummaries: Promise<unknown>[],
  runId: string | undefined,
  conversationId: string | undefined,
): Promise<void> {
  const model = OPENROUTER_MODEL_SLUG[modelAlias];
  const normalizedEffort = effort === "max" ? OPENROUTER_EFFORT_MAP[modelAlias].max : OPENROUTER_EFFORT_MAP[modelAlias].high;
  const basePayload: Record<string, any> = {
    model,
    messages: withSystemPrompt(messages),
    stream: true,
  };
  if (thinking === "on") {
    basePayload.max_tokens = outputTokenLimit(thinking, effort);
    basePayload.reasoning = { enabled: true, effort: normalizedEffort, exclude: false };
    basePayload.reasoning_effort = normalizedEffort;
    basePayload.include_reasoning = true;
    basePayload.provider = { require_parameters: true };
  } else {
    basePayload.max_tokens = outputTokenLimit(thinking, effort);
    basePayload.temperature = 0.2;
    basePayload.reasoning = { enabled: false, effort: "none", exclude: true };
  }

  const MAX_CONTINUATIONS = CHAT_CONTEXT_LIMITS.maxContinuations;
  let currentMessages = [...basePayload.messages];
  let hitLengthLimit = true;
  let continuationCount = 0;

  while (hitLengthLimit) {
    hitLengthLimit = false;
    const currentPayload: Record<string, any> = { ...basePayload, messages: currentMessages };

    if (continuationCount > 0) {
      // Auto-continue: matikan reasoning agar fokus menulis sisa konten.
      // reasoning_effort TIDAK dihapus di sini akan bikin OpenRouter menolak
      // request ("reasoning_effort and reasoning.effort are both provided
      // with conflicting values") karena bertentangan dengan reasoning.effort
      // "none" — ini pernah menggagalkan SETIAP auto-continue, jangan diulang.
      currentPayload.reasoning = { enabled: false, effort: "none", exclude: true };
      currentPayload.include_reasoning = false;
      delete currentPayload.reasoning_effort;
      currentPayload.max_tokens = CHAT_CONTEXT_LIMITS.maxOutputTokens;
    }

    const res = await fetchOrThrow("https://openrouter.ai/api/v1/chat/completions", apiKey, currentPayload, req);
    const { finishedOnLength, fullContent } = await consumeOpenAiCompatibleStream(res, sendEvent, pendingStatusSummaries, runId, conversationId, modelAlias, req);
    hitLengthLimit = finishedOnLength;

    if (hitLengthLimit) {
      continuationCount++;
      if (continuationCount >= MAX_CONTINUATIONS) {
        hitLengthLimit = false;
        sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: "Batas auto-lanjut tercapai, menghentikan generasi." });
        break;
      }
      if (fullContent.trim().length > 0) {
        currentMessages.push({ role: "assistant", content: fullContent });
      }
      sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: `Auto-continuing (part ${continuationCount + 1})...` });
    }
  }
}

// ─── Lucent — DeepSeek native ──────────────────────────────────────────────

function buildDeepSeekPayload(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
): Record<string, any> {
  const payload: Record<string, any> = {
    model: getModel("lucent").apiModel,
    messages: withSystemPrompt(messages),
    stream: true,
  };
  if (thinking === "on") {
    payload.max_tokens = outputTokenLimit(thinking, effort);
    payload.thinking = { type: "enabled" };
    payload.reasoning_effort = effort === "max" ? "max" : "high";
  } else {
    payload.max_tokens = outputTokenLimit(thinking, effort);
    payload.temperature = 0.2;
    payload.thinking = { type: "disabled" };
  }
  return payload;
}

async function streamDeepSeekNative(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
  req: NextRequest,
  sendEvent: SendEvent,
  pendingStatusSummaries: Promise<unknown>[],
  runId: string | undefined,
  conversationId: string | undefined,
  modelAlias?: ModelAlias,
): Promise<void> {
  const payload = buildDeepSeekPayload(messages, thinking, effort);
  const res = await fetchOrThrow(`${getDeepSeekBaseUrl()}/chat/completions`, apiKey, payload, req);
  await consumeOpenAiCompatibleStream(res, sendEvent, pendingStatusSummaries, runId, conversationId, modelAlias, req);
}

// ─── Arete — Qwen3.7-Plus via DashScope native (OpenAI-compatible mode) ───────
// NOTE: field enable_thinking/thinking_budget belum diverifikasi end-to-end
// lewat DashScope langsung (tidak ada DASHSCOPE_API_KEY di lingkungan ini) —
// path yang benar-benar teruji live adalah lewat OpenRouter (streamOpenRouter).
const ARETE_THINKING_BUDGET_HIGH = 16384;

function buildDashScopePayload(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
): Record<string, any> {
  const payload: Record<string, any> = {
    model: getModel("arete").apiModel,
    messages: withSystemPrompt(messages),
    stream: true,
  };
  if (thinking === "on") {
    payload.enable_thinking = true;
    payload.max_tokens = outputTokenLimit(thinking, effort);
    // max effort = tanpa batas (thinking_budget dihilangkan); high = dibatasi.
    if (effort !== "max") payload.thinking_budget = ARETE_THINKING_BUDGET_HIGH;
  } else {
    payload.enable_thinking = false;
    payload.max_tokens = outputTokenLimit(thinking, effort);
    payload.temperature = 0.2;
  }
  return payload;
}

async function streamDashScopeNative(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
  req: NextRequest,
  sendEvent: SendEvent,
  pendingStatusSummaries: Promise<unknown>[],
  runId: string | undefined,
  conversationId: string | undefined,
  modelAlias?: ModelAlias,
): Promise<void> {
  const payload = buildDashScopePayload(messages, thinking, effort);
  const res = await fetchOrThrow(`${getDashScopeBaseUrl()}/chat/completions`, apiKey, payload, req);
  await consumeOpenAiCompatibleStream(res, sendEvent, pendingStatusSummaries, runId, conversationId, modelAlias, req);
}

// ─── Noir — provider native SDK resmi (native key saja) ─────────

function splitSystemAndMessages(messages: ChatMessage[]): { system?: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const withSystem = withSystemPrompt(messages);
  const systemParts = withSystem.filter((m) => m.role === "system").map((m) => m.content);
  const rest = withSystem
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role === "user" || m.role === "assistant");
  return { system: systemParts.length ? systemParts.join("\n\n") : undefined, messages: rest };
}

async function streamAnthropicNative(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
  req: NextRequest,
  sendEvent: SendEvent,
  runId: string | undefined,
  conversationId: string | undefined,
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const { system, messages: anthropicMessages } = splitSystemAndMessages(messages);

  const stream = client.messages.stream(
    {
      model: getModel("noir").apiModel,
      max_tokens: outputTokenLimit(thinking, effort),
      system,
      messages: anthropicMessages,
      thinking: thinking === "on" ? { type: "adaptive", display: "summarized" } : { type: "disabled" },
      output_config: { effort: effort === "max" ? "max" : "xhigh" },
    },
    { signal: req.signal },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const delta: any = event.delta;
      if (delta.type === "thinking_delta" && delta.thinking) {
        sendEvent("message", { type: "reasoning", runId, conversationId, delta: delta.thinking, timestamp: new Date().toISOString() });
      } else if (delta.type === "text_delta" && delta.text) {
        sendEvent("message", { type: "content", runId, conversationId, delta: delta.text, timestamp: new Date().toISOString() });
      }
    }
  }
}

// ─── Fase 0 tool-calling bridge ────────────────────────────────────────────
// Jembatan antara 4 jalur provider Command Room (OpenRouter/DeepSeek-native/
// DashScope-native/Anthropic-native) dan tool-loop provider-agnostic di tools.ts.
// Mengembalikan messages yang sudah diperkaya hasil tool (kalau ada tool dipakai)
// untuk diteruskan ke fungsi stream*() yang sudah ada tanpa mengubahnya.

/**
 * Ubah history tool-loop (ToolChatMessage[] -- termasuk role:"tool" dan
 * assistant.tool_calls terstruktur) jadi ChatMessage[] biasa yang dipahami
 * fungsi stream*() lama (role hanya user/assistant/system, content selalu
 * string). stream*() TIDAK tahu apa itu role "tool" atau tool_calls -- kalau
 * dikirim mentah (lewat type-cast paksa), providernya menerima payload yang
 * secara struktural salah. Di sini tool call & hasilnya diringkas jadi teks
 * assistant yang wajar, supaya giliran stream final punya konteks lengkap
 * tanpa mengekspos role asing ke jalur yang tidak didesain untuk itu.
 */
function flattenToolHistoryToChatMessages(toolMessages: ToolChatMessage[]): ChatMessage[] {
  const flattened: ChatMessage[] = [];
  for (const msg of toolMessages) {
    if (msg.role === "tool") {
      flattened.push({ role: "assistant", content: `[Hasil tool] ${msg.content ?? ""}` });
    } else if (msg.role === "assistant" && msg.tool_calls?.length) {
      const summary = msg.tool_calls.map((tc) => `memanggil tool ${tc.function.name}(${tc.function.arguments})`).join("; ");
      flattened.push({ role: "assistant", content: `[Tindakan] ${summary}` });
    } else {
      flattened.push({ role: msg.role as "user" | "assistant" | "system", content: msg.content ?? "" });
    }
  }
  return flattened;
}

async function resolveToolsForModel(
  modelAlias: ModelAlias,
  messages: ChatMessage[],
  apiKey: string,
  viaOpenRouter: boolean,
  req: NextRequest,
  sendEvent: SendEvent,
  runId: string | undefined,
  conversationId: string | undefined,
  projectId: string | undefined,
  rabLines: RabLineSnapshotInput[] | undefined,
): Promise<ChatMessage[]> {
  const withPrompt = withSystemPrompt(messages) as ToolChatMessage[];
  // Fase 10 (PLAN.md §9): projectId/rabLines opsional dari request body ->
  // ChatContext untuk tool query_rab/query_schedule/export_rab_xlsx/
  // project_diagnostics. undefined kalau client tidak mengirim (perilaku lama
  // tetap sama). rabLines dikirim langsung TIDAK butuh services/db.
  const toolContext = (projectId || rabLines)
    ? {
        project_id: projectId,
        conversation_id: conversationId,
        rab_lines: rabLines?.map((line) => ({ ...line, duration_days: line.duration_days ?? null })),
      }
    : undefined;
  const hasProjectContext = Boolean(toolContext);

  if (viaOpenRouter) {
    const { messages: resolved, usedTool } = await runOpenRouterWithTools({
      modelSlug: OPENROUTER_MODEL_SLUG[modelAlias],
      modelAlias,
      apiKey,
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", hasProjectContext) }, ...withPrompt.slice(1)],
      context: toolContext,
      req, sendEvent, runId, conversationId,
    });
    return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
  }

  if (modelAlias === "lucent") {
    const { messages: resolved, usedTool } = await runDeepSeekNativeWithTools({
      apiModel: getModel("lucent").apiModel,
      modelAlias,
      baseUrl: getDeepSeekBaseUrl(),
      apiKey,
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", hasProjectContext) }, ...withPrompt.slice(1)],
      context: toolContext,
      req, sendEvent, runId, conversationId,
    });
    return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
  }

  if (modelAlias === "arete") {
    // DashScope native belum diverifikasi live (lihat catatan di streamDashScopeNative) --
    // pakai jalur OpenAI-compatible yang sama, base URL DashScope.
    const { messages: resolved, usedTool } = await runDeepSeekNativeWithTools({
      apiModel: getModel("arete").apiModel,
      modelAlias,
      baseUrl: getDashScopeBaseUrl(),
      apiKey,
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", hasProjectContext) }, ...withPrompt.slice(1)],
      context: toolContext,
      req, sendEvent, runId, conversationId,
    });
    return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
  }

  // noir — Anthropic native
  const { system, messages: anthropicMessages } = splitSystemAndMessages(messages);
  const { messages: resolved, usedTool } = await runAnthropicWithTools({
    apiModel: getModel("noir").apiModel,
    modelAlias,
    apiKey,
    system: withToolSystemPrompt(system ?? SYSTEM_PROMPT, hasProjectContext),
    messages: anthropicMessages,
    context: toolContext,
    req, sendEvent, runId, conversationId,
  });
  if (!usedTool) return messages;
  // runAnthropicWithTools sudah meratakan hasilnya jadi {role, content: string}[]
  // biasa sebelum return (lihat catatan di tools.ts) -- tidak perlu flatten lagi di
  // sini. Kembalikan dengan system prompt asli dipertahankan terpisah karena
  // streamAnthropicNative men-split ulang system dari messages.
  return [{ role: "system", content: SYSTEM_PROMPT }, ...resolved];
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CommandRoomChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request tidak valid.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { runId, conversationId, projectId, snapshotId, rabLines, messages, modelAlias, reasoningEffort, thinking } = parsed.data;
  const incomingCorrelation = req.headers.get("x-correlation-id");
  const correlationId = incomingCorrelation && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(incomingCorrelation)
    ? incomingCorrelation : crypto.randomUUID();
  const validation = validateChatPayload({ messages });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 413 });
  }
  const resolved = resolveKeyForModel(modelAlias);
  if (!resolved) {
    const providerLabel = getModel(modelAlias).provider;
    return NextResponse.json(
      { error: `API key untuk ${providerLabel} (${getModel(modelAlias).displayName}) belum dikonfigurasi.` },
      { status: 503 },
    );
  }

  const resolvedThinking = resolveThinking(modelAlias, thinking);
  const effort = reasoningEffort as ReasoningEffort;
  const serverContext = await buildServerChatContext({
    projectId,
    conversationId,
    messages,
    loaders: createDbContextLoaders({ authorization: req.headers.get("authorization") }),
  });
  const serverMessages = serverContext.messages as ChatMessage[];

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let sequenceCounter = 0;
      let finalContent = "";
      let emittingComposedAnswer = false;
      const toolsCalledThisTurn: string[] = [];
      // Status-summary (Mistral) dipanggil fire-and-forget di dalam
      // consumeOpenAiCompatibleStream -- TANPA pelacak ini, controller.close()
      // di finally (di bawah) langsung dieksekusi begitu stream utama selesai,
      // memutus SSE sebelum promise Mistral yang masih in-flight sempat resolve
      // dan mengirim event-nya (root cause "Mistral kepanggil di log OpenRouter
      // tapi label tidak pernah sampai ke UI", dilaporkan user 2026-07-18).
      // Setiap panggilan mendaftarkan promise-nya ke sini; di-await sebelum close.
      const pendingStatusSummaries: Promise<unknown>[] = [];
      const sendEvent: SendEvent = (_type, data) => {
        // Only opaque identifiers flow to clients/observability; never messages, prompts, or credentials.
        data.correlationId = correlationId;
        if (projectId) data.projectId = projectId;
        if (snapshotId) data.snapshotId = snapshotId;
        // Fase 2 Evidence Gate (PLAN.md §9 Fase 2): akumulasi konten jawaban akhir
        // + nama tool yang dipanggil, murni dengan mengamati event yang sudah lewat
        // di sini -- tidak mengubah signature/perilaku fungsi stream*()/resolveTools*
        // yang sudah teruji sama sekali.
        if (!emittingComposedAnswer && data.type === "content" && typeof data.delta === "string") {
          finalContent += data.delta;
          return;
        }
        if (data.type === "tool_call" && typeof data.tool === "string") toolsCalledThisTurn.push(data.tool);
        data.sequence = sequenceCounter++;
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Fase 3 Capability Router/Intent Architect primitif (PLAN.md §9 Fase 3):
        // klasifikasi plan_depth heuristik dari pesan user terakhir, tampilkan
        // "Pendekatan" singkat untuk structured/controlled saja (blueprint §5 --
        // plan tidak ditampilkan untuk pertanyaan direct/compact yang sederhana).
        const lastUserMessage = [...serverMessages].reverse().find((m) => m.role === "user");
        if (lastUserMessage) {
          const intentFrame = buildIntentFrame(lastUserMessage.content);
          const statusMessage = planDepthStatusMessage(intentFrame);
          if (statusMessage) {
            sendEvent("message", { type: "status", phase: "planning", statusLabel: statusMessage });
          }
          // Fase 6 Plan Executor (PLAN.md §9 Fase 6): ExecutionPlan DESKRIPTIF,
          // dikirim sebagai event observability -- tidak membatasi tool_choice
          // model (tetap "auto"). Hanya untuk structured/controlled.
          const executionPlan = buildExecutionPlan(intentFrame);
          if (executionPlan) {
            sendEvent("message", { type: "execution_plan", plan: executionPlan });
          }
        }

        // Fase 0 tool-calling (PLAN.md §Fase 0): resolve tool call dulu (non-stream,
        // maks MAX_TOOL_TURNS giliran) sebelum stream jawaban final. Kalau flag off
        // ATAU tool-loop error apa pun, jatuh diam-diam ke messages asli tanpa tools --
        // Command Room tidak boleh pernah error total gara-gara jalur tools ini.
        let effectiveMessages: ChatMessage[] = serverMessages;
        let toolsWereUsed = false;
        if (isToolsEnabled()) {
          try {
            effectiveMessages = await resolveToolsForModel(modelAlias, serverMessages, resolved.apiKey, resolved.viaOpenRouter, req, sendEvent, runId, conversationId, projectId, rabLines);
            toolsWereUsed = effectiveMessages !== serverMessages;
          } catch (toolErr) {
            sendEvent("message", {
              type: "status", phase: "streaming_response",
              statusLabel: "Tool-calling tidak tersedia untuk pertanyaan ini, melanjutkan tanpa tools.",
            });
            effectiveMessages = serverMessages;
          }
        }

        // Kalau tool sudah dipakai, tambahkan instruksi tegas menulis laporan
        // lengkap. Ditemukan lewat live-test (sesi sebelumnya): model reasoning
        // (thinking=on) yang baru selesai tool-loop cenderung menaruh SEMUA
        // angka hasil tool di reasoning trace lalu menulis content akhir yang
        // pendek/generik ("hasil di atas jelas..."). Awalnya diperbaiki dengan
        // mematikan thinking di giliran final untuk Lucent/Arete -- tapi itu
        // berbenturan dengan fitur status-label berbasis fase reasoning: hampir
        // semua pertanyaan Command Room nyata memicu tool call, jadi thinking
        // mati persis di titik paling relevan untuk ditampilkan sebagai label.
        // Diputuskan (owner, 2026-07-13): thinking TETAP ON pasca-tool untuk
        // SEMUA model, termasuk Lucent/Arete/Noir -- instruksi "laporan lengkap"
        // di bawah ini yang jadi pencegah jawaban pendek, bukan mematikan
        // thinking. Noir menampilkan reasoning ini mentah (RunStatus.tsx),
        // Lucent/Arete meringkasnya jadi label fase (getReasoningContextStatus).
        let finalMessages = effectiveMessages;
        if (toolsWereUsed) {
          finalMessages = [
            ...effectiveMessages,
            {
              role: "user",
              content: "Tuliskan sekarang laporan jawaban akhir yang LENGKAP dan BERDIRI SENDIRI untuk pertanyaan saya di atas, memuat semua angka konkret (kode AHSP, durasi, biaya, dst) dari hasil tool yang sudah didapat -- dalam tabel/daftar bila membandingkan beberapa opsi. Jangan merujuk ke 'hasil di atas' atau 'sudah dihitung sebelumnya', tulis ulang angkanya langsung.",
            },
          ];
        }
        const finalThinking = resolvedThinking;

        if (resolved.viaOpenRouter) {
          await streamOpenRouter(modelAlias, finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, pendingStatusSummaries, runId, conversationId);
        } else if (modelAlias === "lucent") {
          await streamDeepSeekNative(finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, pendingStatusSummaries, runId, conversationId, modelAlias);
        } else if (modelAlias === "arete") {
          await streamDashScopeNative(finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, pendingStatusSummaries, runId, conversationId, modelAlias);
        } else {
          await streamAnthropicNative(finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, runId, conversationId);
        }

        // Status summary bersifat observability: scheduler berjalan fire-and-forget
        // dan tidak pernah menahan answer composer atau completion chat.

        // Fase 10: candidate claims diverifikasi deterministik SEBELUM answer composer
        // mengirim konten ke klien. Provider tidak pernah diberi wewenang menampilkan
        // kuantitas tanpa provenance/authority yang cukup.
        const claimResult = verifyAndComposeClaims({
          responseText: finalContent,
          toolsCalled: toolsCalledThisTurn,
          authority: serverContext.claimAuthority,
        });
        if (claimResult.responseText) {
          emittingComposedAnswer = true;
          sendEvent("message", { type: "content", runId, conversationId, delta: claimResult.responseText, timestamp: new Date().toISOString() });
          emittingComposedAnswer = false;
        }
        void persistConversationSummary({
          dbApiUrl: process.env.DB_API_URL?.trim(), authorization: req.headers.get("authorization"),
          conversationId, content: claimResult.responseText,
        });
        sendEvent("message", {
          type: "claim_verification", runId, conversationId,
          claims: claimResult.claims, rejectedCount: claimResult.rejected.length,
          conflicts: claimResult.conflicts, requiresCoreEngine: claimResult.requiresCoreEngine,
          timestamp: new Date().toISOString(),
        });

        // Evidence Gate remains an observability summary over the composed answer.
        try {
          const report = evaluateEvidenceGate({ responseText: claimResult.responseText, toolsCalled: toolsCalledThisTurn });
          if (report.status !== "not_available") {
            sendEvent("message", {
              type: "evidence_gate", runId, conversationId,
              status: report.status,
              claimCount: report.claims.length,
              manualReviewRequired: report.manual_review_required,
              uncertainties: report.uncertainties,
              timestamp: new Date().toISOString(),
            });
          }
        } catch { /* evidence gate tidak boleh pernah menggagalkan response */ }

        sendEvent("message", { type: "done", runId, conversationId, timestamp: new Date().toISOString() });
      } catch (err) {
        const aborted = (err instanceof Error && err.name === "AbortError") || req.signal.aborted;
        if (!aborted) {
          sendEvent("message", {
            type: "error", runId, conversationId,
            errorMessage: err instanceof Error ? err.message : "Stream error",
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Correlation-Id": correlationId,
    },
  });
}

export async function GET() {
  return NextResponse.json({
    models: Object.values(PAAX_MODELS).map((m) => ({
      id: m.id,
      displayName: m.displayName,
      provider: m.provider,
      apiModel: m.apiModel,
      supportsThinking: m.supportsThinking,
      ready: Boolean(resolveKeyForModel(m.id)),
    })),
  });
}
