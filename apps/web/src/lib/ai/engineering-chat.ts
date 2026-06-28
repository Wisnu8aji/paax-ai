export interface EngineeringChatEngineHealth {
  status: string;
  version: string;
  ahsp_items: number;
  regions: string[];
}

export interface EngineeringChatEngineStatus {
  online: boolean;
  url: string;
  health?: EngineeringChatEngineHealth;
  error?: string;
}

export interface EngineeringChatPromptInput {
  message: string;
  engine: EngineeringChatEngineStatus;
  projectId?: string;
  aiError?: string;
}

export interface EngineeringChatApiResponse {
  provider: string;
  fallback: boolean;
  engine: EngineeringChatEngineStatus;
  answer: string;
}

function engineSummary(engine: EngineeringChatEngineStatus): string {
  if (!engine.online || !engine.health) {
    return `Core Engine offline di ${engine.url}${engine.error ? ` (${engine.error})` : ""}.`;
  }
  return [
    `Core Engine online di ${engine.url}.`,
    `Health status: ${engine.health.status}.`,
    `Version: ${engine.health.version}.`,
    `AHSP items: ${engine.health.ahsp_items}.`,
    `Regions: ${engine.health.regions.join(", ")}.`,
  ].join(" ");
}

function isEngineeringQuestion(message: string): boolean {
  return /\b(rab|boq|ahsp|hsp|volume|jadwal|schedule|kurva\s*s|cpm|gantt|biaya|harga|proyek|struktur|beton|dinding|pondasi|kolom|balok)\b/i
    .test(message);
}

export function buildEngineeringChatPrompt(input: EngineeringChatPromptInput): string {
  return [
    "Anda adalah Engineering Chat PAAX, asisten AI percakapan umum di workspace insinyur sipil Indonesia.",
    "Untuk pertanyaan umum atau sapaan singkat, jawab seperti AI assistant biasa: natural, ramah, dan jangan membawa topik RAB, konstruksi, proyek, atau engine bila user tidak memintanya.",
    "Untuk pertanyaan engineering/konstruksi/RAB/schedule, bantu user memahami alur dan data yang dibutuhkan.",
    "Aturan wajib untuk topik engineering: jangan menghitung angka final RAB, HSP, volume, jadwal, Kurva S, float, atau skenario biaya-waktu.",
    "Jika user meminta angka final engineering, arahkan agar angka dihitung oleh Core Engine dan jelaskan input yang dibutuhkan.",
    "Sebutkan status Core Engine hanya bila relevan dengan pertanyaan user atau saat user bertanya tentang engine/perhitungan.",
    "Jawab singkat, teknis, dan dalam Bahasa Indonesia.",
    "",
    `Project ID: ${input.projectId ?? "tidak diketahui"}`,
    `Status engine: ${engineSummary(input.engine)}`,
    "",
    "Pertanyaan user:",
    input.message,
  ].join("\n");
}

export function fallbackEngineeringAnswer(input: EngineeringChatPromptInput): string {
  const aiError = input.aiError ? ` (${input.aiError})` : "";
  if (!isEngineeringQuestion(input.message)) {
    return [
      `Gemini API belum memberi jawaban saat ini${aiError}.`,
      "Untuk obrolan umum, coba kirim lagi sebentar setelah limit Gemini pulih.",
      `Pesan Anda sudah diterima: "${input.message}"`,
    ].join(" ");
  }

  if (input.engine.online && input.engine.health) {
    return [
      `Gemini API belum memberi jawaban saat ini${aiError}.`,
      `Core Engine tetap aktif di ${input.engine.url} dengan ${input.engine.health.ahsp_items} item AHSP untuk wilayah ${input.engine.health.regions.join(", ")}.`,
      "Untuk topik engineering, saya bisa membantu menyiapkan input dan menjelaskan alur; angka final tetap dihitung engine.",
    ].join(" ");
  }

  return [
    `Gemini API belum memberi jawaban saat ini${aiError}.`,
    `Core Engine belum aktif di ${input.engine.url}.`,
    "Jalankan engine dengan `pnpm run dev:core` atau `python -m uvicorn app.main:app --reload --port 8081` dari folder `services/core-engine`.",
  ].join(" ");
}

export async function readEngineeringChatResponse(response: Response): Promise<EngineeringChatApiResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const text = (await response.text()).trim();
    const suffix = text ? `: ${text}` : "";
    throw new Error(`Engineering Chat gagal (${response.status})${suffix}`);
  }

  const data = await response.json().catch(() => null) as Partial<EngineeringChatApiResponse> & { error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Engineering Chat gagal (${response.status})`);
  }
  if (!data || typeof data.answer !== "string" || typeof data.provider !== "string" || typeof data.engine !== "object") {
    throw new Error("Response Engineering Chat bukan JSON valid.");
  }

  return {
    provider: data.provider,
    fallback: Boolean(data.fallback),
    engine: data.engine,
    answer: data.answer,
  };
}
