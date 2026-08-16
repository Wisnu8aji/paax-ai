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
  runOpenRouterWithTools,
  runDeepSeekNativeWithTools,
  type ToolChatMessage,
} from "./tools";
import { ChatEventStream } from "./chat-event-stream";
import { clearTurnControl, isTurnStopped, takeSteerMessages } from "./runtime-control";
import { createGeneralChatToolRegistry, GENERAL_CHAT_TOOL_NAMES } from "./general-tools";
import { analyzeChatAttachments, attachmentProcessingContext } from "./vision-router";
import { evaluateEvidenceGate } from "@paax/ai-orchestrator/router";
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
  turnId: z.string().optional(),
  conversationId: z.string().optional(),
  // Project binding is retained for conversation scope and memory only. Chat
  // never activates the operational Drawing/RAB/Schedule tool registry.
  projectId: z.string().optional(),
  connectors: z.array(z.enum(["gambarKerja", "rab", "jadwal"])).max(3).default([]),
  snapshotId: z.string().optional(),
  // Legacy fields remain accepted for old clients but are intentionally ignored
  // by the Chat path; Work owns operational RAB/Schedule capabilities.
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
  attachments: z.array(z.object({
    attachment_id: z.string().min(1).max(160),
    name: z.string().max(240),
    media_type: z.string().max(160),
    size_bytes: z.number().int().nonnegative(),
    status: z.enum(["staged", "processing", "ready", "failed"]),
  })).max(4).default([]),
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

const SYSTEM_PROMPT =
  "Anda adalah PAAX, asisten AI untuk insinyur sipil Indonesia. Anda WAJIB dan SELALU menjawab menggunakan Bahasa Indonesia yang natural dan profesional. Jangan pernah menjawab menggunakan bahasa Mandarin (Chinese). Jika pengguna menyapa dengan 'halo', balaslah dengan Bahasa Indonesia yang ramah.";

function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const hasSystem = messages.some((m) => m.role === "system");
  return hasSystem ? messages : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
}

type SendEvent = (type: string, data: Record<string, unknown>) => void;

