import { NextRequest, NextResponse } from "next/server";
import { readStagedAttachment } from "../attachment-storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const attachment = await readStagedAttachment(id);
  if (!attachment) return NextResponse.json({ error: "Attachment tidak ditemukan." }, { status: 404 });
  return new Response(new Uint8Array(attachment.bytes), {
      headers: {
        "Content-Type": attachment.metadata.media_type || "application/octet-stream",
        "Content-Length": String(attachment.bytes.byteLength),
        "Content-Disposition": `inline; filename="${(attachment.metadata.name || "attachment").replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
}
