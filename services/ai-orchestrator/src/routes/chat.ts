import type { Request, Response } from "express";
import { z } from "zod";

import { GEMINI_MODEL } from "../config";
import { runToolCallingLoop } from "../gemini/tool-loop";
import { createToolRegistry } from "../tools/registry";
import type { ChatContext } from "../tools/types";

export const systemPrompt = [
  "Anda adalah Engineering Chat PAAX, asisten AI di workspace insinyur sipil Indonesia.",
  "Anda punya akses ke tool: lookup_ahsp (cari kode AHSP), run_scenario (jalankan simulasi skenario waktu-biaya via engine deterministik).",
  "WAJIB gunakan tool ini kalau pertanyaan user butuh data itu -- JANGAN mengarang kode AHSP atau angka simulasi sendiri.",
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

    const tools = createToolRegistry({ coreEngineUrl: params.coreEngineUrl, fetchImpl: params.fetchImpl });
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
