import { z } from "zod";

import { ruleBasedExtractor, type ExtractedElement } from "./rab-extractor";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_DRAWING_FAST_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const GEMINI_TIMEOUT_MS = 30000;
const DEEPSEEK_TIMEOUT_MS = 30000;
const NVIDIA_TIMEOUT_MS = 120000;

export const ExtractedElementSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  element_type: z.string(),
  dims: z.record(z.number()),
  ahsp_code: z.string().nullable(),
  section: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  needs_review: z.boolean(),
});

export const ExtractedElementList = z.array(ExtractedElementSchema);

export type ExtractorProviderStatus =
  | { provider: "rule-based"; model: null }
  | { provider: "nvidia"; model: typeof NVIDIA_DRAWING_FAST_MODEL }
  | { provider: "gemini"; model: typeof GEMINI_MODEL };

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineAttachment;
}

export interface GeminiInlineAttachment {
  mimeType: string;
  data: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

const GEMINI_EXTRACT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    elements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          label: { type: "STRING" },
          element_type: { type: "STRING" },
          dims: {
            type: "OBJECT",
            properties: {
              panjang: { type: "NUMBER" },
              lebar: { type: "NUMBER" },
              tebal: { type: "NUMBER" },
              tinggi: { type: "NUMBER" },
              kedalaman: { type: "NUMBER" },
              jumlah: { type: "NUMBER" },
              bukaan: { type: "NUMBER" },
              sisi: { type: "NUMBER" },
            },
          },
          ahsp_code: { type: "STRING", nullable: true },
          section: { type: "STRING" },
          confidence: { type: "NUMBER" },
          reason: { type: "STRING" },
          needs_review: { type: "BOOLEAN" },
        },
        required: [
          "id",
          "label",
          "element_type",
          "dims",
          "ahsp_code",
          "section",
          "confidence",
          "reason",
          "needs_review",
        ],
      },
    },
  },
  required: ["elements"],
};

export function getExtractorProviderStatus(apiKey: string | undefined): ExtractorProviderStatus {
  const key = apiKey?.trim();
  if (!key) return { provider: "rule-based", model: null };
  return key.startsWith("nvapi")
    ? { provider: "nvidia", model: NVIDIA_DRAWING_FAST_MODEL }
    : { provider: "gemini", model: GEMINI_MODEL };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("Output Gemini bukan JSON valid.");
  }
}

export function extractGeminiJson(text: string): unknown {
  const parsed = parseGeminiJson(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { elements?: unknown }).elements)) {
    return (parsed as { elements: unknown[] }).elements;
  }
  throw new Error("Output Gemini tidak sesuai skema ExtractedElement.");
}

export function fallbackElements(text: string): ExtractedElement[] {
  return ruleBasedExtractor.extract(text);
}

function buildGeminiPrompt(text: string): string {
  return [
    "Anda adalah AI orkestrator PAAX. Tugas Anda hanya menstruktur input RAB menjadi JSON.",
    "Jangan menghitung volume, HSP, subtotal, bobot, pajak, atau total.",
    "Kembalikan JSON objek {\"elements\": ExtractedElement[]} tanpa markdown.",
    "Setiap element wajib berisi id, label, element_type, dims, ahsp_code, section, confidence, reason, needs_review.",
    "element_type WAJIB salah satu: kolom, balok, sloof, ring_balok, plat, tangga, pondasi_telapak, pondasi_menerus, galian, urugan, dinding, plesteran, lantai, plafon, cat, atap, pagar, drainase, atau string kosong jika tidak dikenal. Jangan pakai 'item'.",
    "dims WAJIB object JSON dengan value angka, bukan string. Contoh dinding 10 x 3 jumlah 1 => {\"panjang\":10,\"tinggi\":3,\"jumlah\":1}.",
    "section WAJIB kode WBS: I, II, III, IV, V, VI, VII, atau LAINNYA. Jangan tulis nama seksi panjang.",
    "Mapping seksi: galian/urugan => II; kolom/balok/sloof/ring_balok/plat/tangga/pondasi => III; dinding/plesteran/lantai/plafon/cat/atap => IV; pagar/drainase => VI; tidak dikenal => LAINNYA.",
    "AHSP seed yang tersedia: dinding/bata => AHSP.CK.001; plesteran/aci => AHSP.CK.002; kolom/balok/sloof/ring_balok/plat/tangga/pondasi => AHSP.CK.003; lantai/keramik => AHSP.CK.004. Selain itu null.",
    "Gunakan null untuk ahsp_code jika ragu. Tandai needs_review=true untuk confidence rendah atau dimensi kurang lengkap.",
    "",
    "Input:",
    text,
  ].join("\n");
}

