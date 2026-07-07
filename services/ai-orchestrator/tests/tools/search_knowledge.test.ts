import { describe, expect, it, vi } from "vitest";
import { createSearchKnowledgeTool } from "../../src/tools/search_knowledge";

describe("Search Knowledge Tool", () => {
  it("harus mengembalikan error jika query kosong", async () => {
    const tool = createSearchKnowledgeTool({ dbApiUrl: "http://test", geminiApiKey: "fake" });
    const result = await tool.execute({ query: "" }, {});
    expect(result).toHaveProperty("error");
  });

  it("harus berhasil mendapatkan hasil pencarian", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("embedContent")) {
        return {
          ok: true,
          json: async () => ({ embedding: { values: [0.1, 0.2] } })
        };
      }
      if (url.includes("/knowledge/search")) {
        return {
          ok: true,
          json: async () => [{ id: "123", source_ref: "AHSP-A", content: "Test content" }]
        };
      }
      return { ok: false };
    });

    const tool = createSearchKnowledgeTool({ dbApiUrl: "http://test", geminiApiKey: "fake", fetchImpl });
    const result = await tool.execute({ query: "Test" }, {});
    
    expect(result).not.toHaveProperty("error");
    expect(result).toHaveProperty("results");
    expect((result as any).results).toHaveLength(1);
    expect((result as any).results[0].source_ref).toBe("AHSP-A");
  });
});
