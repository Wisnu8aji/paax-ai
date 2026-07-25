import { describe, expect, it } from "vitest";

import {
  extractGeminiJson,
  ExtractedElementList,
  fallbackElements,
  geminiJson,
  geminiMultimodal,
  geminiText,
  extractElementsWithProvider,
  nvidiaText,
  getExtractorProviderStatus,
} from "./orchestrator";

describe("AI orchestrator", () => {
  it("parses Gemini JSON into validated ExtractedElement objects", () => {
    const parsed = extractGeminiJson(`{
      "elements": [{
        "id": "g-1",
        "label": "Dinding bata 12 x 3",
        "element_type": "dinding",
        "dims": {"panjang": 12, "tinggi": 3, "jumlah": 1},
        "ahsp_code": "AHSP.CK.001",
        "section": "IV",
        "confidence": 0.88,
        "reason": "terbaca sebagai pekerjaan dinding",
        "needs_review": false
      }]
    }`);

    const elements = ExtractedElementList.parse(parsed);

    expect(elements).toHaveLength(1);
    expect(elements[0].ahsp_code).toBe("AHSP.CK.001");
    expect(elements[0].confidence).toBe(0.88);
  });

  it("rejects non-json Gemini text and falls back to rule based elements", () => {
    expect(() => extractGeminiJson("Saya rasa ini dinding.")).toThrow("Output Gemini bukan JSON valid");

    const elements = fallbackElements("Dinding bata 10 x 3");

    expect(elements[0].ahsp_code).toBe("AHSP.CK.001");
    expect(elements[0].needs_review).toBe(false);
  });

  it("reports provider status without exposing API keys", () => {
    expect(getExtractorProviderStatus(undefined)).toEqual({ provider: "rule-based", model: null });
    expect(getExtractorProviderStatus("nvapi.valid")).toEqual({ provider: "nvidia", model: "nvidia/nemotron-nano-12b-v2-vl" });
  });

  it("uses NVIDIA first for typed drawing/RAB extraction when an NVIDIA key exists", async () => {
    const originalFetch = globalThis.fetch;
    let sentBody: unknown = null;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          elements: [{
            id: "kolom-k1",
            label: "Kolom K1 30 x 40 tinggi 3.5",
            element_type: "kolom",
            dims: { lebar: 0.3, panjang: 0.4, tinggi: 3.5, jumlah: 8 },
            ahsp_code: "AHSP.CK.003",
            section: "III",
            confidence: 0.82,
            reason: "terbaca dari teks input user",
            needs_review: false,
          }],
        }) } }],
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await extractElementsWithProvider("Kolom K1 30 x 40 tinggi 3.5 jumlah 8", "nvapi.valid");

      expect(result.provider).toBe("nvidia/nemotron-nano-12b-v2-vl");
      expect(result.fallback).toBe(false);
      expect(result.elements[0].element_type).toBe("kolom");
      expect(sentBody).toMatchObject({
        model: "nvidia/nemotron-nano-12b-v2-vl",
        messages: [{ role: "user", content: expect.stringContaining("Kolom K1") }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses generic Gemini JSON objects for shared orchestrator calls", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: '{"description":"Uraian Pekerjaan","volume":"Volume"}' }],
          },
        }],
      }), { status: 200 });

    await expect(geminiJson("map columns", "AQ.valid", fetchImpl as typeof fetch)).resolves.toEqual({
      description: "Uraian Pekerjaan",
      volume: "Volume",
    });
  });

  it("trims Gemini API keys before sending requests", async () => {
    let sentKey = "";
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      sentKey = String((init?.headers as Record<string, string>)["x-goog-api-key"]);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Halo dari Gemini" }] } }],
      }), { status: 200 });
    };

    await expect(geminiText("halo", "  AQ.valid  ", fetchImpl as typeof fetch)).resolves.toBe("Halo dari Gemini");
    expect(sentKey).toBe("AQ.valid");
  });

  it("returns free-form Gemini text for normal chat", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Tentu, saya bisa ngobrol normal." }] } }],
      }), { status: 200 });

    await expect(geminiText("halo", "AQ.valid", fetchImpl as typeof fetch)).resolves.toBe(
      "Tentu, saya bisa ngobrol normal.",
    );
  });

  it("sends inlineData parts for multimodal Gemini chat", async () => {
    let sentBody: unknown = null;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Gambar berisi denah struktur." }] } }],
      }), { status: 200 });
    };

    await expect(geminiMultimodal(
      "jelaskan lampiran",
      [{ mimeType: "image/png", data: "BASE64" }],
      "AQ.valid",
      fetchImpl as typeof fetch,
    )).resolves.toBe("Gambar berisi denah struktur.");

    expect(sentBody).toEqual({
      contents: [{
        role: "user",
        parts: [
          { text: "jelaskan lampiran" },
          { inlineData: { mimeType: "image/png", data: "BASE64" } },
        ],
      }],
    });
  });

  it("calls NVIDIA NIM through OpenAI-compatible chat completions", async () => {
    let sentUrl = "";
    let sentAuth = "";
    let sentBody: unknown = null;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      sentUrl = String(url);
      sentAuth = String((init?.headers as Record<string, string>).Authorization);
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban dari Kimi" } }],
      }), { status: 200 });
    };

    await expect(nvidiaText("halo", {
      apiKey: "example-nvapi-token  ",
      model: "moonshotai/kimi-k2.6",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("Jawaban dari Kimi");

    expect(sentUrl).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(sentAuth).toBe("Bearer example-nvapi-token");
    expect(sentBody).toEqual({
      model: "moonshotai/kimi-k2.6",
      messages: [{ role: "user", content: "halo" }],
      temperature: 1,
    });
  });

});
