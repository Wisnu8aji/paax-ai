/**
 * PAAX — Endpoint ekstraksi TKG (server-side).
 *
 * API key Gemini tetap di server. AI hanya MENYALIN gambar/teks menjadi
 * TkgDocument (usulan, generated_by="ai_proposal"); angka kuantitas dihitung
 * engine via POST /tkg/takeoff. Fallback: input manual TKG di UI.
 */
import { NextRequest, NextResponse } from "next/server";

import { extractTkgWithProvider } from "@/lib/ai/tkg-extractor";
import { getExtractorProviderStatus } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

export async function GET() {
  const status = getExtractorProviderStatus(process.env.GEMINI_API_KEY);
  return NextResponse.json({
    provider: status.provider === "gemini" ? status.model : "manual",
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
  const projectId = (body as { projectId?: unknown })?.projectId;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Teks gambar kosong." }, { status: 400 });
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "projectId wajib diisi." }, { status: 400 });
  }

  const result = await extractTkgWithProvider(text, projectId, process.env.GEMINI_API_KEY);
  return NextResponse.json(result);
}
