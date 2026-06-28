import { describe, expect, it } from "vitest";

import {
  extractGeminiJson,
  ExtractedElementList,
  fallbackElements,
  geminiJson,
  geminiText,
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
    expect(getExtractorProviderStatus("AQ.valid")).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
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
});
