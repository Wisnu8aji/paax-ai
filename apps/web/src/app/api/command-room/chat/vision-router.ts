import * as XLSX from "xlsx";
import { readStagedAttachment, type StagedAttachmentMetadata } from "../attachments/attachment-storage";

const MAX_EXTRACTED_TEXT_CHARS = 16_000;
const MAX_VISION_RESPONSE_CHARS = 8_000;
const VISION_TIMEOUT_MS = 120_000;

export type ChatAttachmentInput = Pick<StagedAttachmentMetadata, "attachment_id" | "name" | "media_type" | "size_bytes" | "status">;

export interface AttachmentObservation {
  attachment_id: string;
  name: string;
  media_type: string;
  kind: "vision" | "text";
  content: string;
  provider?: string;
  model?: string;
  confidence?: "high" | "medium" | "low";
}

export interface AttachmentFailure {
  attachment_id: string;
  name: string;
  media_type: string;
  error: string;
}

export interface AttachmentSource {
  source_id: string;
  title: string;
  uri: string;
  snippet?: string;
  provenance: string;
  locator?: string;
}

export interface ChatAttachmentProcessingResult {
  observations: AttachmentObservation[];
  failures: AttachmentFailure[];
  sources: AttachmentSource[];
}

type VisionCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

function trimBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isOpenRouterKey(value: string): boolean {
  return value.trim().startsWith("sk-or-v1-");
}

function getVisionCredentials(): VisionCredentials | null {
  const apiKeyCandidate: string | undefined = (
    process.env.COMMAND_ROOM_VISION_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.DRAWING_INTELLIGENCE_API_KEY?.trim() ||
    (isOpenRouterKey(process.env.DEEPSEEK_API_KEY ?? "") ? process.env.DEEPSEEK_API_KEY?.trim() : "")
  );
  const apiKey = apiKeyCandidate?.trim() ?? "";
  if (!apiKey) return null;

  const configuredBase = trimBaseUrl(process.env.COMMAND_ROOM_VISION_BASE_URL ?? "");
  const drawingBase = trimBaseUrl(process.env.DRAWING_INTELLIGENCE_BASE_URL ?? "");
  const baseUrl = configuredBase || drawingBase || (isOpenRouterKey(apiKey) ? "https://openrouter.ai/api/v1" : "");
  if (!baseUrl) return null;

  const model = (
    process.env.COMMAND_ROOM_VISION_MODEL?.trim() ||
    process.env.DRAWING_INTELLIGENCE_QWEN_MODEL?.trim() ||
    "mimo-v2.5"
  );
  return {
    apiKey,
    baseUrl,
    model,
    provider: baseUrl.includes("openrouter") ? "openrouter" : "drawing-intelligence",
  };
}

function attachmentUri(attachmentId: string): string {
  return `/api/command-room/attachments/${encodeURIComponent(attachmentId)}`;
}

function sourceFor(attachment: ChatAttachmentInput, provenance: string, snippet?: string): AttachmentSource {
  return {
    source_id: `attachment-${attachment.attachment_id}`,
    title: attachment.name,
    uri: attachmentUri(attachment.attachment_id),
    snippet,
    provenance,
    locator: "attachment",
  };
}

function failureFor(attachment: ChatAttachmentInput, error: string): AttachmentFailure {
  return { attachment_id: attachment.attachment_id, name: attachment.name, media_type: attachment.media_type, error };
}

function capText(value: string, max = MAX_EXTRACTED_TEXT_CHARS): string {
  const normalized = value.replace(/\u0000/g, "").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}\n[isi lampiran dipotong]`;
}

async function extractTabularText(attachment: ChatAttachmentInput, bytes: Buffer): Promise<AttachmentObservation | AttachmentFailure> {
  if (attachment.media_type === "text/csv") {
    return {
      attachment_id: attachment.attachment_id,
      name: attachment.name,
      media_type: attachment.media_type,
      kind: "text",
      content: capText(bytes.toString("utf8")),
      confidence: "high",
    };
  }

  if (attachment.media_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    try {
      const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true, dense: true });
      const sections = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return `## Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
      });
      return {
        attachment_id: attachment.attachment_id,
        name: attachment.name,
        media_type: attachment.media_type,
        kind: "text",
        content: capText(sections.join("\n\n")),
        confidence: "high",
      };
    } catch (error) {
      return failureFor(attachment, `XLSX tidak dapat dibaca: ${error instanceof Error ? error.message : "format tidak valid"}`);
    }
  }

  return failureFor(attachment, `Parser ${attachment.media_type} belum aktif di Chat. File tetap tersimpan sebagai lampiran, tetapi isi tidak dikirim ke model.`);
}

