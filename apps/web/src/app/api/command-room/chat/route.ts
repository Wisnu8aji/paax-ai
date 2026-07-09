/**
 * POST /api/command-room/chat
 *
 * Server-side API route untuk Command Room.
 * Hanya menerima model "lucent" atau "solace" → provider DeepSeek.
 * DEEPSEEK_API_KEY TIDAK PERNAH dikirim ke client.
 *
 * ATURAN EMAS: Route ini hanya memanggil DeepSeek untuk menghasilkan
 * teks jawaban. Tidak ada kalkulasi angka RAB/HSP/volume di sini.
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

export const runtime = "nodejs";
export const maxDuration = 600; // 10 menit — Solace thinking bisa lambat

// ─── Schema validasi request ─────────────────────────────────────────────────

const CommandRoomChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(40),
  modelAlias: z.enum(["lucent", "solace"]),
  reasoningEffort: z.enum(["high", "max"]).default("high"),
  thinking: z.enum(["on", "off"]).default("off"),
});

type CommandRoomChatBody = z.infer<typeof CommandRoomChatSchema>;

// ─── Helper: baca env (prioritaskan proses env, fallback .env.local) ──────────

function getDeepSeekKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY?.trim() || undefined;
}

function getDeepSeekBaseUrl(): string {
  return (
    process.env.DEEPSEEK_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.deepseek.com"
  );
}

interface DeepSeekMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface DeepSeekPayload {
  model: string;
  messages: DeepSeekMessage[];
  max_tokens?: number;
  temperature?: number;
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: ReasoningEffort;
}

function isOpenRouterKey(apiKey: string): boolean {
  return apiKey.trim().startsWith("sk-or-v1-");
}

function resolveBaseUrl(apiKey: string, configUrl: string): string {
  if (isOpenRouterKey(apiKey) && configUrl.includes("api.deepseek.com")) {
    return "https://openrouter.ai/api/v1";
  }
  return configUrl;
}

function resolveApiModel(apiKey: string, modelAlias: ModelAlias): string {
  const modelDef = getModel(modelAlias);
  if (isOpenRouterKey(apiKey)) {
    return modelAlias === "solace"
      ? "deepseek/deepseek-v4-pro"
      : "deepseek/deepseek-v4-flash";
  }
  return modelDef.apiModel;
}

function buildPayload(
  messages: DeepSeekMessage[],
  modelAlias: ModelAlias,
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
): DeepSeekPayload {
  const resolvedThinking = resolveThinking(modelAlias, thinking);
  const apiModel = resolveApiModel(apiKey, modelAlias);

  const payload: DeepSeekPayload = {
    model: apiModel,
    messages,
  };

  // Jangan sertakan parameter platform khusus jika menggunakan OpenRouter
  if (isOpenRouterKey(apiKey)) {
    if (modelAlias === "solace") {
      payload.max_tokens = 16384;
    } else {
      payload.temperature = 0.2;
    }
    return payload;
  }

  // Parameter platform DeepSeek murni
  if (resolvedThinking === "on") {
    payload.thinking = { type: "enabled" };
    payload.reasoning_effort = effort;
    payload.max_tokens = 16384;
  } else {
    payload.thinking = { type: "disabled" };
    payload.temperature = 0.2;
    payload.reasoning_effort = effort;
  }

  return payload;
}

// ─── Helper: panggil DeepSeek API ────────────────────────────────────────────

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  error?: { message?: string; type?: string; code?: string | number };
}

async function callDeepSeek(
  payload: DeepSeekPayload,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as DeepSeekResponse | null;
      const msg =
        err?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`DeepSeek gagal (${res.status}): ${msg}`);
    }

    const data = (await res.json()) as DeepSeekResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("DeepSeek tidak mengembalikan teks.");
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `DeepSeek timeout setelah ${Math.round(timeoutMs / 1000)} detik.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callDeepSeekWithRetry(
  messages: DeepSeekMessage[],
  modelAlias: ModelAlias,
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<string> {
  const payload = buildPayload(messages, modelAlias, thinking, effort, apiKey);

  try {
    return await callDeepSeek(payload, apiKey, baseUrl, timeoutMs);
  } catch (firstError) {
    const msg =
      firstError instanceof Error ? firstError.message.toLowerCase() : "";
    // Jika error mengarah ke reasoning_effort tidak valid, retry tanpa field itu
    const isReasoningError =
      msg.includes("reasoning_effort") ||
      msg.includes("400") ||
      msg.includes("invalid");

    if (!isReasoningError) throw firstError;

    console.warn(
      `[CommandRoom] reasoning_effort ditolak, retry tanpa field itu.`,
    );
    const retryPayload = { ...payload };
    delete retryPayload.reasoning_effort;
    return await callDeepSeek(retryPayload, apiKey, baseUrl, timeoutMs);
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse body
  const body = await req.json().catch(() => null);
  const parsed = CommandRoomChatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Request tidak valid. Pastikan messages, modelAlias, reasoningEffort, dan thinking sudah benar.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { messages, modelAlias, reasoningEffort, thinking } =
    parsed.data as CommandRoomChatBody;

  // 2. Cek API key
  const apiKey = getDeepSeekKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DeepSeek API key belum dikonfigurasi. Tambahkan DEEPSEEK_API_KEY ke .env.local.",
      },
      { status: 503 },
    );
  }

  // 3. Resolusi model & thinking (Lucent dipaksa thinking off)
  const resolvedThinking = resolveThinking(modelAlias, thinking);
  const apiModel = resolveApiModel(apiKey, modelAlias);
  const configUrl = getDeepSeekBaseUrl();
  const baseUrl = resolveBaseUrl(apiKey, configUrl);


  // Timeout: Solace thinking ON butuh waktu lebih lama
  const timeoutMs =
    modelAlias === "solace" && resolvedThinking === "on"
      ? 600_000  // 10 menit untuk Solace thinking
      : 120_000; // 2 menit untuk Lucent atau Solace non-thinking

  // 4. Log (tanpa API key, tanpa data sensitif)
  console.log(
    `[CommandRoom] model=${modelAlias} apiModel=${apiModel} thinking=${resolvedThinking} effort=${reasoningEffort} messages=${messages.length}`,
  );

  // 5. Panggil DeepSeek
  try {
    const answer = await callDeepSeekWithRetry(
      messages,
      modelAlias,
      resolvedThinking,
      reasoningEffort,
      apiKey,
      baseUrl,
      timeoutMs,
    );

    return NextResponse.json({
      answer,
      model: modelAlias,
      apiModel: apiModel,
      thinking: resolvedThinking,
      reasoningEffort,
    });
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : "Command Room gagal menghubungi DeepSeek.";

    console.error(`[CommandRoom] Error: ${errMsg}`);

    // Jangan expose stack trace atau detail rahasia ke client
    return NextResponse.json(
      {
        error:
          "Command Room gagal menghubungi DeepSeek. Cek API key, saldo, model, atau koneksi.",
        detail: errMsg,
      },
      { status: 502 },
    );
  }
}

// ─── GET handler (health check) ───────────────────────────────────────────────

export async function GET() {
  const hasKey = Boolean(getDeepSeekKey());
  return NextResponse.json({
    status: hasKey ? "ready" : "missing_api_key",
    models: Object.values(PAAX_MODELS).map((m) => ({
      id: m.id,
      displayName: m.displayName,
      apiModel: m.apiModel,
      supportsThinking: m.supportsThinking,
    })),
  });
}
