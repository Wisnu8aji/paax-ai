/**
 * PAAX v0.8 - Endpoint ekstraksi RAB (server-side).
 *
 * API key Gemini tetap di server. AI hanya mengusulkan struktur; semua angka
 * final tetap dihitung oleh core engine.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractElementsWithProvider, getExtractorProviderStatus } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

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

function extractorKey(): string | undefined {
  return envValue("NVIDIA_DRAWING_FAST_API_KEY") ?? envValue("NVIDIA_DRAWING_API_KEY") ?? envValue("NVIDIA_API_KEY");
}

export async function GET() {
  const status = getExtractorProviderStatus(extractorKey());
  return NextResponse.json({
    provider: status.provider === "gemini" ? status.model : status.provider,
    model: status.model,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON valid." }, { status: 400 });
  }

  const text = (body as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Teks elemen kosong." }, { status: 400 });
  }

  const result = await extractElementsWithProvider(text, extractorKey());
  return NextResponse.json(result);
}
