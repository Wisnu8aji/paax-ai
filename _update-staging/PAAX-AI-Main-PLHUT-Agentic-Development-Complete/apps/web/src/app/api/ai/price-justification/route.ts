import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { GEMINI_MODEL, geminiJson } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";

const JustificationSchema = z.array(z.object({
  row_index: z.number(),
  justification: z.string(),
}));

function fallbackJustification(direction: string, threshold: number): string {
  return direction === "above"
    ? `Harga impor berada di atas acuan engine melewati ambang ${threshold}%. Periksa spesifikasi, lokasi, dan markup vendor.`
    : `Harga impor berada di bawah acuan engine melewati ambang ${threshold}%. Periksa apakah item, satuan, atau cakupan pekerjaan berbeda.`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { anomalies?: unknown } | null;
  const anomalies = Array.isArray(body?.anomalies) ? body!.anomalies as Array<Record<string, unknown>> : [];
  if (!anomalies.length) {
    return NextResponse.json({ provider: "rule-based", justifications: [], fallback: false });
  }

  const fallback = anomalies.map((anomaly) => ({
    row_index: Number(anomaly.row_index),
    justification: fallbackJustification(String(anomaly.direction), Number(anomaly.threshold_pct)),
  }));

  const key = process.env.GEMINI_API_KEY;
  if (!key?.trim()) {
    return NextResponse.json({ provider: "rule-based", justifications: fallback, fallback: false });
  }

  try {
    const raw = await geminiJson([
      "Tulis justifikasi singkat untuk anomali harga RAB.",
      "Angka anomali sudah dihitung deterministik oleh engine/frontend; jangan hitung ulang.",
      "Kembalikan JSON array {row_index, justification}.",
      JSON.stringify(anomalies),
    ].join("\n"), key);
    const justifications = JustificationSchema.parse(raw);
    return NextResponse.json({ provider: GEMINI_MODEL, justifications, fallback: false });
  } catch {
    return NextResponse.json({ provider: "rule-based", justifications: fallback, fallback: true });
  }
}
