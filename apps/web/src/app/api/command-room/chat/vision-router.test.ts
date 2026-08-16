import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeChatAttachments, attachmentProcessingContext } from "./vision-router";

const tempRoots: string[] = [];

async function stage(root: string, id: string, name: string, mediaType: string, bytes: Buffer) {
  const folder = path.join(root, "uploads", "command-room", id);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "payload"), bytes);
  await writeFile(path.join(folder, "metadata.json"), JSON.stringify({
    attachment_id: id, name, media_type: mediaType, size_bytes: bytes.byteLength, sha256: "test", status: "staged",
  }));
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of tempRoots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env.PAAX_DATA_ROOT;
  delete process.env.COMMAND_ROOM_VISION_API_KEY;
  delete process.env.COMMAND_ROOM_VISION_BASE_URL;
  delete process.env.COMMAND_ROOM_VISION_MODEL;
  delete process.env.DRAWING_INTELLIGENCE_API_KEY;
  delete process.env.DRAWING_INTELLIGENCE_BASE_URL;
  delete process.env.DRAWING_INTELLIGENCE_QWEN_MODEL;
});
describe("Chat attachment processor", () => {
  it("sends staged image bytes to the configured auxiliary vision route and returns provenance", async () => {
    const root = path.join(process.cwd(), ".tmp-vision-test-image");
    tempRoots.push(root);
    process.env.PAAX_DATA_ROOT = root;
    process.env.COMMAND_ROOM_VISION_API_KEY = "test-key";
    process.env.COMMAND_ROOM_VISION_BASE_URL = "https://vision.test/v1";
    process.env.COMMAND_ROOM_VISION_MODEL = "mimo-v2.5";
    const id = "12345678-1234-1234-1234-123456789012";
    await stage(root, id, "sheet.png", "image/png", Buffer.from([137, 80, 78, 71]));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mimo-v2.5");
      expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Terlihat lembar gambar dengan label S-01; ukuran kecil tidak terbaca." } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeChatAttachments({ attachments: [{ attachment_id: id, name: "sheet.png", media_type: "image/png", size_bytes: 4, status: "staged" }] });
    expect(result.failures).toEqual([]);
    expect(result.observations[0]).toMatchObject({ attachment_id: id, kind: "vision", provider: "drawing-intelligence", model: "mimo-v2.5" });
    expect(result.sources[0]).toMatchObject({ source_id: `attachment-${id}`, provenance: "vision:drawing-intelligence" });
  });

  it("reads CSV without an AI call and reports missing vision configuration truthfully", async () => {
    const root = path.join(process.cwd(), ".tmp-vision-test-csv");
    tempRoots.push(root);
    process.env.PAAX_DATA_ROOT = root;
    const imageId = "22345678-1234-1234-1234-123456789012";
    const csvId = "32345678-1234-1234-1234-123456789012";
    await stage(root, imageId, "plan.jpg", "image/jpeg", Buffer.from([1, 2, 3]));
    await stage(root, csvId, "items.csv", "text/csv", Buffer.from("kode,volume\nA,12.5\n"));
    const result = await analyzeChatAttachments({ attachments: [
      { attachment_id: imageId, name: "plan.jpg", media_type: "image/jpeg", size_bytes: 3, status: "staged" },
      { attachment_id: csvId, name: "items.csv", media_type: "text/csv", size_bytes: 20, status: "staged" },
    ] });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].content).toContain("A,12.5");
    expect(result.failures[0].error).toContain("Provider vision belum dikonfigurasi");
    expect(attachmentProcessingContext(result)).toContain("Jangan menyimpulkan isi file ini.");
  });
});
