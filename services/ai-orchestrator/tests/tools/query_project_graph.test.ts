import { afterEach, describe, expect, it, vi } from "vitest";

import { queryProjectGraphTool } from "../../src/tools/query_project_graph";

const context = { project_id: "PROJ-1" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("query_project_graph", () => {
  it("returns unavailable when DB_API_URL is not configured", async () => {
    vi.stubEnv("DB_API_URL", "");
    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context });
    expect(result.available).toBe(false);
  });

  it("returns unavailable when query is empty", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const result = await queryProjectGraphTool.execute({ query: "" }, { context });
    expect(result.available).toBe(false);
  });

  it("returns unavailable when project_id is missing from context", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context: {} });
    expect(result.available).toBe(false);
  });

  it("returns nodes with mandatory sheet+page citations when the graph has a match", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        snapshot_id: "SNAP-1",
        nodes: [
          { node_id: "TYPE-P2", type: "element_type", name: "P2", discipline: "electrical", confidence: 0.9 },
        ],
        edges: [],
        evidence: [
          { evidence_id: "EV-1", document_id: "DOC-1", sheet_id: "S-21", page_index: 20, raw_text: "P2 label" },
        ],
        context_token_estimate: 42,
      }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context });

    expect(result.available).toBe(true);
    expect(result.nodes).toEqual([
      { node_id: "TYPE-P2", name: "P2", type: "element_type", discipline: "electrical", confidence: 0.9 },
    ]);
    // page_number harus 1-indexed (page_index 20 -> halaman 21) supaya sitasi
    // yang dikutip model cocok dengan nomor halaman yang dilihat user di PDF.
    expect(result.evidence).toEqual([
      { sheet_id: "S-21", page_number: 21, raw_text: "P2 label", evidence_id: "EV-1" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://test-db/projects/PROJ-1/project-graph/retrieve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns unavailable (not a fabricated answer) when the graph has no matching nodes", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", nodes: [] }) }),
    );

    const result = await queryProjectGraphTool.execute({ query: "ELEMEN-TIDAK-ADA" }, { context });

    expect(result.available).toBe(false);
  });

  it("returns unavailable when the graph is not_ready (no snapshot synthesized yet)", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "not_ready" }) }),
    );

    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context });

    expect(result.available).toBe(false);
  });

  it("fails safe (unavailable, not a crash) when the DB API is unreachable", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context });

    expect(result.available).toBe(false);
  });

  it("summarize reports node count for the model's tool-result turn", () => {
    expect(
      queryProjectGraphTool.summarize?.({ available: true, nodes: [{ node_id: "A" }, { node_id: "B" }] }),
    ).toBe("2 elemen ditemukan di gambar kerja");
    expect(queryProjectGraphTool.summarize?.({ available: false })).toBe(
      "data gambar kerja tidak tersedia untuk query ini",
    );
  });
});
