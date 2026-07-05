import type { Request, Response } from "express";
import { z } from "zod";

import { GEMINI_MODEL } from "../config";
import { runToolCallingLoop } from "../gemini/tool-loop";
import { createToolRegistry } from "../tools/registry";
import type { ChatContext } from "../tools/types";

export const systemPrompt = [
  "Anda adalah Engineering Chat PAAX, asisten AI di workspace insinyur sipil Indonesia.",
  "Anda punya akses ke tool: lookup_ahsp (cari kode AHSP), run_scenario (jalankan simulasi skenario waktu-biaya via engine deterministik), analyze_drawing (cek status dan ringkasan hasil analisa gambar dari job_id document-intelligence), query_rab (baca snapshot RAB dari context), query_schedule (baca snapshot jadwal dari context), query_progress (stub jujur fitur progres), query_materials (stub jujur fitur material).",
  "WAJIB gunakan tool ini kalau pertanyaan user butuh data itu -- JANGAN mengarang kode AHSP, data RAB, data jadwal, hasil analisa gambar, progres, material, atau angka simulasi sendiri.",
  "query_rab dan query_schedule hanya membaca context yang dikirim caller; kalau context tidak ada, jelaskan bahwa data belum tersedia.",
  "analyze_drawing hanya meringkas hasil job analisa gambar yang sudah ada; kalau job tidak ditemukan, jelaskan bahwa job mungkin kadaluarsa atau service restart. Jangan menghitung RAB dari hasil gambar di tool ini.",
  "query_progress dan query_materials saat ini akan mengembalikan pesan belum tersedia; jangan memanggil tool yang sama berulang-ulang setelah mendapat status itu.",
  "Jika user meminta total biaya atau simulasi waktu-biaya, gunakan run_scenario atau minta data yang cukup; jangan menjumlahkan sendiri dari query_rab.",
  "Angka final SELALU dari hasil tool (core-engine), tidak pernah dari perkiraan Anda sendiri.",
  "Jawab singkat, teknis, Bahasa Indonesia.",
].join(" ");

const ChatBodySchema = z.object({
  message: z.string().min(1),
  project_id: z.string().optional(),
  context: z.custom<ChatContext>().optional(),
});

export function createChatHandler(params: {
  geminiApiKey: string;
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  fetchImpl?: typeof fetch;
  maxTurns?: number;
}) {
  return async function chatHandler(req: Request, res: Response) {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "message wajib diisi" });

    if (!params.geminiApiKey.trim()) {
      return res.json({
        provider: "local-fallback",
        fallback: true,
        answer: "GEMINI_API_KEY belum disetel di ai-orchestrator.",
        tool_calls: [],
      });
    }

    const tools = createToolRegistry({
      coreEngineUrl: params.coreEngineUrl,
      documentIntelligenceUrl: params.documentIntelligenceUrl,
      fetchImpl: params.fetchImpl,
    });
    const result = await runToolCallingLoop({
      apiKey: params.geminiApiKey,
      systemPrompt,
      userMessage: parsed.data.message,
      tools,
      context: parsed.data.context,
      maxTurns: params.maxTurns,
      fetchImpl: params.fetchImpl,
    });

    return res.json({
      provider: GEMINI_MODEL,
      fallback: false,
      answer: result.answer,
      tool_calls: result.toolCalls,
    });
  };
}
