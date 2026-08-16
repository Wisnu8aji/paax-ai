import { NextRequest, NextResponse } from "next/server";
import { readChatArtifact } from "../artifact-storage";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const artifact = await readChatArtifact(id);
  if (!artifact || artifact.metadata.status !== "ready") return NextResponse.json({ error: "Artifact tidak ditemukan." }, { status: 404 });
  return new Response(new Uint8Array(artifact.bytes), {
    headers: {
      "Content-Type": artifact.metadata.media_type,
      "Content-Length": String(artifact.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${artifact.metadata.name}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
