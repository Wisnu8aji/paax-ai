import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { validateAttachmentMeta } from "@/lib/chat/attachment-contract";

export const runtime = "nodejs";

function storageRoot(): string {
  return path.resolve(process.env.PAAX_DATA_ROOT?.trim() || path.join(process.cwd(), ".paax-data"), "uploads", "command-room");
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
  const meta = validateAttachmentMeta({ name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size });
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const attachmentId = crypto.randomUUID();
  const conversationId = typeof form?.get("conversationId") === "string" ? String(form?.get("conversationId")) : undefined;
  const digest = createHash("sha256").update(bytes).digest("hex");
  const folder = path.join(storageRoot(), attachmentId);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "payload"), bytes, { flag: "wx" });
  const reference = {
    attachment_id: attachmentId,
    conversation_id: conversationId,
    name: file.name,
    media_type: meta.mediaType,
    size_bytes: bytes.byteLength,
    sha256: digest,
    status: "staged" as const,
  };
  await writeFile(path.join(folder, "metadata.json"), JSON.stringify(reference), { flag: "wx" });
  return NextResponse.json({ attachment: reference });
}
