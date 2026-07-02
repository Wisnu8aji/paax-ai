import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GEMINI_MODEL, geminiText } from "@/lib/ai/orchestrator";
import {
  buildEngineeringChatPrompt,
  fallbackEngineeringAnswer,
  type EngineeringChatEngineHealth,
  type EngineeringChatEngineStatus,
} from "@/lib/ai/engineering-chat";

export const runtime = "nodejs";

const CORE_ENGINE_URL = process.env.NEXT_PUBLIC_CORE_ENGINE_URL || "http://localhost:8081";
const CHAT_TIMEOUT_MS = 5000;

const ChatBodySchema = z.object({
  message: z.string().min(1),
  projectId: z.string().optional(),
  // Context pack (skrip TKG + draft RAB) dari client — DATA, bukan instruksi
  // (P-SEC-01). Dibatasi panjangnya sebagai budget guard (P-OPS-02).
  context: z.string().max(8000).optional(),
});

async function fetchEngineStatus(): Promise<EngineeringChatEngineStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const response = await fetch(`${CORE_ENGINE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { online: false, url: CORE_ENGINE_URL, error: `HTTP ${response.status}` };
    }
    const health = (await response.json()) as EngineeringChatEngineHealth;
    return { online: true, url: CORE_ENGINE_URL, health };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tidak dapat menghubungi engine";
    return { online: false, url: CORE_ENGINE_URL, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const engine = await fetchEngineStatus();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  return NextResponse.json({
    provider: hasGemini ? GEMINI_MODEL : "rule-based",
    model: hasGemini ? GEMINI_MODEL : null,
    engine,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pesan chat kosong atau bukan JSON valid." }, { status: 400 });
  }

  const engine = await fetchEngineStatus();
  const prompt = buildEngineeringChatPrompt({
    message: parsed.data.message,
    projectId: parsed.data.projectId,
    projectContext: parsed.data.context,
    engine,
  });

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({
      provider: "local-fallback",
      fallback: false,
      engine,
      answer: fallbackEngineeringAnswer({
        message: parsed.data.message,
        projectId: parsed.data.projectId,
        engine,
        aiError: "GEMINI_API_KEY belum disetel",
      }),
    });
  }

  try {
    const answer = await geminiText(prompt, key);
    return NextResponse.json({
      provider: GEMINI_MODEL,
      fallback: false,
      engine,
      answer,
    });
  } catch (error) {
    const aiError = error instanceof Error ? error.message : "Gemini gagal tanpa detail";
    return NextResponse.json({
      provider: GEMINI_MODEL,
      fallback: true,
      ai_error: aiError,
      engine,
      answer: fallbackEngineeringAnswer({
        message: parsed.data.message,
        projectId: parsed.data.projectId,
        engine,
        aiError,
      }),
    });
  }
}
