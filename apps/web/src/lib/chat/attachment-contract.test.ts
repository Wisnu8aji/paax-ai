import { describe, expect, it } from "vitest";
import { MAX_CHAT_ATTACHMENT_BYTES, validateAttachmentMeta } from "./attachment-contract";

describe("Chat attachment contract", () => {
  it("accepts the v1.5 document and image formats", () => {
    for (const mimeType of [
      "image/png",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/csv",
    ]) {
      expect(validateAttachmentMeta({ name: "input", mimeType, sizeBytes: 100 }).ok).toBe(true);
    }
  });

  it("rejects unsupported types and oversized payloads with a user-facing reason", () => {
    expect(validateAttachmentMeta({ name: "script.exe", mimeType: "application/octet-stream", sizeBytes: 10 })).toMatchObject({ ok: false });
    expect(validateAttachmentMeta({ name: "large.pdf", mimeType: "application/pdf", sizeBytes: MAX_CHAT_ATTACHMENT_BYTES + 1 })).toMatchObject({ ok: false });
  });
});
