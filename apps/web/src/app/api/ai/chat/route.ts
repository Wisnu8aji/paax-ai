import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
  NVIDIA_BASE_URL,
  NVIDIA_LUCENT_MODEL,
  NVIDIA_SOLACE_MODEL,
  nvidiaText,
} from "@/lib/ai/orchestrator";
import {
  buildEngineeringChatPrompt,
  fallbackEngineeringAnswer,
  type EngineeringChatEngineHealth,
  type EngineeringChatEngineStatus,
} from "@/lib/ai/engineering-chat";

export const runtime = "nodejs";
export const maxDuration = 300;


const CORE_ENGINE_URL = process.env.NEXT_PUBLIC_CORE_ENGINE_URL || "http://localhost:8081";
const CHAT_TIMEOUT_MS = 5000;
const SUPPORTED_ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

function envValue(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  try {
    const envText = readFileSync(join(process.cwd(), "..", "..", ".env.local"), "utf-8");
    const line = envText
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name}=`));
    const value = line?.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
    return value || undefined;
  } catch {
    return undefined;
  }
}

function nvidiaModelEnv(name: string, fallback: string): string {
  const value = envValue(name);
  if (!value || value.startsWith("nvapi-")) return fallback;
  return value;
}

function nvidiaKeyForChat(model: "Lucent" | "Solace" | undefined): string | undefined {
  if (model === "Solace") {
    return envValue("NVIDIA_SOLACE_API_KEY") ?? envValue("NVIDIA_DEEPSEEK_API_KEY") ?? envValue("NVIDIA_API_KEY");
  }
  return envValue("NVIDIA_LUCENT_API_KEY") ?? envValue("NVIDIA_KIMI_API_KEY") ?? envValue("NVIDIA_API_KEY");
}

function envNumber(name: string, fallback: number): number {
  const value = envValue(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const ChatBodySchema = z.object({
  message: z.string().min(1),
  projectId: z.string().optional(),
  model: z.enum(["Lucent", "Solace"]).optional(),
  // Context pack (skrip TKG + draft RAB) dari client — DATA, bukan instruksi
  // (P-SEC-01). Dibatasi panjangnya sebagai budget guard (P-OPS-02).
  context: z.string().max(8000).optional(),
  attachments: z.array(z.object({
    mimeType: z.enum(SUPPORTED_ATTACHMENT_MIME_TYPES),
    data: z.string().min(1).max(12_000_000),
  })).max(4).optional(),
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
  const hasNvidia = Boolean(nvidiaKeyForChat("Lucent") || nvidiaKeyForChat("Solace"));
  const lucentModel = nvidiaModelEnv("NVIDIA_LUCENT_MODEL", NVIDIA_LUCENT_MODEL);
  return NextResponse.json({
    provider: hasNvidia ? "nvidia" : "local-fallback",
    model: hasNvidia ? lucentModel : null,
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
    attachmentCount: parsed.data.attachments?.length ?? 0,
    engine,
  });

  const nvidiaKey = nvidiaKeyForChat(parsed.data.model);
  const nvidiaBaseUrl = envValue("NVIDIA_BASE_URL") ?? NVIDIA_BASE_URL;
  const nvidiaModel = parsed.data.model === "Solace"
    ? nvidiaModelEnv("NVIDIA_SOLACE_MODEL", NVIDIA_SOLACE_MODEL)
    : nvidiaModelEnv("NVIDIA_LUCENT_MODEL", NVIDIA_LUCENT_MODEL);
  const aiProviderName = parsed.data.model === "Solace" ? "NVIDIA DeepSeek Pro" : "NVIDIA Kimi";
  if (!nvidiaKey) {
    return NextResponse.json({
      provider: "local-fallback",
      fallback: false,
      engine,
      answer: fallbackEngineeringAnswer({
        message: parsed.data.message,
        projectId: parsed.data.projectId,
        engine,
        aiProvider: aiProviderName,
        aiError: "NVIDIA_API_KEY belum disetel",
      }),
    });
  }

  try {
    const attachments = parsed.data.attachments ?? [];
    if (attachments.length > 0) {
      return NextResponse.json({
        provider: nvidiaModel,
        fallback: true,
        engine,
        ai_error: "Lampiran di Command Room belum dialihkan ke NVIDIA multimodal. Pakai Drawing Intelligence untuk analisa gambar/PDF.",
        answer: fallbackEngineeringAnswer({
          message: parsed.data.message,
          projectId: parsed.data.projectId,
          engine,
          aiProvider: aiProviderName,
          aiError: "lampiran chat belum didukung NVIDIA",
        }),
      });
    }
    const useThinking = parsed.data.model === "Solace";
    const answer = await nvidiaText(prompt, {
      apiKey: nvidiaKey,
      baseUrl: nvidiaBaseUrl,
      model: nvidiaModel,
      thinking: useThinking,
      timeoutMs: parsed.data.model === "Solace"
        ? envNumber("NVIDIA_SOLACE_TIMEOUT_MS", 3600_000)
        : envNumber("NVIDIA_LUCENT_TIMEOUT_MS", 120_000),
    });
    return NextResponse.json({
      provider: nvidiaModel,
      fallback: false,
      engine,
      answer,
    });
  } catch (error) {
    const aiError = error instanceof Error ? error.message : "AI gagal tanpa detail";
    return NextResponse.json({
      provider: nvidiaModel,
      fallback: true,
      ai_error: aiError,
      engine,
      answer: fallbackEngineeringAnswer({
        message: parsed.data.message,
        projectId: parsed.data.projectId,
        engine,
        aiProvider: aiProviderName,
        aiError,
      }),
    });
  }
}
