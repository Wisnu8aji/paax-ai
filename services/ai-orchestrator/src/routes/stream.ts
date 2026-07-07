import type { Request, Response } from "express";
import { z } from "zod";

import { GEMINI_MODEL } from "../config";
import { runToolCallingLoop } from "../gemini/tool-loop";
import { createToolRegistry } from "../tools/registry";
import type { ChatContext } from "../tools/types";
import { systemPrompt } from "./chat";

const ChatBodySchema = z.object({
  message: z.string().min(1),
  project_id: z.string().optional(),
  context: z.custom<ChatContext>().optional(),
});

export function createStreamHandler(params: {
  geminiApiKey: string;
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  fetchImpl?: typeof fetch;
  maxTurns?: number;
}) {
  return async function streamHandler(req: Request, res: Response) {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "message wajib diisi" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!params.geminiApiKey.trim()) {
      res.write(`data: ${JSON.stringify({ type: "token", content: "GEMINI_API_KEY belum disetel di ai-orchestrator." })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", tool_calls: [] })}\n\n`);
      return res.end();
    }

    const tools = createToolRegistry({
      coreEngineUrl: params.coreEngineUrl,
      documentIntelligenceUrl: params.documentIntelligenceUrl,
      fetchImpl: params.fetchImpl,
    });
    
    try {
      const result = await runToolCallingLoop({
        apiKey: params.geminiApiKey,
        systemPrompt,
        userMessage: parsed.data.message,
        tools,
        context: parsed.data.context,
        maxTurns: params.maxTurns,
        fetchImpl: params.fetchImpl,
        onEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      res.write(`data: ${JSON.stringify({ type: "done", tool_calls: result.toolCalls })}\n\n`);
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: "token", content: `\n[Error: ${err.message}]` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", tool_calls: [] })}\n\n`);
    }

    res.end();
  };
}
