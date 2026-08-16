/**
 * POST /api/command-room/chat
 *
 * Server-side API route untuk Command Room (Streaming).
 * 3 model: Lucent (DeepSeek V4 Flash), Arete (DeepSeek V4 Pro), Noir
 * (DeepSeek V4 Pro, panel reasoning eksplisit). Semua memakai 1 API key
 * opencode-go yang dibaca dari DEEPSEEK_API_KEY / DRAWING_INTELLIGENCE_API_KEY.
 * API key TIDAK PERNAH dikirim ke client.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import { shouldStreamRawReasoningToClient } from "./reasoning-visibility";
import { persistConversationSummary } from "./memory-runtime";
import {
  selectCommandRoomTools,
  type CommandRoomConnector,
} from "./connector-permissions";
import { buildWorkMessages, parseWorkRequest, type WorkRequest } from "../work/contract";
import { WorkEventEmitter } from "../work/events";
import { createWorkToolRegistry, getWorkToolNames } from "../work/tools";
import { createWorkApproval, resolveWorkApproval } from "../work/approval";
import type { WorkEvent } from "@/lib/command-room/work-agent-types";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 menit

// ─── Schema validasi request ─────────────────────────────────────────────────

const CommandRoomChatSchema = z.object({
  mode: z.enum(["chat", "work"]).default("chat"),
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
  connectors: z.array(z.enum(["gambarKerja", "rab", "jadwal"])).max(3).default([]),
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

// ─── Helper: baca env ──────────

function getSharedKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY?.trim() || process.env.DRAWING_INTELLIGENCE_API_KEY?.trim() || undefined;
}

function getDeepSeekBaseUrl(): string {
  return (
    process.env.DEEPSEEK_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.deepseek.com"
  );
}

function isOpenRouterKey(apiKey: string): boolean {
  return apiKey.trim().startsWith("sk-or-v1-");
}

function getLucentModelSlug(): string {
  const custom = process.env.DRAWING_INTELLIGENCE_DEEPSEEK_MODEL?.trim();
  if (custom) {
    return custom.includes("/") ? custom : `deepseek/${custom}`;
  }
  return "deepseek/deepseek-v4-flash";
}

/** Slug model per provider di OpenRouter — dipakai kalau routing lewat 1 shared key. */
const OPENROUTER_MODEL_SLUG: Record<ModelAlias, string> = {
  lucent: getLucentModelSlug(),
  arete: "deepseek/deepseek-v4-pro",
  noir: "deepseek/deepseek-v4-pro",
};

/**
 * Mapping effort app (high/max) -> string reasoning.effort yang dikirim ke
 * OpenRouter, PER MODEL — bukan satu mapping generik. Dibuktikan lewat probe
 * langsung (2026-07-12): Noir via OpenRouter praktis tidak
 * menghasilkan reasoning yang terlihat di effort "high" untuk pertanyaan
 * sederhana (0 char), baru muncul jelas di "xhigh" (282 char) dan "max" (746
 * char) — jadi utk Noir, app "high" HARUS dipetakan ke provider "xhigh" biar
 * thinking benar-benar terasa aktif, bukan ke provider "high" yang literal.
 * DeepSeek (Lucent/Arete) sudah terbukti reasoning-nya jelas di
 * kedua effort dengan mapping high/xhigh biasa.
 */
const OPENROUTER_EFFORT_MAP: Record<ModelAlias, { high: string; max: string }> = {
  lucent: { high: "high", max: "xhigh" },
  arete: { high: "high", max: "xhigh" },
  noir: { high: "xhigh", max: "max" },
};

type KeyResolution = { apiKey: string; viaOpenRouter: boolean };

/**
 * Resolusi key per model: semua model kini memakai 1 shared key
 * (DEEPSEEK_API_KEY / DRAWING_INTELLIGENCE_API_KEY via opencode-go).
 * Native key DashScope/Anthropic TIDAK dipakai lagi — tidak ada model Qwen/
 * Claude di Command Room.
 */
function resolveKeyForModel(modelAlias: ModelAlias): KeyResolution | null {
  const shared = getSharedKey();
  const sharedIsOr = shared ? isOpenRouterKey(shared) : false;

  if (modelAlias === "lucent") {
    if (!shared) return null;
    return { apiKey: shared, viaOpenRouter: sharedIsOr };
  }
  if (modelAlias === "arete") {
    if (shared) return { apiKey: shared, viaOpenRouter: sharedIsOr };
    return null;
  }
  // noir
  if (shared) return { apiKey: shared, viaOpenRouter: sharedIsOr };
  return null;
}

