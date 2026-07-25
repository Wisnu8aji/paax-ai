/**
 * PAAX — Endpoint ekstraksi TKG (server-side).
 *
 * API key Gemini tetap di server. AI hanya MENYALIN gambar/teks menjadi
 * TkgDocument (usulan, generated_by="ai_proposal"); angka kuantitas dihitung
 * engine via POST /tkg/takeoff. Fallback: input manual TKG di UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractTkgWithProvider } from "@/lib/ai/tkg-extractor";
import { getExtractorProviderStatus } from "@/lib/ai/orchestrator";

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
  const projectId = (body as { projectId?: unknown })?.projectId;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Teks gambar kosong." }, { status: 400 });
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "projectId wajib diisi." }, { status: 400 });
  }

  const result = await extractTkgWithProvider(text, projectId, extractorKey());
  return NextResponse.json(result);
}
