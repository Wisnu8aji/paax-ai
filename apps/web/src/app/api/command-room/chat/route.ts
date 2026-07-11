/**
 * POST /api/command-room/chat
 *
 * Server-side API route untuk Command Room (Streaming).
 * 3 model: Lucent (DeepSeek native/OpenRouter), Arete (Qwen3.7-Plus via
 * DashScope), Noir (Claude Sonnet 5 via Anthropic SDK resmi).
 * API key provider TIDAK PERNAH dikirim ke client.
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

export const runtime = "nodejs";
export const maxDuration = 600; // 10 menit

// ─── Schema validasi request ─────────────────────────────────────────────────

const CommandRoomChatSchema = z.object({
  runId: z.string().optional(),
  conversationId: z.string().optional(),
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

// ─── Helper: baca env ──────────

function getDeepSeekKey(): string | undefined {
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

function keyForModel(modelAlias: ModelAlias): string | undefined {
  if (modelAlias === "lucent") return getDeepSeekKey();
  if (modelAlias === "arete") return getDashScopeKey();
  return getAnthropicKey();
}

function isOpenRouterKey(apiKey: string): boolean {
  return apiKey.trim().startsWith("sk-or-v1-");
}

// ─── Shared: parse satu baris SSE OpenAI-compatible (DeepSeek & DashScope) ────
// Baik DeepSeek maupun DashScope (Qwen) mengembalikan reasoning lewat salah
// satu dari `reasoning` / `reasoning_content` / `reasoning_details` pada
// delta yang SAMA — jangan dijumlahkan (lihat catatan histori bug di bawah),
// pilih satu sumber saja per prioritas.
export function extractDelta(delta: any): { content: string; reasoning: string; finishReason?: string } {
  let reasoning = "";
  if (typeof delta?.reasoning === "string" && delta.reasoning) {
    reasoning = delta.reasoning;
  } else if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
    reasoning = delta.reasoning_content;
  } else if (Array.isArray(delta?.reasoning_details)) {
    for (const item of delta.reasoning_details) {
      if (item?.type === "reasoning.text" && typeof item.text === "string") reasoning += item.text;
      if (item?.type === "reasoning.summary" && typeof item.summary === "string") reasoning += item.summary;
    }
  }
  return { content: typeof delta?.content === "string" ? delta.content : "", reasoning };
}

// ─── Lucent — DeepSeek native / OpenRouter ────────────────────────────────────

function resolveDeepSeekModel(apiKey: string): string {
  return isOpenRouterKey(apiKey) ? "deepseek/deepseek-v4-pro" : getModel("lucent").apiModel;
}

function buildDeepSeekPayload(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
): Record<string, any> {
  const isOr = isOpenRouterKey(apiKey);
  const normalizedEffort = effort === "max" ? (isOr ? "xhigh" : "max") : "high";
  const payload: Record<string, any> = {
    model: resolveDeepSeekModel(apiKey),
    messages: withSystemPrompt(messages),
    stream: true,
  };

  if (thinking === "on") {
    payload.max_tokens = effort === "max" ? 8192 : 4096;
    payload.reasoning = { enabled: true, effort: normalizedEffort, exclude: false };
    payload.reasoning_effort = normalizedEffort;
    payload.thinking = { type: "enabled" };
    payload.include_reasoning = true;
    if (isOr) payload.provider = { require_parameters: true };
  } else {
    payload.max_tokens = 2048;
    payload.temperature = 0.2;
    payload.reasoning = { enabled: false, effort: "none", exclude: true };
    payload.thinking = { type: "disabled" };
  }

  return payload;
}

async function streamDeepSeek(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  req: NextRequest,
  sendEvent: SendEvent,
  runId: string | undefined,
  conversationId: string | undefined,
): Promise<void> {
  const apiKey = getDeepSeekKey();
  if (!apiKey) throw new Error("DeepSeek API key belum dikonfigurasi.");
  const isOr = isOpenRouterKey(apiKey);
  const baseUrl = isOr ? "https://openrouter.ai/api/v1" : getDeepSeekBaseUrl();
  const payload = buildDeepSeekPayload(messages, thinking, effort, apiKey);

  const MAX_CONTINUATIONS = 5;
  let currentMessages = [...payload.messages];
  let hitLengthLimit = true;
  let continuationCount = 0;

  while (hitLengthLimit) {
    hitLengthLimit = false;
    const currentPayload: Record<string, any> = { ...payload, messages: currentMessages };

    if (continuationCount > 0) {
      // Auto-continue: matikan reasoning agar fokus menulis sisa konten.
      // reasoning_effort TIDAK dihapus di sini akan bikin OpenRouter menolak
      // request ("reasoning_effort and reasoning.effort are both provided
      // with conflicting values") karena bertentangan dengan reasoning.effort
      // "none" — ini pernah menggagalkan SETIAP auto-continue, jangan diulang.
      currentPayload.reasoning = { enabled: false, effort: "none", exclude: true };
      currentPayload.thinking = { type: "disabled" };
      currentPayload.include_reasoning = false;
      delete currentPayload.reasoning_effort;
      currentPayload.max_tokens = Math.max(payload.max_tokens ?? 4096, 4096);
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(currentPayload),
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
    if (!res.body) throw new Error("No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullContentThisRound = "";

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
          if (finishReason === "length") hitLengthLimit = true;
          if (!delta) continue;

          const { content, reasoning } = extractDelta(delta);
          if (reasoning) {
            sendEvent("message", { type: "reasoning", runId, conversationId, delta: reasoning, timestamp: new Date().toISOString() });
          }
          if (content) {
            fullContentThisRound += content;
            sendEvent("message", { type: "content", runId, conversationId, delta: content, timestamp: new Date().toISOString() });
          }
        } catch { /* partial chunk, abaikan */ }
      }
    }

    if (hitLengthLimit) {
      continuationCount++;
      if (continuationCount > MAX_CONTINUATIONS) {
        hitLengthLimit = false;
        sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: "Batas auto-lanjut tercapai, menghentikan generasi." });
        break;
      }
      if (fullContentThisRound.trim().length > 0) {
        currentMessages.push({ role: "assistant", content: fullContentThisRound });
      }
      sendEvent("message", { type: "status", phase: "streaming_response", statusLabel: `Auto-continuing (part ${continuationCount + 1})...` });
    }
  }
}

