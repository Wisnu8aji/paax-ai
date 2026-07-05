import { describe, expect, it } from "vitest";

import { createChatHandler } from "../../src/routes/chat";
import { functionCallPart, jsonResponse, textPart } from "../gemini/fake-gemini-client";

function req(body: unknown) {
  return { body } as any;
}

function res() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
  };
}

describe("chat route", () => {
  it("returns local fallback and does not call Gemini when api key is missing", async () => {
    let calls = 0;
    const handler = createChatHandler({
      geminiApiKey: "",
      coreEngineUrl: "http://core",
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse(textPart("tidak boleh"));
      }) as typeof fetch,
    });
    const out = res();

    await handler(req({ message: "halo" }), out as any);

    expect(calls).toBe(0);
    expect(out.payload).toEqual({
      provider: "local-fallback",
      fallback: true,
      answer: "GEMINI_API_KEY belum disetel di ai-orchestrator.",
      tool_calls: [],
    });
  });

  it("returns final answer with tool_calls from Gemini loop", async () => {
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlText = String(url);
      if (urlText.includes("/ahsp")) {
        return jsonResponse([
          { code: "A", name: "Pengecatan dinding", unit: "m2", bidang: "CK" },
        ] as any);
      }
      const body = JSON.parse(String(init?.body));
      if (!JSON.stringify(body).includes("functionResponse")) {
        return jsonResponse(functionCallPart("lookup_ahsp", { query: "cat dinding" }));
      }
      return jsonResponse(textPart("Kode A cocok."));
    }) as typeof fetch;
    const handler = createChatHandler({ geminiApiKey: "key", coreEngineUrl: "http://core", fetchImpl });
    const out = res();

    await handler(req({ message: "carikan cat" }), out as any);

    expect(out.payload).toMatchObject({
      provider: "gemini-2.5-flash",
      fallback: false,
      answer: "Kode A cocok.",
      tool_calls: [{ tool: "lookup_ahsp", args: { query: "cat dinding" } }],
    });
  });
});
