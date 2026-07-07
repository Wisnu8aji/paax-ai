import type { Request, Response } from "express";
import { z } from "zod";

import { GEMINI_MODEL } from "../config";
import { runToolCallingLoop } from "../gemini/tool-loop";
import { createToolRegistry } from "../tools/registry";
import type { ChatContext } from "../tools/types";

export const systemPrompt = [
  "Anda adalah Engineering Chat PAAX, asisten AI di workspace insinyur sipil Indonesia.",
  "Anda punya akses ke tool: search_knowledge (mencari pengetahuan RAG AHSP/proyek), lookup_ahsp (cari kode AHSP secara exact), run_scenario (jalankan simulasi skenario waktu-biaya via engine deterministik), analyze_drawing (cek status dan ringkasan hasil analisa gambar), query_rab (baca snapshot RAB), query_schedule (baca snapshot jadwal).",
  "WAJIB gunakan tool ini kalau pertanyaan user butuh data itu -- JANGAN mengarang kode AHSP, data RAB, data jadwal, hasil analisa gambar, progres, material, atau angka simulasi sendiri.",
  "Jika memakai hasil dari search_knowledge, WAJIB sebut kode/sumbernya (source_ref) secara eksplisit di jawaban (contoh: 'Menurut AHSP A.2.2.1-1...'), JANGAN parafrase tanpa rujukan.",
  "query_rab dan query_schedule membaca context atau DB API; kalau kosong, jelaskan bahwa data belum tersedia.",
  "analyze_drawing hanya meringkas hasil job analisa gambar yang sudah ada. Jangan menghitung RAB dari hasil gambar di tool ini.",
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

    const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const internalKey = process.env.INTERNAL_SERVICE_KEY;
      if (internalKey) headers.set("X-Internal-Key", internalKey);
      const user = (req as any).user;
      if (user?.uid) headers.set("X-User-Id", user.uid);
      const baseFetch = params.fetchImpl ?? fetch;
      return baseFetch(input, { ...init, headers });
    };

    const tools = createToolRegistry({
      coreEngineUrl: params.coreEngineUrl,
      documentIntelligenceUrl: params.documentIntelligenceUrl,
      fetchImpl: customFetch,
    });
    const result = await runToolCallingLoop({
      apiKey: params.geminiApiKey,
      systemPrompt,
      userMessage: parsed.data.message,
      tools,
      context: parsed.data.context,
      maxTurns: params.maxTurns,
      fetchImpl: customFetch,
    });

    return res.json({
      provider: GEMINI_MODEL,
      fallback: false,
      answer: result.answer,
      tool_calls: result.toolCalls,
    });
  };
}
