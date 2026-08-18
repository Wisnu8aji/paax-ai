export const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const CHAT_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
] as const;

export type ChatAttachmentMimeType = (typeof CHAT_ATTACHMENT_MIME_TYPES)[number];

export interface ChatAttachmentRef {
  attachment_id: string;
  conversation_id?: string;
  name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  status: "staged" | "processing" | "ready" | "failed";
  error?: string;
}

export function validateAttachmentMeta(input: { name: string; mimeType: string; sizeBytes: number }): { ok: true; mediaType: ChatAttachmentMimeType } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama file kosong." };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) return { ok: false, error: "Ukuran file tidak valid." };
  if (input.sizeBytes > MAX_CHAT_ATTACHMENT_BYTES) return { ok: false, error: `File terlalu besar (maksimal ${MAX_CHAT_ATTACHMENT_BYTES / 1024 / 1024} MB).` };
  if (!(CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(input.mimeType)) return { ok: false, error: "Format belum didukung di Chat. Gunakan PNG/JPEG/WebP, PDF, DOCX, XLSX, PPTX, atau CSV." };
  return { ok: true, mediaType: input.mimeType as ChatAttachmentMimeType };
}