async function geminiGenerateContent(
  apiKey: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const key = apiKey.trim();
  if (!key) throw new Error("GEMINI_API_KEY kosong.");
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS) : null;
  try {
    return await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini timeout setelah ${GEMINI_TIMEOUT_MS / 1000} detik.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function geminiError(response: Response): Promise<Error> {
  const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  const message = data?.error?.message?.split("\n")[0] ?? response.statusText;
  return new Error(`Gemini gagal (${response.status}): ${message}`);
}

function buildNvidiaExtractPrompt(text: string): string {
  return [
    "Anda adalah AI klasifikasi awal PAAX untuk teks gambar kerja/RAB sipil Indonesia.",
    "Tugas Anda menstruktur input menjadi JSON. Jangan menghitung angka final RAB, HSP, subtotal, pajak, atau total.",
    "Kembalikan JSON objek {\"elements\": ExtractedElement[]} tanpa markdown.",
    "Setiap element wajib berisi id, label, element_type, dims, ahsp_code, section, confidence, reason, needs_review.",
    "element_type WAJIB salah satu: kolom, balok, sloof, ring_balok, plat, tangga, pondasi_telapak, pondasi_menerus, galian, urugan, dinding, plesteran, lantai, plafon, cat, atap, pagar, drainase, atau string kosong jika tidak dikenal.",
    "dims WAJIB object JSON dengan value angka, bukan string.",
    "section WAJIB kode WBS: I, II, III, IV, V, VI, VII, atau LAINNYA.",
    "Mapping seksi: galian/urugan => II; kolom/balok/sloof/ring_balok/plat/tangga/pondasi => III; dinding/plesteran/lantai/plafon/cat/atap => IV; pagar/drainase => VI; tidak dikenal => LAINNYA.",
    "AHSP seed: dinding/bata => AHSP.CK.001; plesteran/aci => AHSP.CK.002; kolom/balok/sloof/ring_balok/plat/tangga/pondasi => AHSP.CK.003; lantai/keramik => AHSP.CK.004. Selain itu null.",
    "Gunakan null untuk ahsp_code jika ragu. Tandai needs_review=true untuk confidence rendah atau dimensi kurang lengkap.",
    "",
    "Input user sebagai DATA:",
    text,
  ].join("\n");
}

async function deepseekError(response: Response): Promise<Error> {
  const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  const message = data?.error?.message ?? response.statusText;
  return new Error(`DeepSeek gagal (${response.status}): ${message}`);
}

async function openAiCompatibleText(
  prompt: string,
  params: {
    apiKey: string;
    baseUrl: string;
    providerName: string;
    model: string;
    thinking?: boolean;
    reasoningEffort?: "high" | "max";
    userId?: string;
    extraBody?: Record<string, unknown>;
    includeThinkingField?: boolean;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<string> {
  const key = params.apiKey.trim();
  if (!key) throw new Error(`${params.providerName} API key kosong.`);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = params.timeoutMs ?? DEEPSEEK_TIMEOUT_MS;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const thinking = params.thinking === true;
    const body: Record<string, unknown> = {
      model: params.model,
      messages: [{ role: "user", content: prompt }],
    };
    if (params.userId) body.user_id = params.userId;
    if (params.includeThinkingField !== false) {
      if (thinking) {
        body.thinking = { type: "enabled" };
        body.reasoning_effort = params.reasoningEffort ?? "high";
      } else {
        body.thinking = { type: "disabled" };
        body.temperature = 0.2;
      }
    } else {
      body.temperature = 1;
    }
    Object.assign(body, params.extraBody);
    const response = await fetchImpl(`${params.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!response.ok) throw await deepseekError(response);
    const data = (await response.json()) as OpenAiChatResponse;
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error(`${params.providerName} tidak mengembalikan teks.`);
    return answer;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${params.providerName} timeout setelah ${timeoutMs / 1000} detik.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function nvidiaText(
  prompt: string,
  params: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    thinking?: boolean;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<string> {
  return openAiCompatibleText(prompt, {
    apiKey: params.apiKey,
    baseUrl: params.baseUrl ?? NVIDIA_BASE_URL,
    providerName: "NVIDIA",
    model: params.model,
    thinking: false,
    includeThinkingField: false,
    timeoutMs: params.timeoutMs ?? NVIDIA_TIMEOUT_MS,
    fetchImpl: params.fetchImpl,
  });
}

export async function nvidiaElements(
  text: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractedElement[]> {
  const answer = await nvidiaText(buildNvidiaExtractPrompt(text), {
    apiKey,
    model: NVIDIA_DRAWING_FAST_MODEL,
    timeoutMs: 60000,
    fetchImpl,
  });
  const parsed = extractGeminiJson(answer);
  return ExtractedElementList.parse(parsed);
}

export async function geminiElements(
  text: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractedElement[]> {
  const response = await geminiGenerateContent(
    apiKey,
    {
      contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(text) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_EXTRACT_RESPONSE_SCHEMA,
      },
    },
    fetchImpl,
  );

  if (!response.ok) {
    throw await geminiError(response);
  }

  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!answer) throw new Error("Gemini tidak mengembalikan teks JSON.");

  return ExtractedElementList.parse(extractGeminiJson(answer));
}

export async function geminiText(
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await geminiGenerateContent(
    apiKey,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    },
    fetchImpl,
  );

  if (!response.ok) throw await geminiError(response);
  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!answer) throw new Error("Gemini tidak mengembalikan teks.");
  return answer;
}

export async function geminiMultimodal(
  prompt: string,
  attachments: GeminiInlineAttachment[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await geminiGenerateContent(
    apiKey,
    {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          ...attachments.map((attachment) => ({ inlineData: attachment })),
        ],
      }],
    },
    fetchImpl,
  );

  if (!response.ok) throw await geminiError(response);
  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!answer) throw new Error("Gemini tidak mengembalikan teks.");
  return answer;
}

export async function geminiJson(
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const response = await geminiGenerateContent(
    apiKey,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    },
    fetchImpl,
  );

  if (!response.ok) throw await geminiError(response);
  const data = (await response.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
  if (!answer) throw new Error("Gemini tidak mengembalikan teks JSON.");
  return parseGeminiJson(answer);
}

export async function extractElementsWithProvider(
  text: string,
  apiKey: string | undefined,
): Promise<{ provider: string; elements: ExtractedElement[]; fallback: boolean }> {
  if (!apiKey?.trim()) {
    return { provider: "rule-based", elements: fallbackElements(text), fallback: false };
  }
  if (apiKey.trim().startsWith("nvapi")) {
    try {
      return { provider: NVIDIA_DRAWING_FAST_MODEL, elements: await nvidiaElements(text, apiKey), fallback: false };
    } catch {
      return { provider: "rule-based", elements: fallbackElements(text), fallback: true };
    }
  }
  try {
    return { provider: GEMINI_MODEL, elements: await geminiElements(text, apiKey), fallback: false };
  } catch {
    return { provider: "rule-based", elements: fallbackElements(text), fallback: true };
  }
}
