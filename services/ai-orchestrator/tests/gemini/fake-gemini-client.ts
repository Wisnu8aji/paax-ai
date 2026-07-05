import type { GeminiGenerateContentResponse } from "../../src/gemini/types";

export function jsonResponse(body: GeminiGenerateContentResponse, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

export function textPart(text: string): GeminiGenerateContentResponse {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

export function functionCallPart(name: string, args: Record<string, unknown>): GeminiGenerateContentResponse {
  return { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] };
}

export function sequenceFetch(responses: GeminiGenerateContentResponse[]): typeof fetch {
  let index = 0;
  return (async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return jsonResponse(response);
  }) as typeof fetch;
}