class TurnInterruptedError extends Error {
  constructor() {
    super("Turn interrupted by user");
    this.name = "TurnInterruptedError";
  }
}

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
): Promise<{ finishedOnLength: boolean; fullContent: string; steerMessages: string[] }> {
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullContent = "";
  let finishedOnLength = false;
  let reasoningActivityStarted = false;
  const steerMessages: string[] = [];
  while (true) {
    if (runId && isTurnStopped(runId)) {
      await reader.cancel().catch(() => undefined);
      throw new TurnInterruptedError();
    }
    if (runId) {
      steerMessages.push(...takeSteerMessages(runId));
    }
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
        if (runId) {
          steerMessages.push(...takeSteerMessages(runId));
        }
      } catch { /* partial chunk, abaikan */ }
    }
  }
  if (runId && isTurnStopped(runId)) throw new TurnInterruptedError();
  if (runId) steerMessages.push(...takeSteerMessages(runId));
  return { finishedOnLength, fullContent, steerMessages };
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
  const MAX_STEERS = 3;
  let currentMessages = [...basePayload.messages];
  let continueGeneration = true;
  let continuationCount = 0;
  let steerCount = 0;

  while (continueGeneration) {
    continueGeneration = false;
    const currentPayload: Record<string, any> = { ...basePayload, messages: currentMessages };

    if (continuationCount > 0 || steerCount > 0) {
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
    const { finishedOnLength, fullContent, steerMessages } = await consumeOpenAiCompatibleStream(res, sendEvent, runId, conversationId, modelAlias, req);

    if (steerMessages.length > 0) {
      if (steerCount >= MAX_STEERS) {
        sendEvent("message", { type: "status", phase: "steer", statusLabel: "Batas steer turn ini tercapai; jawaban dilanjutkan tanpa instruksi tambahan." });
      } else {
        steerCount++;
        if (fullContent.trim().length > 0) currentMessages.push({ role: "assistant", content: fullContent });
        currentMessages.push(...steerMessages.map((message) => ({
          role: "user" as const,
          content: `[STEER TERARAH PENGGUNA]\n${message}`,
        })));
        sendEvent("message", { type: "status", phase: "steer", statusLabel: `Steer diterima; model menyesuaikan jawaban (${steerCount}/${MAX_STEERS}).` });
        continueGeneration = true;
        continue;
      }
    }

    if (finishedOnLength) {
      continuationCount++;
      if (continuationCount >= MAX_CONTINUATIONS) {
        sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: "Batas auto-lanjut tercapai, menghentikan generasi." });
        break;
      }
      if (fullContent.trim().length > 0) {
        currentMessages.push({ role: "assistant", content: fullContent });
      }
      sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: `Melanjutkan jawaban bagian ${continuationCount + 1}` });
      continueGeneration = true;
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
  let currentMessages = [...messages];
  for (let steerCount = 0; steerCount <= 3; steerCount++) {
    const payload = buildDeepSeekPayload(currentMessages, thinking, effort, modelAlias);
    const res = await fetchOrThrow(`${getDeepSeekBaseUrl()}/chat/completions`, apiKey, payload, req);
    const result = await consumeOpenAiCompatibleStream(res, sendEvent, runId, conversationId, modelAlias, req);
    if (!result.steerMessages.length || steerCount >= 3) {
      if (result.steerMessages.length && steerCount >= 3) {
        sendEvent("message", { type: "status", phase: "steer", statusLabel: "Batas steer turn ini tercapai; jawaban dilanjutkan tanpa instruksi tambahan." });
      }
      return;
    }
    if (result.fullContent.trim().length > 0) currentMessages.push({ role: "assistant", content: result.fullContent });
    currentMessages.push(...result.steerMessages.map((message) => ({
      role: "user" as const,
      content: `[STEER TERARAH PENGGUNA]\n${message}`,
    })));
    sendEvent("message", { type: "status", phase: "steer", statusLabel: `Steer diterima; model menyesuaikan jawaban (${steerCount + 1}/3).` });
  }
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

  const { runId, turnId: requestedTurnId, conversationId: requestedConversationId, projectId: requestedProjectId, snapshotId, attachments, messages, modelAlias, reasoningEffort, thinking } = parsed.data;
  // Project binding is an immutable conversation scope; connector toggles only control optional domain tools.
  const projectId = requestedProjectId;
  const conversationId = requestedConversationId?.trim() || `conversation-${crypto.randomUUID()}`;
  const turnId = requestedTurnId?.trim() || runId?.trim() || crypto.randomUUID();
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
  const serverContext = await buildServerChatContext({
    projectId,
    // Project Chat may use project-scoped memory, files, and instructions, but
    // it must never silently become the operational Drawing/RAB/Schedule path.
    allowProjectGraphRetrieval: false,
    conversationId,
    messages,
    loaders: createDbContextLoaders({ authorization: req.headers.get("authorization") }),
  });
  const serverMessages = [
    ...(serverContext.messages as ChatMessage[]),
    ...(attachments.length ? [{
      role: "system" as const,
      content: `[ATTACHMENTS STAGED]\n${attachments.map((attachment) => `- ${attachment.name} (${attachment.media_type}, ${attachment.status}, id ${attachment.attachment_id})`).join("\n")}\nGunakan attachment ID hanya melalui capability attachment/vision yang tersedia; jangan mengarang isi file yang belum terbaca.`,
    }] : []),
  ];

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let finalContent = "";
      let emittingComposedAnswer = false;
      const toolsCalledThisTurn: string[] = [];
      // Real structured tool outputs, captured for per-claim provenance
      // (claim-provenance.ts) -- never forwarded to the client as part of
      // the SSE payload; sendEvent below strips `result` before enqueueing.
      const toolResultsThisTurn: import("./claim-provenance").ToolResultRecord[] = [];
      const chatEvents = new ChatEventStream({
        conversationId,
        turnId,
        runtimeId: correlationId,
        model: {
          alias: modelAlias,
          display_name: getModel(modelAlias).displayName,
          provider: getModel(modelAlias).provider,
          provider_model: getModel(modelAlias).apiModel,
          reasoning_effort: reasoningEffort,
          thinking,
        },
      }, (event) => {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
      });
      const sendEvent: SendEvent = (_type, data) => {
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
          const result = data.result && typeof data.result === "object" && !Array.isArray(data.result)
            ? data.result as Record<string, unknown>
            : null;
          toolResultsThisTurn.push({
            result_id: `${data.tool}:${toolResultsThisTurn.length}`,
            tool: data.tool,
            result: data.result,
          });
          const sources = result?.sources;
          if (Array.isArray(sources)) {
            sources.forEach((source) => {
              if (!source || typeof source !== "object" || Array.isArray(source)) return;
              const candidate = source as Record<string, unknown>;
              if (typeof candidate.source_id !== "string" || typeof candidate.title !== "string" || typeof candidate.provenance !== "string") return;
              chatEvents.emit("source.added", { source: candidate });
            });
          }
          // `result` is captured above for claim provenance and must never
          // reach the client -- only `summary` (already client-facing) does.
          delete data.result;
        }
        chatEvents.fromLegacy({ ...data, projectId, snapshotId });
      };

      try {
        chatEvents.turnStarted(currentUserMessage);
        serverContext.sources.forEach((source) => chatEvents.emit("source.added", { source }));
        chatEvents.emit("assistant.interim", {
          message: projectId ? "Konteks proyek disiapkan untuk percakapan ini." : "Konteks percakapan disiapkan.",
          phase: "context",
        });
        if (attachments.length) {
          chatEvents.emit("assistant.interim", {
            message: `${attachments.length} lampiran sudah di-stage; sistem memeriksa cara baca yang tersedia.`,
            phase: "attachments",
          });
        }

        const attachmentToolIds = new Map(attachments.map((attachment) => [
          attachment.attachment_id,
          `${attachment.media_type.startsWith("image/") ? "vision" : "file"}:${attachment.attachment_id}`,
        ]));
        for (const attachment of attachments) {
          const tool = attachment.media_type.startsWith("image/") ? "vision_analyze" : "file_read";
          chatEvents.emit("tool.started", {
            tool_call_id: attachmentToolIds.get(attachment.attachment_id) ?? `attachment:${attachment.attachment_id}`,
            tool,
            label: attachment.media_type.startsWith("image/") ? `Membaca gambar ${attachment.name}` : `Membaca ${attachment.name}`,
          });
          toolsCalledThisTurn.push(tool);
        }
        const attachmentResult = await analyzeChatAttachments({ attachments, signal: req.signal });
        if (isTurnStopped(turnId)) throw new TurnInterruptedError();
        for (const observation of attachmentResult.observations) {
          const tool = observation.kind === "vision" ? "vision_analyze" : "file_read";
          const toolCallId = attachmentToolIds.get(observation.attachment_id) ?? `${tool}:${observation.attachment_id}`;
          toolResultsThisTurn.push({
            result_id: `${tool}:${toolResultsThisTurn.length}`,
            tool,
            result: observation,
          });
          chatEvents.emit("tool.completed", {
            tool_call_id: toolCallId,
            tool,
            summary: observation.kind === "vision" ? `Observasi gambar ${observation.name} tersedia untuk model.` : `Isi ${observation.name} berhasil dibaca.`,
          });
        }
        for (const failure of attachmentResult.failures) {
          const tool = failure.media_type.startsWith("image/") ? "vision_analyze" : "file_read";
          const toolCallId = attachmentToolIds.get(failure.attachment_id) ?? `${tool}:${failure.attachment_id}`;
          toolResultsThisTurn.push({
            result_id: `${tool}:${toolResultsThisTurn.length}`,
            tool,
            result: failure,
          });
          chatEvents.emit("tool.failed", { tool_call_id: toolCallId, tool, error: failure.error });
        }
        attachmentResult.sources.forEach((source) => chatEvents.emit("source.added", { source }));

        // Chat v1.5 exposes only general capabilities. Work/project
        // operational tools are intentionally absent from this registry.
        const generalTools = createGeneralChatToolRegistry({ conversationId, turnId });
        const processedAttachmentContext = attachmentProcessingContext(attachmentResult);
        const attachmentMessages: ChatMessage[] = processedAttachmentContext
          ? [...serverMessages, { role: "system", content: processedAttachmentContext }]
          : serverMessages;
        let finalMessages: ChatMessage[] = attachmentMessages;
        if (generalTools.length) {
          const toolResult = resolved.viaOpenRouter
            ? await runOpenRouterWithTools({
                modelSlug: OPENROUTER_MODEL_SLUG[modelAlias], modelAlias, apiKey: resolved.apiKey,
                messages: attachmentMessages as ToolChatMessage[], context: undefined, connectors: [],
                toolNames: GENERAL_CHAT_TOOL_NAMES, toolRegistry: generalTools, req, sendEvent, runId: turnId, conversationId,
              })
            : await runDeepSeekNativeWithTools({
                apiModel: getModel(modelAlias).apiModel, modelAlias, baseUrl: getDeepSeekBaseUrl(), apiKey: resolved.apiKey,
                messages: attachmentMessages as ToolChatMessage[], context: undefined, connectors: [],
                toolNames: GENERAL_CHAT_TOOL_NAMES, toolRegistry: generalTools, req, sendEvent, runId: turnId, conversationId,
              });
          finalMessages = flattenToolHistoryToChatMessages(toolResult.messages);
        }
        chatEvents.emit("assistant.interim", {
          message: "Model mulai menyusun jawaban dari konteks yang tersedia.",
          phase: "model",
        });
        const finalThinking = resolvedThinking;

        if (resolved.viaOpenRouter) {
          await streamOpenRouter(modelAlias, finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, turnId, conversationId);
        } else {
          await streamDeepSeekNative(finalMessages, finalThinking, effort, resolved.apiKey, req, sendEvent, turnId, conversationId, modelAlias);
        }

        // Activity timeline berasal dari milestone aktual di route/tool pipeline.
        // Tidak ada secondary model atau summarizer reasoning murah.

        // Fase 10: candidate claims diverifikasi deterministik SEBELUM answer composer
        // mengirim konten ke klien. Provider tidak pernah diberi wewenang menampilkan
        // kuantitas tanpa provenance/authority yang cukup.
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

        sendEvent("message", { type: "done", runId, conversationId, finalMarkdown: claimResult.responseText, timestamp: new Date().toISOString() });
      } catch (err) {
        if (isTurnStopped(turnId)) {
          chatEvents.emit("turn.interrupted", { reason: "user_stop", resumable: true });
        } else if (!req.signal.aborted) {
          chatEvents.emit("turn.failed", { error: err instanceof Error ? err.message : "Stream error" });
        }
      } finally {
        clearTurnControl(turnId);
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
