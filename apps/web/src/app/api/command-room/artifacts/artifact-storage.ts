import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredArtifactMetadata = {
  artifact_id: string;
  conversation_id: string;
  turn_id: string;
  name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  status: "ready" | "failed";
  download_url: string;
  error?: string;
};

function storageRoot(): string {
  return path.resolve(process.env.PAAX_DATA_ROOT?.trim() || path.join(process.cwd(), ".paax-data"), "artifacts", "command-room");
}

export function safeArtifactId(value: string): boolean {
  return /^[0-9a-f-]{16,80}$/i.test(value);
}

function safeName(value: string): string {
  return value.replace(/["\\\r\n]/g, "_").replace(/[\\/]/g, "_").slice(0, 240) || "artifact.bin";
}

export async function writeChatArtifact(input: {
  conversationId: string;
  turnId: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}): Promise<StoredArtifactMetadata> {
  const artifactId = crypto.randomUUID();
  const folder = path.join(storageRoot(), artifactId);
  await mkdir(folder, { recursive: true });
  const payload = Buffer.from(input.bytes);
  await writeFile(path.join(folder, "payload"), payload, { flag: "wx" });
  const metadata: StoredArtifactMetadata = {
    artifact_id: artifactId,
    conversation_id: input.conversationId,
    turn_id: input.turnId,
    name: safeName(input.name),
    media_type: input.mediaType || "application/octet-stream",
    size_bytes: payload.byteLength,
    sha256: createHash("sha256").update(payload).digest("hex"),
    status: "ready",
    download_url: `/api/command-room/artifacts/${artifactId}`,
  };
  await writeFile(path.join(folder, "metadata.json"), JSON.stringify(metadata), { flag: "wx" });
  return metadata;
}

export async function readChatArtifact(artifactId: string): Promise<{ metadata: StoredArtifactMetadata; bytes: Buffer } | null> {
  if (!safeArtifactId(artifactId)) return null;
  try {
    const metadata = JSON.parse(await readFile(path.join(storageRoot(), artifactId, "metadata.json"), "utf8")) as StoredArtifactMetadata;
    const bytes = await readFile(path.join(storageRoot(), artifactId, "payload"));
    return { metadata, bytes };
  } catch {
    return null;
  }
}
