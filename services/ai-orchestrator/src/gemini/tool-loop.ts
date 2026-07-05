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
    if (part?.text) return { answer: part.text, toolCalls, hitMaxTurns: false };

    const functionCall = part?.functionCall;
    if (!functionCall) return { answer: "Gemini tidak mengembalikan jawaban teks.", toolCalls, hitMaxTurns: false };
    if (turn >= maxTurns) return { answer: MAX_TURNS_FALLBACK, toolCalls, hitMaxTurns: true };

    const args = functionCall.args ?? {};
    const toolResult = await executeToolCall(functionCall, params.tools, params.context);
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
