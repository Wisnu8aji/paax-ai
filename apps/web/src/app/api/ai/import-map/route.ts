import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GEMINI_MODEL, geminiJson } from "@/lib/ai/orchestrator";
import { guessColumnMapping } from "@/lib/smart-import/smart-import";

export const runtime = "nodejs";

const MappingSchema = z.object({
  description: z.string().nullable(),
  volume: z.string().nullable(),
  unit: z.string().nullable(),
  unit_price: z.string().nullable(),
  ahsp_code: z.string().nullable(),
});

function prompt(headers: string[], sampleRows: string[][]): string {
  return [
    "Anda hanya memetakan header tabel RAB ke skema PAAX.",
    "Jangan menghitung angka. Kembalikan JSON objek dengan key:",
    "description, volume, unit, unit_price, ahsp_code. Value harus salah satu header atau null.",
    `Headers: ${JSON.stringify(headers)}`,
    `Sample rows: ${JSON.stringify(sampleRows.slice(0, 5))}`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { headers?: unknown; sampleRows?: unknown } | null;
  const headers = Array.isArray(body?.headers) ? body!.headers.filter((h): h is string => typeof h === "string") : [];
  const sampleRows = Array.isArray(body?.sampleRows) ? (body!.sampleRows as string[][]) : [];
  if (!headers.length) {
    return NextResponse.json({ error: "Header tabel kosong." }, { status: 400 });
  }

  const fallback = guessColumnMapping(headers);
  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    return NextResponse.json({ provider: "rule-based", mapping: fallback, fallback: false });
  }

  try {
    const raw = await geminiJson(prompt(headers, sampleRows), key);
    const mapping = MappingSchema.parse(raw);
    return NextResponse.json({ provider: GEMINI_MODEL, mapping, fallback: false });
  } catch {
    return NextResponse.json({ provider: "rule-based", mapping: fallback, fallback: true });
  }
}
