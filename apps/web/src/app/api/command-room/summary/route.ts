/**
 * POST /api/command-room/summary
 *
 * Ringkasan progres percakapan Command Room — dipakai panel Summary (side
 * panel kanan). Bukan jalur perhitungan RAB/HSP (Aturan Emas §1 tidak
 * berlaku di sini): ini murni meringkas teks percakapan, jadi aman dikerjakan
 * LLM. Model: Mistral Small 3.1 via OpenRouter, 1 shared key yang sama dengan
 * Lucent/Arete/Noir (DEEPSEEK_API_KEY, format sk-or-v1-...). Non-streaming —
 * respons pendek, tidak butuh SSE.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const SummaryRequestSchema = z.object({
  title: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string(),
      }),
    )
    .min(1),
});

const SUMMARY_MODEL = "mistralai/mistral-small-24b-instruct-2501";

const SUMMARY_SYSTEM_PROMPT =
  "Anda meringkas progres sebuah percakapan teknik sipil untuk panel samping. " +
  "Jawab singkat dalam Bahasa Indonesia (maks 5 kalimat/poin), fokus pada: " +
  "apa yang sedang dikerjakan, sejauh mana progresnya, dan apa langkah berikutnya " +
  "yang menggantung. Jangan mengarang angka RAB/HSP/volume yang tidak ada di teks — " +
  "hanya rangkum apa yang benar-benar dibahas.";

function getSharedKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY?.trim() || undefined;
}

function isOpenRouterKey(apiKey: string): boolean {
  return apiKey.trim().startsWith("sk-or-v1-");
}

export async function POST(req: NextRequest) {
  const parsed = SummaryRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const apiKey = getSharedKey();
  if (!apiKey || !isOpenRouterKey(apiKey)) {
    return NextResponse.json(
      { error: "Ringkasan butuh OpenRouter API key (DEEPSEEK_API_KEY) yang belum terpasang di server ini." },
      { status: 503 },
    );
  }

  const { title, messages } = parsed.data;
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "PAAX"}: ${m.text}`)
    .join("\n\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: `Judul percakapan: ${title}\n\nIsi percakapan:\n${transcript}` },
        ],
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      let errMessage = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errBody = await res.json();
        if (errBody.error?.message) errMessage = errBody.error.message;
      } catch { /* body bukan JSON */ }
      return NextResponse.json({ error: errMessage }, { status: 502 });
    }

    const data = await res.json();
    const summary: string = data.choices?.[0]?.message?.content?.trim() || "";
    if (!summary) {
      return NextResponse.json({ error: "Model tidak mengembalikan ringkasan." }, { status: 502 });
    }
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menghubungi OpenRouter.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
