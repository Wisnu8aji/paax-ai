import { describe, expect, it } from "vitest";

import { extractDelta } from "./route";

describe("extractDelta", () => {
  it("extracts plain content", () => {
    expect(extractDelta({ content: "halo" })).toEqual({ content: "halo", reasoning: "" });
  });

  it("prefers delta.reasoning over reasoning_content and reasoning_details (no double-counting)", () => {
    // Regresi: OpenRouter pernah mengirim reasoning (string flat) DAN
    // reasoning_details (breakdown terstruktur) untuk KONTEN YANG SAMA pada
    // delta yang sama — menjumlahkan keduanya menghasilkan teks dobel
    // ("Saya akanSaya akan t..."). Harus pilih satu sumber saja.
    const delta = {
      reasoning: "Saya akan ",
      reasoning_details: [{ type: "reasoning.text", text: "Saya akan " }],
    };
    expect(extractDelta(delta).reasoning).toBe("Saya akan ");
  });

  it("falls back to reasoning_content (DashScope/Qwen shape) when reasoning is absent", () => {
    expect(extractDelta({ reasoning_content: "menganalisa..." }).reasoning).toBe("menganalisa...");
  });

  it("falls back to reasoning_details text/summary when the flat fields are absent", () => {
    const delta = {
      reasoning_details: [
        { type: "reasoning.text", text: "bagian satu " },
        { type: "reasoning.summary", summary: "ringkasan" },
      ],
    };
    expect(extractDelta(delta).reasoning).toBe("bagian satu ringkasan");
  });

  it("returns empty strings for an empty delta", () => {
    expect(extractDelta({})).toEqual({ content: "", reasoning: "" });
  });
});