function responseText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const choice = (body as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    }).join(" ");
  }
  return "";
}

async function analyzeImage(attachment: ChatAttachmentInput, bytes: Buffer, credentials: VisionCredentials, signal?: AbortSignal): Promise<AttachmentObservation | AttachmentFailure> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const dataUri = `data:${attachment.media_type};base64,${bytes.toString("base64")}`;
    const response = await fetch(`${credentials.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "curl/8.5.0",
      },
      body: JSON.stringify({
        model: credentials.model,
        stream: false,
        temperature: 0.1,
        max_tokens: 2_048,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Baca gambar ini sebagai auxiliary vision untuk percakapan PAAX. Jelaskan hanya hal yang terlihat: teks, label, ukuran yang terbaca, tabel, bentuk, dan ketidakpastian. Jangan menghitung RAB/HSP/bobot/durasi dan jangan mengarang fakta yang tidak terlihat. Beri ringkasan singkat dalam Bahasa Indonesia dan tandai bagian yang tidak terbaca.",
            },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return failureFor(attachment, `Vision provider gagal (HTTP ${response.status}). Isi gambar tidak dipakai.`);
    }
    const body = await response.json();
    const content = capText(responseText(body), MAX_VISION_RESPONSE_CHARS);
    if (!content) return failureFor(attachment, "Vision provider mengembalikan respons kosong. Isi gambar tidak dipakai.");
    return {
      attachment_id: attachment.attachment_id,
      name: attachment.name,
      media_type: attachment.media_type,
      kind: "vision",
      content,
      provider: credentials.provider,
      model: credentials.model,
      confidence: "medium",
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Vision timeout atau dibatalkan." : error instanceof Error ? error.message : "Vision provider tidak dapat dihubungi.";
    return failureFor(attachment, `${message} Isi gambar tidak dipakai.`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function analyzeChatAttachments(input: { attachments: ChatAttachmentInput[]; signal?: AbortSignal }): Promise<ChatAttachmentProcessingResult> {
  const result: ChatAttachmentProcessingResult = { observations: [], failures: [], sources: [] };
  if (!input.attachments.length) return result;
  const credentials = getVisionCredentials();

  for (const attachment of input.attachments) {
    const staged = await readStagedAttachment(attachment.attachment_id);
    if (!staged) {
      result.failures.push(failureFor(attachment, "Lampiran tidak ditemukan di storage server. Isi tidak dipakai."));
      continue;
    }
    if (staged.metadata.status === "failed") {
      result.failures.push(failureFor(attachment, staged.metadata.error || "Lampiran berstatus gagal."));
      continue;
    }

    const observation = attachment.media_type.startsWith("image/")
      ? credentials
        ? await analyzeImage(attachment, staged.bytes, credentials, input.signal)
        : failureFor(attachment, "Provider vision belum dikonfigurasi. Lampiran tetap tersedia; gunakan jalur teks/manual.")
      : await extractTabularText(attachment, staged.bytes);

    if ("error" in observation) {
      result.failures.push(observation);
      continue;
    }
    result.observations.push(observation);
    result.sources.push(sourceFor(
      attachment,
      observation.kind === "vision" ? `vision:${observation.provider ?? "auxiliary"}` : "attachment_parser",
      observation.content.slice(0, 360),
    ));
  }
  return result;
}

export function attachmentProcessingContext(result: ChatAttachmentProcessingResult): string {
  const sections: string[] = [];
  for (const observation of result.observations) {
    sections.push(`[LAMPIRAN TERBACA — ${observation.name} | ${observation.kind} | confidence ${observation.confidence ?? "low"}]\n${observation.content}`);
  }
  for (const failure of result.failures) {
    sections.push(`[LAMPIRAN TIDAK TERBACA — ${failure.name}]\n${failure.error}\nJangan menyimpulkan isi file ini.`);
  }
  return sections.join("\n\n");
}
