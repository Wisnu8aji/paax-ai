/**
 * PAAX v0.8 — Endpoint ekstraksi RAB (lapis orkestrasi AI, server-side).
 *
 * Berjalan di server agar API key model (mis. Gemini free tier) TIDAK pernah
 * terekspos ke browser. Saat ini memakai provider rule-based (tanpa key).
 *
 * Menyambungkan Gemini (free tier Google AI Studio) nanti = tambah provider
 * `geminiExtractor` dan baca `process.env.GEMINI_API_KEY` di bawah. Aturan emas
 * tetap: AI hanya menstruktur usulan; engine yang menghitung volume & biaya.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ruleBasedExtractor, type RabExtractor } from '@/lib/ai/rab-extractor';

export const runtime = 'nodejs';

function selectExtractor(): RabExtractor {
  // if (process.env.GEMINI_API_KEY) return geminiExtractor;  // ← free tier nanti
  return ruleBasedExtractor;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON valid.' }, { status: 400 });
  }
  const text = (body as { text?: unknown })?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Teks elemen kosong.' }, { status: 400 });
  }

  const extractor = selectExtractor();
  const elements = extractor.extract(text);
  return NextResponse.json({ provider: extractor.name, elements });
}
