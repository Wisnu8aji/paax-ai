import { describe, expect, it } from "vitest";

import { runToolCallingLoop } from "../../src/gemini/tool-loop";
import type { ToolDefinition } from "../../src/tools/types";
import { functionCallPart, sequenceFetch, textPart } from "./fake-gemini-client";

const echoTool: ToolDefinition = {
  declaration: {
    name: "lookup_ahsp",
    description: "Cari AHSP",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
  },
  execute: async (args) => ({ candidates: [{ code: "A", name: args.query, unit: "m2" }], total_matched: 1 }),
  summarize: (result) => `${(result as { candidates: unknown[] }).candidates.length} kandidat ditemukan`,
};

describe("runToolCallingLoop", () => {
  it("returns direct model text without running tools", async () => {
    const usageEvents: any[] = [];
    const result = await runToolCallingLoop({
      apiKey: "key",
      systemPrompt: "system",
      userMessage: "halo",
      tools: [echoTool],
      fetchImpl: sequenceFetch([textPart("jawaban final")]),
      context: { project_id: "PROJECT-1" },
      trace: { correlationId: "trace-1", snapshotId: "SNAP-1", runId: "RUN-1" },
      usageSink: async (event) => { usageEvents.push(event); },
    });

    expect(result.answer).toBe("jawaban final");
    expect(result.toolCalls).toEqual([]);
    expect(result.hitMaxTurns).toBe(false);
    expect(usageEvents[0]).toMatchObject({ correlationId: "trace-1", projectId: "PROJECT-1", snapshotId: "SNAP-1", runId: "RUN-1" });
    expect(usageEvents[0].metadata).toEqual({ tool_turn: 0 });
  });

  it("executes requested tool, sends functionResponse, and returns final answer", async () => {
    const requests: unknown[] = [];
    const sequence = sequenceFetch([
      functionCallPart("lookup_ahsp", { query: "cat dinding" }),
      textPart("pakai kode A"),
    ]);
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return sequence(_url, init);
    }) as typeof fetch;

    const result = await runToolCallingLoop({
      apiKey: "key",
      systemPrompt: "system",
      userMessage: "carikan ahsp",
      tools: [echoTool],
      fetchImpl,
    });

    expect(result.answer).toBe("pakai kode A");
    expect(result.toolCalls).toEqual([
      { tool: "lookup_ahsp", args: { query: "cat dinding" }, resultSummary: "1 kandidat ditemukan" },
    ]);
    expect(JSON.stringify(requests[1])).toContain("functionResponse");
  });

  it("stops at max tool turns with honest fallback", async () => {
    const result = await runToolCallingLoop({
      apiKey: "key",
      systemPrompt: "system",
      userMessage: "loop",
      tools: [echoTool],
      maxTurns: 2,
      fetchImpl: sequenceFetch([
        functionCallPart("lookup_ahsp", { query: "a" }),
        functionCallPart("lookup_ahsp", { query: "b" }),
        functionCallPart("lookup_ahsp", { query: "c" }),
      ]),
    });

    expect(result.hitMaxTurns).toBe(true);
    expect(result.answer).toBe("Maaf, saya butuh terlalu banyak langkah untuk pertanyaan ini. Coba perjelas pertanyaan Anda.");
    expect(result.toolCalls).toHaveLength(2);
  });

  it("returns function error for unknown tool without crashing", async () => {
    const result = await runToolCallingLoop({
      apiKey: "key",
      systemPrompt: "system",
      userMessage: "unknown",
      tools: [echoTool],
      fetchImpl: sequenceFetch([
        functionCallPart("tool_asing", { x: 1 }),
        textPart("tool tidak ada"),
      ]),
    });

    expect(result.answer).toBe("tool tidak ada");
    expect(result.toolCalls[0].resultSummary).toBe("error: tool tidak dikenal: tool_asing");
  });

  it("captures tool exceptions as functionResponse errors", async () => {
    const brokenTool: ToolDefinition = { ...echoTool, execute: async () => { throw new Error("core mati"); } };
    const result = await runToolCallingLoop({
      apiKey: "key",
      systemPrompt: "system",
      userMessage: "broken",
      tools: [brokenTool],
      fetchImpl: sequenceFetch([
        functionCallPart("lookup_ahsp", { query: "cat" }),
        textPart("engine gagal"),
      ]),
    });

    expect(result.answer).toBe("engine gagal");
    expect(result.toolCalls[0].resultSummary).toBe("error: core mati");
  });
});
