/**
 * PAAX v0.8 - Endpoint ekstraksi RAB (server-side).
 *
 * API key Gemini tetap di server. AI hanya mengusulkan struktur; semua angka
 * final tetap dihitung oleh core engine.
 */
import { NextRequest, NextResponse } from "next/server";

import { extractElementsWithProvider, getExtractorProviderStatus } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

export async function GET() {
  const status = getExtractorProviderStatus(process.env.GEMINI_API_KEY);
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

  const result = await extractElementsWithProvider(text, process.env.GEMINI_API_KEY);
  return NextResponse.json(result);
}