// ─── Shared OpenAI-compatible SSE consumer (dipakai oleh semua path fetch) ────

async function consumeOpenAiCompatibleStream(
  res: Response,
  sendEvent: SendEvent,
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
  let reasoningActivityStarted = false;
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
          if (!reasoningActivityStarted) {
            reasoningActivityStarted = true;
            sendEvent("message", {
              type: "activity", runId, conversationId,
              activity: {
                action: "start",
                step: {
                  id: "model:reasoning", kind: "reason",
                  label: "Menganalisis konteks, evidence, dan kemungkinan jawaban",
                  detail: "Menilai hubungan fakta, ketidakpastian, dan batas authority jawaban.",
                },
              },
              timestamp: new Date().toISOString(),
            });
          }
          // Only Noir has an explicit product mode for provider-supplied
          // reasoning. Arete/Lucent never send raw reasoning text to the
          // browser; their UI is built from safe observable activities.
          if (shouldStreamRawReasoningToClient(modelAlias)) {
            sendEvent("message", { type: "reasoning", runId, conversationId, delta: reasoning, timestamp: new Date().toISOString() });
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
    const { finishedOnLength, fullContent } = await consumeOpenAiCompatibleStream(res, sendEvent, runId, conversationId, modelAlias, req);
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
      sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: `Melanjutkan jawaban bagian ${continuationCount + 1}` });
    }
  }
}

// ─── Lucent — DeepSeek native ──────────────────────────────────────────────

function buildDeepSeekPayload(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  modelAlias: ModelAlias,
): Record<string, any> {
  const payload: Record<string, any> = {
    model: getModel(modelAlias).apiModel,
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
  runId: string | undefined,
  conversationId: string | undefined,
  modelAlias: ModelAlias = "lucent",
): Promise<void> {
  const payload = buildDeepSeekPayload(messages, thinking, effort, modelAlias);
  const res = await fetchOrThrow(`${getDeepSeekBaseUrl()}/chat/completions`, apiKey, payload, req);
  await consumeOpenAiCompatibleStream(res, sendEvent, runId, conversationId, modelAlias, req);
}

// ─── Fase 0 tool-calling bridge ────────────────────────────────────────────
// Jembatan antara 2 jalur provider Command Room (OpenRouter/DeepSeek-native)
// dan tool-loop provider-agnostic di tools.ts.
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
  connectors: readonly CommandRoomConnector[],
  toolNames: readonly string[],
): Promise<ChatMessage[]> {
  const withPrompt = withSystemPrompt(messages) as ToolChatMessage[];
  // Fase 10 (PLAN.md §9): projectId/rabLines opsional dari request body ->
  // ChatContext untuk tool query_rab/query_schedule/export_rab_xlsx/
  // project_diagnostics. undefined kalau client tidak mengirim (perilaku lama
  // tetap sama). rabLines dikirim langsung TIDAK butuh services/db.
  const toolContext = (projectId || (connectors.includes("rab") && rabLines))
    ? {
        project_id: projectId,
        conversation_id: conversationId,
        rab_lines: connectors.includes("rab") ? rabLines?.map((line) => ({ ...line, duration_days: line.duration_days ?? null })) : undefined,
      }
    : undefined;
  if (viaOpenRouter) {
    const { messages: resolved, usedTool } = await runOpenRouterWithTools({
      modelSlug: OPENROUTER_MODEL_SLUG[modelAlias],
      modelAlias,
      apiKey,
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", toolNames) }, ...withPrompt.slice(1)],
      context: toolContext,
      connectors,
      toolNames,
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
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", toolNames) }, ...withPrompt.slice(1)],
      context: toolContext,
      connectors,
      toolNames,
      req, sendEvent, runId, conversationId,
    });
    return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
  }

  if (modelAlias === "arete") {
    // Semua model kini deepseek via 1 shared key opencode-go.
    const { messages: resolved, usedTool } = await runDeepSeekNativeWithTools({
      apiModel: getModel("arete").apiModel,
      modelAlias,
      baseUrl: getDeepSeekBaseUrl(),
      apiKey,
      messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", toolNames) }, ...withPrompt.slice(1)],
      context: toolContext,
      connectors,
      toolNames,
      req, sendEvent, runId, conversationId,
    });
    return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
  }

  // noir — deepseek native (panel reasoning eksplisit tetap dipertahankan)
  const { messages: resolved, usedTool } = await runDeepSeekNativeWithTools({
    apiModel: getModel("noir").apiModel,
    modelAlias,
    baseUrl: getDeepSeekBaseUrl(),
    apiKey,
    messages: [{ ...withPrompt[0], content: withToolSystemPrompt(withPrompt[0].content ?? "", toolNames) }, ...withPrompt.slice(1)],
    context: toolContext,
    connectors,
    toolNames,
    req, sendEvent, runId, conversationId,
  });
  return usedTool ? flattenToolHistoryToChatMessages(resolved) : messages;
}

