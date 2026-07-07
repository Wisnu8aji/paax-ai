import { geminiGenerateContent } from "./client";
import type { GeminiContent, GeminiFunctionCall, GeminiGenerateContentRequest } from "./types";
import type { ChatContext, ToolDefinition } from "../tools/types";
import { summarizeResult } from "../tools/types";

export const MAX_TOOL_TURNS = 3;
export const MAX_TURNS_FALLBACK = "Maaf, saya butuh terlalu banyak langkah untuk pertanyaan ini. Coba perjelas pertanyaan Anda.";

export interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ToolLoopResult {
  answer: string;
  toolCalls: ToolCallLog[];
  hitMaxTurns: boolean;
}

function firstPart(response: Awaited<ReturnType<typeof geminiGenerateContent>>) {
  return response.candidates?.[0]?.content?.parts?.[0];
}

async function executeToolCall(
  call: GeminiFunctionCall,
  tools: ToolDefinition[],
  context: ChatContext | undefined,
): Promise<{ response: Record<string, unknown>; summary: string }> {
  const tool = tools.find((item) => item.declaration.name === call.name);
  if (!tool) {
    const error = `tool tidak dikenal: ${call.name}`;
    return { response: { error }, summary: `error: ${error}` };
  }
  try {
    const result = await tool.execute(call.args ?? {}, { context });
    return { response: result, summary: tool.summarize?.(result) ?? summarizeResult(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool gagal";
    return { response: { error: message }, summary: `error: ${message}` };
  }
}

export async function runToolCallingLoop(params: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  context?: ChatContext;
  maxTurns?: number;
  fetchImpl?: typeof fetch;
  onEvent?: (event: any) => void;
}): Promise<ToolLoopResult> {
  const maxTurns = params.maxTurns ?? Number(process.env.AI_ORCH_MAX_TOOL_TURNS || MAX_TOOL_TURNS);
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: params.userMessage }] }];
  const toolCalls: ToolCallLog[] = [];
  const declarations = params.tools.map((tool) => tool.declaration);

  for (let turn = 0; turn <= maxTurns; turn += 1) {
    const body: GeminiGenerateContentRequest = {
      contents,
      systemInstruction: { parts: [{ text: params.systemPrompt }] },
      tools: [{ functionDeclarations: declarations }],
      generationConfig: { temperature: 0.2 },
    };
    const response = await geminiGenerateContent({ apiKey: params.apiKey, body, fetchImpl: params.fetchImpl });
    const part = firstPart(response);
    
    const { logUsage } = require("../usage");
    const tenantId = params.context?.project_id || "default-tenant";
    const usageMetadata = (response as any).usageMetadata || {};
    
    // Fire and forget usage logging
    logUsage(
      tenantId,
      "tool_calling_turn",
      true,
      usageMetadata.promptTokenCount,
      usageMetadata.candidatesTokenCount,
      undefined,
      false
    ).catch(() => {});

    if (part?.text) {
      if (params.onEvent) {
        // pseudo-stream the text
        const chunks = part.text.match(/.{1,20}/g) || [part.text];
        for (const chunk of chunks) {
          params.onEvent({ type: "token", content: chunk });
        }
      }
      return { answer: part.text, toolCalls, hitMaxTurns: false };
    }

    const functionCall = part?.functionCall;
    if (!functionCall) return { answer: "Gemini tidak mengembalikan jawaban teks.", toolCalls, hitMaxTurns: false };
    if (turn >= maxTurns) return { answer: MAX_TURNS_FALLBACK, toolCalls, hitMaxTurns: true };

    const args = functionCall.args ?? {};
    if (params.onEvent) {
      params.onEvent({ type: "tool_call", tool: functionCall.name, input: args });
    }
    const startTime = Date.now();
    const toolResult = await executeToolCall(functionCall, params.tools, params.context);
    const latencyMs = Date.now() - startTime;
    
    // Asynchronously log to audit DB
    const dbUrl = process.env.DB_API_URL;
    if (dbUrl) {
      const fetchApi = params.fetchImpl ?? fetch;
      fetchApi(`${dbUrl}/audit/tool-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          conversation_id: params.context?.conversation_id || "unknown",
          project_id: params.context?.project_id,
          tool_name: functionCall.name,
          input_json: args,
          output_json: toolResult.response,
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          latency_ms: latencyMs,
        }),
      }).catch(err => console.warn("Failed to log tool call audit:", err));
    }

    toolCalls.push({ tool: functionCall.name, args, resultSummary: toolResult.summary });
    contents.push({ role: "model", parts: [{ functionCall }] });
    contents.push({
      role: "function",
      parts: [{
        functionResponse: {
          name: functionCall.name,
          response: toolResult.response,
        },
      }],
    });
  }

  return { answer: MAX_TURNS_FALLBACK, toolCalls, hitMaxTurns: true };
}