// ─── Arete — Qwen3.7-Plus via DashScope (OpenAI-compatible mode) ──────────────
// NOTE: field enable_thinking/thinking_budget belum diverifikasi end-to-end
// (butuh DASHSCOPE_API_KEY nyata) — cek respons asli sebelum production.
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
    payload.max_tokens = effort === "max" ? 8192 : 4096;
    // max effort = tanpa batas (thinking_budget dihilangkan); high = dibatasi.
    if (effort !== "max") payload.thinking_budget = ARETE_THINKING_BUDGET_HIGH;
  } else {
    payload.enable_thinking = false;
    payload.max_tokens = 2048;
    payload.temperature = 0.2;
  }
  return payload;
}

async function streamDashScope(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  req: NextRequest,
  sendEvent: SendEvent,
  runId: string | undefined,
  conversationId: string | undefined,
): Promise<void> {
  const apiKey = getDashScopeKey();
  if (!apiKey) throw new Error("DashScope API key belum dikonfigurasi.");
  const payload = buildDashScopePayload(messages, thinking, effort);

  const res = await fetch(`${getDashScopeBaseUrl()}/chat/completions`, {
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
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

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
        if (!delta) continue;
        const { content, reasoning } = extractDelta(delta);
        if (reasoning) {
          sendEvent("message", { type: "reasoning", runId, conversationId, delta: reasoning, timestamp: new Date().toISOString() });
        }
        if (content) {
          sendEvent("message", { type: "content", runId, conversationId, delta: content, timestamp: new Date().toISOString() });
        }
      } catch { /* partial chunk, abaikan */ }
    }
  }
}

// ─── Noir — Claude Sonnet 5 via Anthropic SDK resmi ───────────────────────────

function splitSystemAndMessages(messages: ChatMessage[]): { system?: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const withSystem = withSystemPrompt(messages);
  const systemParts = withSystem.filter((m) => m.role === "system").map((m) => m.content);
  const rest = withSystem
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role === "user" || m.role === "assistant");
  return { system: systemParts.length ? systemParts.join("\n\n") : undefined, messages: rest };
}

async function streamAnthropic(
  messages: ChatMessage[],
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  req: NextRequest,
  sendEvent: SendEvent,
  runId: string | undefined,
  conversationId: string | undefined,
): Promise<void> {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("Anthropic API key belum dikonfigurasi.");
  const client = new Anthropic({ apiKey });
  const { system, messages: anthropicMessages } = splitSystemAndMessages(messages);

  const stream = client.messages.stream(
    {
      model: getModel("noir").apiModel,
      max_tokens: thinking === "on" ? (effort === "max" ? 8192 : 4096) : 2048,
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

  const { runId, conversationId, messages, modelAlias, reasoningEffort, thinking } = parsed.data;
  const apiKey = keyForModel(modelAlias);
  if (!apiKey) {
    const providerLabel = getModel(modelAlias).provider;
    return NextResponse.json(
      { error: `API key untuk ${providerLabel} (${getModel(modelAlias).displayName}) belum dikonfigurasi.` },
      { status: 503 },
    );
  }

  const resolvedThinking = resolveThinking(modelAlias, thinking);
  const effort = reasoningEffort as ReasoningEffort;

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let sequenceCounter = 0;
      const sendEvent: SendEvent = (_type, data) => {
        data.sequence = sequenceCounter++;
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (modelAlias === "lucent") {
          await streamDeepSeek(messages, resolvedThinking, effort, req, sendEvent, runId, conversationId);
        } else if (modelAlias === "arete") {
          await streamDashScope(messages, resolvedThinking, effort, req, sendEvent, runId, conversationId);
        } else {
          await streamAnthropic(messages, resolvedThinking, effort, req, sendEvent, runId, conversationId);
        }
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
      ready: Boolean(keyForModel(m.id)),
    })),
  });
}
