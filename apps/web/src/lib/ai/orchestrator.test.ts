import { describe, expect, it } from "vitest";

import {
  extractGeminiJson,
  ExtractedElementList,
  fallbackElements,
  geminiJson,
  geminiMultimodal,
  geminiText,
  deepseekText,
  extractElementsWithProvider,
  nvidiaText,
  pickChatModel,
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

  it("maps Command Room Lucent and Solace to NVIDIA model ids", () => {
    expect(pickChatModel("Lucent")).toEqual({ provider: "nvidia", model: "moonshotai/kimi-k2.6" });
    expect(pickChatModel("Solace")).toEqual({ provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro" });
  });

  it("calls NVIDIA NIM for Lucent Kimi through OpenAI-compatible chat completions", async () => {
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
      apiKey: "  nvapi.valid  ",
      model: "moonshotai/kimi-k2.6",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("Jawaban dari Kimi");

    expect(sentUrl).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(sentAuth).toBe("Bearer nvapi.valid");
    expect(sentBody).toEqual({
      model: "moonshotai/kimi-k2.6",
      messages: [{ role: "user", content: "halo" }],
      temperature: 1,
    });
  });

  it("calls NVIDIA NIM DeepSeek Pro for Solace with template thinking enabled", async () => {
    let sentBody: unknown = null;
    let signal: AbortSignal | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      signal = init?.signal as AbortSignal | undefined;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban dari NVIDIA DeepSeek" } }],
      }), { status: 200 });
    };

    await expect(nvidiaText("analisa", {
      apiKey: "nvapi.valid",
      model: "deepseek-ai/deepseek-v4-pro",
      thinking: true,
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("Jawaban dari NVIDIA DeepSeek");

    expect(signal).toBeDefined();
    expect(sentBody).toEqual({
      model: "deepseek-ai/deepseek-v4-pro",
      messages: [{ role: "user", content: "analisa" }],
      temperature: 1,
      max_tokens: 1536,
      chat_template_kwargs: { thinking: true },
    });
  });

  it("lets Solace NVIDIA DeepSeek Pro think up to one hour without retrying in non-thinking mode", async () => {
    let callCount = 0;
    let sentBody: unknown = null;
    let signal: AbortSignal | undefined;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timeoutDelays: number[] = [];

    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      timeoutDelays.push(Number(timeout));
      return originalSetTimeout(handler, 0, ...args);
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      return originalClearTimeout(id);
    }) as typeof clearTimeout;

    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      signal = init?.signal as AbortSignal | undefined;
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban setelah thinking panjang" } }],
      }), { status: 200 });
    };

    try {
      await expect(nvidiaText("analisa panjang", {
        apiKey: "nvapi.valid",
        model: "deepseek-ai/deepseek-v4-pro",
        thinking: true,
        fetchImpl: fetchImpl as typeof fetch,
      })).resolves.toBe("Jawaban setelah thinking panjang");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }

    expect(callCount).toBe(1);
    expect(timeoutDelays).toContain(3_600_000);
    expect(signal).toBeDefined();
    expect(sentBody).toMatchObject({
      model: "deepseek-ai/deepseek-v4-pro",
      chat_template_kwargs: { thinking: true },
    });
  });

  it("calls DeepSeek flash with thinking disabled for quick chat", async () => {
    let sentUrl = "";
    let sentAuth = "";
    let sentBody: unknown = null;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      sentUrl = String(url);
      sentAuth = String((init?.headers as Record<string, string>).Authorization);
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban dari DeepSeek" } }],
      }), { status: 200 });
    };

    await expect(deepseekText("halo", {
      apiKey: "  sk.valid  ",
      model: "deepseek-v4-flash",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("Jawaban dari DeepSeek");

    expect(sentUrl).toBe("https://api.deepseek.com/chat/completions");
    expect(sentAuth).toBe("Bearer sk.valid");
    expect(sentBody).toEqual({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "halo" }],
      thinking: { type: "disabled" },
      temperature: 0.2,
    });
  });

  it("calls DeepSeek pro with thinking enabled for Solace", async () => {
    let sentBody: unknown = null;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban mendalam dari Solace" } }],
      }), { status: 200 });
    };

    await expect(deepseekText("analisa", {
      apiKey: "sk.valid",
      model: "deepseek-v4-pro",
      thinking: true,
      reasoningEffort: "high",
      userId: "paax-command-room",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("Jawaban mendalam dari Solace");

    expect(sentBody).toEqual({
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "analisa" }],
      user_id: "paax-command-room",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
  });
});
