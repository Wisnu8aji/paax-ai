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

  it("sends body v2 (use_intent: true, no legacy depth/traversal_mode fields)", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", data_status: "grounded", nodes: [], summary_view: { grain: {} } }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    await queryProjectGraphTool.execute({ query: "kolom lantai 2" }, { context });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://test-db/projects/PROJ-1/project-graph/retrieve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "kolom lantai 2", use_intent: true }),
      }),
    );
  });

  it("folds optional level/discipline/node_types into the query text sent to the backend (no separate body fields exist for them)", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", data_status: "grounded", nodes: [] }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    await queryProjectGraphTool.execute(
      { query: "struktur", level: "Lantai 2", discipline: "structure", node_types: ["kolom", "balok"] },
      { context },
    );

    const call = fetchImpl.mock.calls[0];
    const sentBody = JSON.parse((call[1] as RequestInit).body as string);
    expect(sentBody).toEqual({ query: "struktur Lantai 2 structure kolom balok", use_intent: true });
  });

  it("returns nodes with mandatory sheet+page citations when the graph has a match", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        snapshot_id: "SNAP-1",
        intent: "ELEMENT_LOOKUP",
        data_status: "grounded",
        applied_filters: { level: null, discipline: null },
        nodes: [
          { node_id: "TYPE-P2", type: "element_type", name: "P2", discipline: "electrical", confidence: 0.9 },
        ],
        edges: [],
        evidence: [
          { evidence_id: "EV-1", document_id: "DOC-1", sheet_id: "S-21", page_index: 20, raw_text: "P2 label" },
        ],
        notes: [],
        context_token_estimate: 42,
      }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await queryProjectGraphTool.execute({ query: "P2" }, { context });

    expect(result.available).toBe(true);
    expect(result.data_status).toBe("grounded");
    expect(result.intent).toBe("ELEMENT_LOOKUP");
    expect(result.nodes).toEqual([
      { node_id: "TYPE-P2", name: "P2", type: "element_type", discipline: "electrical", confidence: 0.9 },
    ]);
    // page_number harus 1-indexed (page_index 20 -> halaman 21) supaya sitasi
    // yang dikutip model cocok dengan nomor halaman yang dilihat user di PDF.
    expect(result.evidence).toEqual([
      { sheet_id: "S-21", page_number: 21, raw_text: "P2 label", evidence_id: "EV-1" },
    ]);
  });

  it("returns unavailable (not a fabricated answer) when the graph has no matching nodes and no summary_view", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success", data_status: "empty", nodes: [], notes: [] }),
      }),
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

  it("data_status=calculation_required: never computes, forwards guidance untouched and marks rab_bridge_available (Aturan Emas)", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "success",
          data_status: "calculation_required",
          intent: "CALCULATION_REQUIRED",
          nodes: [],
          guidance: "Angka volume beton harus dihitung lewat Core Engine dan menunggu approval.",
          rab_bridge_available: true,
          notes: ["kalkulasi ditolak -- diarahkan ke RAB"],
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "berapa volume beton lantai 2" }, { context });

    expect(result.available).toBe(true);
    expect(result.data_status).toBe("calculation_required");
    expect(result.guidance).toBe("Angka volume beton harus dihitung lewat Core Engine dan menunggu approval.");
    expect(result.rab_bridge_available).toBe(true);
    // tool tidak boleh menyisipkan angka hasil hitungannya sendiri di field mana pun
    expect(result.nodes).toBeUndefined();
    expect(String(result.note)).toMatch(/JANGAN menghitung/);
  });

  it("data_status=calculation_required without explicit guidance from backend still forwards a Golden-Rule-safe instruction", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success", data_status: "calculation_required", nodes: [] }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "butuh berapa semen" }, { context });

    expect(result.available).toBe(true);
    expect(result.data_status).toBe("calculation_required");
    expect(String(result.guidance)).toMatch(/Core Engine/);
  });

  it("data_status=unknown_level: tells the model the level is unrecognized instead of guessing", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "success",
          data_status: "unknown_level",
          intent: "LIST_FILTER",
          nodes: [],
          notes: ["level tak dikenal: Lantai 3"],
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "struktur lantai 3" }, { context });

    expect(result.available).toBe(false);
    expect(result.data_status).toBe("unknown_level");
    expect(result.notes).toEqual(["level tak dikenal: Lantai 3"]);
    expect(String(result.message)).toMatch(/tidak dikenali/);
  });

  it("passes through summary_view payload when the backend answers from project_graph_summary_views", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const summaryView = {
      schema_version: "paax.pckm.summary-view.v1",
      project_id: "PROJ-1",
      snapshot_id: "SNAP-1",
      view_kind: "LEVEL_OVERVIEW",
      grain: { level_id: "LEVEL-L2", discipline: "structure" },
      summary: {
        level_name: "Lantai 2",
        element_type_index: [{ element_type_id: "TYPE-K1", name: "Kolom K1", occurrence_count: 4 }],
        discipline_counts: [{ discipline: "structure", occurrence_count: 4 }],
        stored_measurement_facts: [],
      },
      quality: { confirmed_count: 4, ambiguous_binding_count: 0, conflict_count: 0, ambiguous_binding_ids: [], conflict_ids: [] },
      provenance: { source_document_ids: ["DOC-1"], evidence_ids: ["EV-1"], summary_builder_version: "1" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "success",
          data_status: "grounded",
          intent: "LIST_FILTER",
          nodes: [{ node_id: "LEVEL-L2", type: "level", name: "Lantai 2", discipline: null, confidence: 1 }],
          summary_view: summaryView,
          notes: [],
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "struktur lantai 2" }, { context });

    expect(result.available).toBe(true);
    expect(result.summary_view).toEqual(summaryView);
  });

  it("summary_view alone (empty nodes) still counts as available -- not a fabricated 'not found'", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "success",
          data_status: "grounded",
          nodes: [],
          summary_view: { grain: { level_id: "LEVEL-L2" }, summary: { level_name: "Lantai 2" } },
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "lantai 2" }, { context });

    expect(result.available).toBe(true);
  });

  it("applies the optional limit client-side by slicing nodes (backend has no node-count cap)", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "success",
          data_status: "grounded",
          nodes: [
            { node_id: "A", type: "element_type", name: "A", discipline: null, confidence: 0.9 },
            { node_id: "B", type: "element_type", name: "B", discipline: null, confidence: 0.9 },
            { node_id: "C", type: "element_type", name: "C", discipline: null, confidence: 0.9 },
          ],
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "kolom", limit: 2 }, { context });

    expect(Array.isArray(result.nodes) ? result.nodes.map((n: any) => n.node_id) : []).toEqual(["A", "B"]);
  });

  it("summarize reports node count for the model's tool-result turn", () => {
    expect(
      queryProjectGraphTool.summarize?.({ available: true, nodes: [{ node_id: "A" }, { node_id: "B" }] }),
    ).toBe("2 elemen ditemukan di gambar kerja");
    expect(queryProjectGraphTool.summarize?.({ available: false })).toBe(
      "data gambar kerja tidak tersedia untuk query ini",
    );
  });

  it("summarize reports calculation_required without ever implying a number was computed", () => {
    expect(
      queryProjectGraphTool.summarize?.({ available: true, data_status: "calculation_required" }),
    ).toBe("kalkulasi diperlukan -- guidance RAB/Core Engine diteruskan (tool tidak menghitung)");
  });
});
