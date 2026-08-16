import { readFile } from "node:fs/promises";
import path from "node:path";

export type StagedAttachmentMetadata = {
  attachment_id: string;
  conversation_id?: string;
  name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  status: "staged" | "processing" | "ready" | "failed";
  error?: string;
};

function storageRoot(): string {
  return path.resolve(process.env.PAAX_DATA_ROOT?.trim() || path.join(process.cwd(), ".paax-data"), "uploads", "command-room");
}

export function safeAttachmentId(value: string): boolean {
  return /^[0-9a-f-]{16,80}$/i.test(value);
}

export async function readStagedAttachment(attachmentId: string): Promise<{ metadata: StagedAttachmentMetadata; bytes: Buffer } | null> {
  if (!safeAttachmentId(attachmentId)) return null;
  try {
    const metadata = JSON.parse(await readFile(path.join(storageRoot(), attachmentId, "metadata.json"), "utf8")) as StagedAttachmentMetadata;
    const bytes = await readFile(path.join(storageRoot(), attachmentId, "payload"));
    return { metadata, bytes };
  } catch {
    return null;
  }
}
