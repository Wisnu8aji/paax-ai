import { GEMINI_MODEL } from "../config";
import type { GeminiGenerateContentRequest, GeminiGenerateContentResponse } from "./types";

export async function geminiGenerateContent(params: {
  apiKey: string;
  body: GeminiGenerateContentRequest;
  fetchImpl?: typeof fetch;
}): Promise<GeminiGenerateContentResponse> {
  const key = params.apiKey.trim();
  if (!key) throw new Error("GEMINI_API_KEY kosong.");
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(params.body),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`Gemini gagal (${response.status}): ${error?.error?.message ?? response.statusText}`);
  }
  return response.json() as Promise<GeminiGenerateContentResponse>;
}

export async function geminiStreamGenerateContent(params: {
  apiKey: string;
  body: GeminiGenerateContentRequest;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const key = params.apiKey.trim();
  if (!key) throw new Error("GEMINI_API_KEY kosong.");
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(params.body),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`Gemini gagal (${response.status}): ${error?.error?.message ?? response.statusText}`);
  }
  return response;
}
