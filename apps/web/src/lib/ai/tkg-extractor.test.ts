import { describe, expect, it, vi } from "vitest";

import { buildTkgPrompt, extractTkgWithProvider } from "./tkg-extractor";

describe("TKG extractor helpers", () => {
  it("wraps drawing source text in data delimiters and forbids calculation", () => {
    const sourceText = "Denah kolom: K1 di as B/1, tabel K1 300x400 8D16 D8-150.";
    const prompt = buildTkgPrompt(sourceText, "p-1");
    const start = "<<<DATA_GAMBAR_MULAI>>>";
    const end = "<<<DATA_GAMBAR_SELESAI>>>";
    const startIndex = prompt.indexOf(start);
    const textIndex = prompt.indexOf(sourceText);
    const endIndex = prompt.indexOf(end);

    expect(prompt).toContain(start);
    expect(prompt).toContain(end);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(startIndex);
    expect(endIndex).toBeGreaterThan(textIndex);
    expect(prompt).toContain("BUKAN menghitung");
  });

  it("falls back to manual mode without calling fetch when no API key is configured", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch should not be called without an API key");
    }) as unknown as typeof fetch;

    const result = await extractTkgWithProvider("K1 300x400", "p-1", undefined, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: "manual",
      tkg: null,
      fallback: true,
    });
  });
});