async function handleWorkPost(req: NextRequest, requestBody?: unknown): Promise<Response> {
  const body = requestBody ?? await req.json().catch(() => null);
  const parsed = parseWorkRequest(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Work request tidak valid.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const workRequest: WorkRequest = parsed.data;
  const runId = workRequest.runId?.trim() || `work-run-${crypto.randomUUID()}`;
  const conversationId = workRequest.conversationId?.trim() || `work-${crypto.randomUUID()}`;
  const incomingCorrelation = req.headers.get("x-correlation-id");
  const correlationId = incomingCorrelation && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(incomingCorrelation)
    ? incomingCorrelation
    : crypto.randomUUID();
  const validation = validateChatPayload({ messages: workRequest.messages });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 413 });

  const resolved = resolveKeyForModel(workRequest.modelAlias);
  if (!resolved) {
    return NextResponse.json({ error: "Work runtime belum siap. Konfigurasi runtime server belum lengkap." }, { status: 503 });
  }

  const workMessages = buildWorkMessages(workRequest.messages) as ChatMessage[];
  const resolvedThinking = resolveThinking(workRequest.modelAlias, workRequest.thinking);
  const effort = workRequest.reasoningEffort as ReasoningEffort;
  const lastUserMessage = [...workRequest.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let finalContent = "";
      let emitter: WorkEventEmitter;
      const enqueue = (event: WorkEvent) => {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
      };

      emitter = new WorkEventEmitter(runId, conversationId, enqueue);
      const sendProviderEvent: SendEvent = (_type, data) => {
        if (data.type === "content" && typeof data.delta === "string") finalContent += data.delta;
        if (data.type === "tool_result" && data.result && typeof data.result === "object" && !Array.isArray(data.result) && (data.result as Record<string, unknown>).approval_required === true) {
          emitter.fromChatEvent({ ...data, _workApprovalHandled: true });
        } else {
          emitter.fromChatEvent(data);
        }
      };
      const requestApproval = async (input: { action: string; reason: string; args: Record<string, unknown> }) => {
        const gate = createWorkApproval({
          approvalId: `approval-${crypto.randomUUID()}`,
          sessionId: conversationId,
          runId,
          action: input.action,
          reason: input.reason,
          args: input.args,
        });
        emitter.emit("approval.requested", { approval: gate.request });
        const approved = await gate.promise;
        emitter.emit("approval.resolved", { approval: { ...gate.request, state: approved ? "approved" : "denied" } });
        return approved;
      };
      const workTools = createWorkToolRegistry({
        workspaceRoot: process.env.PAAX_WORKSPACE_ROOT?.trim() || process.cwd(),
        requestApproval,
      });

      try {
        emitter.emit("turn.started", { phase: "starting", message: lastUserMessage });
        emitter.emit("assistant.interim", { message: "Saya menyiapkan konteks kerja dan batas tindakan." });
        emitter.emit("plan.updated", {
          tasks: [{ id: "work-request", title: "Menyelesaikan permintaan", state: "in_progress" }],
        });
        emitter.emit("status.update", { phase: "calling_model", statusLabel: "Agent menyusun langkah kerja" });

        let finalMessages = workMessages as ToolChatMessage[];
        let toolsWereUsed = false;
        try {
          const toolNames = getWorkToolNames();
          const toolResult = resolved.viaOpenRouter
            ? await runOpenRouterWithTools({
                modelSlug: OPENROUTER_MODEL_SLUG[workRequest.modelAlias],
                modelAlias: workRequest.modelAlias,
                apiKey: resolved.apiKey,
                messages: finalMessages,
                context: undefined,
                connectors: [],
                toolNames,
                toolRegistry: workTools,
                req,
                sendEvent: sendProviderEvent,
                runId,
                conversationId,
              })
            : await runDeepSeekNativeWithTools({
                apiModel: getModel(workRequest.modelAlias).apiModel,
                modelAlias: workRequest.modelAlias,
                baseUrl: getDeepSeekBaseUrl(),
                apiKey: resolved.apiKey,
                messages: finalMessages,
                context: undefined,
                connectors: [],
                toolNames,
                toolRegistry: workTools,
                req,
                sendEvent: sendProviderEvent,
                runId,
                conversationId,
              });
          toolsWereUsed = toolResult.usedTool;
          if (toolsWereUsed) finalMessages = toolResult.messages;
        } catch (error) {
          emitter.emit("status.update", {
            phase: "tool_unavailable",
            statusLabel: "Tool workspace tidak tersedia; agent melanjutkan dengan konteks percakapan.",
            statusDetail: error instanceof Error ? error.message : "tool loop gagal",
          });
          finalMessages = workMessages as ToolChatMessage[];
        }

        if (toolsWereUsed) {
          emitter.emit("assistant.interim", { message: "Tindakan workspace selesai; saya menyusun jawaban dari hasil yang teramati." });
        }
        emitter.emit("status.update", { phase: "streaming_response", statusLabel: "Agent menulis hasil akhir" });
        if (resolved.viaOpenRouter) {
          await streamOpenRouter(workRequest.modelAlias, flattenToolHistoryToChatMessages(finalMessages), resolvedThinking, effort, resolved.apiKey, req, sendProviderEvent, runId, conversationId);
        } else {
          await streamDeepSeekNative(flattenToolHistoryToChatMessages(finalMessages), resolvedThinking, effort, resolved.apiKey, req, sendProviderEvent, runId, conversationId, workRequest.modelAlias);
        }

        emitter.emit("plan.updated", {
          tasks: [{ id: "work-request", title: "Menyelesaikan permintaan", state: "completed", completedAt: new Date().toISOString() }],
        });
        emitter.emit("log.line", { log: { level: "info", text: "turn completed" } });
        emitter.emit("turn.completed", { finalMarkdown: finalContent });
      } catch (error) {
        emitter.emit("error", { errorMessage: error instanceof Error ? error.message : "Work stream error" });
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

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && (body as Record<string, unknown>).mode === "work") {
    return handleWorkPost(req, body);
  }
  const parsed = CommandRoomChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request tidak valid.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { runId, conversationId, projectId: requestedProjectId, snapshotId, rabLines, messages, modelAlias, reasoningEffort, thinking, connectors } = parsed.data;
  // Project binding is an immutable conversation scope; connector toggles only control optional domain tools.
  const projectId = requestedProjectId;
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
  const currentUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const toolNames = selectCommandRoomTools(connectors, currentUserMessage);
  const serverContext = await buildServerChatContext({
    projectId,
    allowProjectGraphRetrieval: Boolean(projectId),
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
      // Real structured tool outputs, captured for per-claim provenance
      // (claim-provenance.ts) -- never forwarded to the client as part of
      // the SSE payload; sendEvent below strips `result` before enqueueing.
      const toolResultsThisTurn: import("./claim-provenance").ToolResultRecord[] = [];
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
        if (data.type === "tool_result" && typeof data.tool === "string" && "result" in data) {
          toolResultsThisTurn.push({
            result_id: `${data.tool}:${toolResultsThisTurn.length}`,
            tool: data.tool,
            result: data.result,
          });
          // `result` is captured above for claim provenance and must never
          // reach the client -- only `summary` (already client-facing) does.
          delete data.result;
        }
        data.sequence = sequenceCounter++;
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "complete",
            step: { id: "request:inspect", kind: "inspect", label: "Memeriksa permintaan, konteks, dan batasan" },
          },
          timestamp: new Date().toISOString(),
        });
        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "complete",
            step: {
              id: "context:load", kind: "context",
              label: projectId ? "Memuat konteks proyek dan sumber data aktif" : "Menyiapkan konteks percakapan",
              detail: projectId ? "Project context tersedia untuk retrieval terarah" : "Tidak ada proyek yang dihubungkan",
            },
          },
          timestamp: new Date().toISOString(),
        });

        // Fase 3 Capability Router/Intent Architect primitif (PLAN.md §9 Fase 3):
        // klasifikasi plan_depth heuristik dari pesan user terakhir, tampilkan
        // "Pendekatan" singkat untuk structured/controlled saja (blueprint §5 --
        // plan tidak ditampilkan untuk pertanyaan direct/compact yang sederhana).
        const lastUserMessage = [...serverMessages].reverse().find((m) => m.role === "user");
        if (lastUserMessage) {
          const intentFrame = buildIntentFrame(lastUserMessage.content);
          const statusMessage = planDepthStatusMessage(intentFrame);
          if (statusMessage) {
            sendEvent("message", {
              type: "activity", runId, conversationId,
              activity: {
                action: "complete",
                step: { id: "plan:approach", kind: "inspect", label: statusMessage },
              },
              timestamp: new Date().toISOString(),
            });
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
        if (isToolsEnabled() && toolNames.length > 0) {
          try {
            effectiveMessages = await resolveToolsForModel(modelAlias, serverMessages, resolved.apiKey, resolved.viaOpenRouter, req, sendEvent, runId, conversationId, projectId, rabLines, connectors, toolNames);
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
        // mati persis di titik paling relevan. Thinking tetap ON pasca-tool untuk
        // semua model. Arete/Lucent hanya menampilkan activity timeline aman yang
        // berasal dari milestone server/tool; reasoning mentah tidak dipublikasikan.
        // Noir mempertahankan panel reasoning eksplisit sesuai mode produknya.
        let finalMessages = effectiveMessages;
        if (toolsWereUsed) {
          finalMessages = [
            ...effectiveMessages,
            {
              role: "user",
              content: "Tuliskan sekarang jawaban akhir yang LENGKAP dan BERDIRI SENDIRI berdasarkan hasil tool. Untuk Drawing Intelligence, prioritaskan human_drawing_view, gunakan istilah 'label/simbol teramati' persis seperti sumber, JANGAN mengubahnya menjadi jumlah fisik, dan sertakan citation lembar/halaman pada setiap fakta. Untuk tool deterministik lain, tulis ulang angka konkret beserta authority-nya. Jangan merujuk ke 'hasil di atas'.",
            },
          ];
        }
        const finalThinking = resolvedThinking;

        if (resolved.viaOpenRouter) {
          await streamOpenRouter(modelAlias, finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, runId, conversationId);
        } else {
          await streamDeepSeekNative(finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, runId, conversationId, modelAlias);
        }

        // Activity timeline berasal dari milestone aktual di route/tool pipeline.
        // Tidak ada secondary model atau summarizer reasoning murah.

        // Fase 10: candidate claims diverifikasi deterministik SEBELUM answer composer
        // mengirim konten ke klien. Provider tidak pernah diberi wewenang menampilkan
        // kuantitas tanpa provenance/authority yang cukup.
        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "start",
            step: { id: "answer:verify", kind: "verify", label: "Memeriksa angka, authority, dan sumber evidence" },
          },
          timestamp: new Date().toISOString(),
        });
        const claimResult = verifyAndComposeClaims({
          responseText: finalContent,
          toolsCalled: toolsCalledThisTurn,
          authority: serverContext.claimAuthority,
          toolResults: toolResultsThisTurn,
        });
        if (claimResult.responseText) {
          emittingComposedAnswer = true;
          sendEvent("message", { type: "content", runId, conversationId, delta: claimResult.responseText, timestamp: new Date().toISOString() });
          emittingComposedAnswer = false;
        }
        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "complete",
            step: { id: "answer:verify", kind: "verify", label: "Memeriksa angka, authority, dan sumber evidence" },
          },
          timestamp: new Date().toISOString(),
        });
        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "start",
            step: { id: "memory:save", kind: "save", label: "Menyimpan ringkasan percakapan" },
          },
          timestamp: new Date().toISOString(),
        });
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

        sendEvent("message", {
          type: "activity", runId, conversationId,
          activity: {
            action: "complete",
            step: { id: "memory:save", kind: "save", label: "Menyimpan ringkasan percakapan" },
          },
          timestamp: new Date().toISOString(),
        });
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
