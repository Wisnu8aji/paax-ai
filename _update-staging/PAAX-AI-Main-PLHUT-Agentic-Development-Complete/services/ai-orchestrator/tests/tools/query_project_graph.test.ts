import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createQueryProjectGraphTool } from "../../src/tools/query_project_graph";

const queryProjectGraphTool = createQueryProjectGraphTool();

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
      {
        evidence_id: "EV-1",
        sheet_id: "S-21",
        sheet: "S-21",
        page_number: 21,
        page: 21,
        bbox: null,
        raw_text: "P2 label",
        raw_excerpt: "P2 label",
        status: "extracted",
        source_modality: null,
      },
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

  it("handles the real backend shape: top-level status is \"calculation_required\" itself (not \"success\") -- regression for live Command Room bug where this was misread as a hard failure", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "calculation_required",
          data_status: "calculation_required",
          intent: "CALCULATION_REQUIRED",
          nodes: [],
          guidance: "Angka final wajib dihitung oleh Core Engine dan menunggu approval manusia.",
          rab_bridge_available: true,
          notes: ["occurrence_count = jumlah kelompok konteks tercatat pada gambar, bukan jumlah fisik terpasang"],
        }),
      }),
    );

    const result = await queryProjectGraphTool.execute({ query: "berapa volume beton kolom lantai 2" }, { context });

    expect(result.available).toBe(true);
    expect(result.data_status).toBe("calculation_required");
    expect(String(result.guidance)).toMatch(/Core Engine/);
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
    expect(queryProjectGraphTool.summarize?.({
      available: true, nodes: [], human_drawing_view: { work_items: [{ code: "K2" }, { code: "K3" }] },
    })).toBe("2 item Drawing Intelligence relevan ditemukan dengan sumber gambar");
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


describe("query_project_graph human drawing projection", () => {
  it("enriches technical graph results with latest human-readable Drawing Intelligence items", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/projects/PROJ-1/project-graph/retrieve")) {
        return {
          ok: true,
          json: async () => ({
            status: "success", data_status: "grounded", intent: "LIST_FILTER",
            nodes: [{ node_id: "TYPE-K2", type: "element_type", name: "KOLOM K2", discipline: "structure", confidence: 0.96 }],
            evidence: [], notes: [],
          }),
        } as Response;
      }
      if (url.endsWith("/projects/PROJ-1/dem/runs")) {
        return { ok: true, json: async () => [{ id: "RUN-9", status: "completed" }] } as Response;
      }
      if (url.endsWith("/drawings/dem/RUN-9/intelligence?view=human")) {
        return {
          ok: true,
          json: async () => ({
            document_name: "Hospital Tower.pdf",
            summary: { recognized_work_items: 3 },
            safety: { physical_counts_auto_accepted: false, final_quantities_calculated: false },
            work_items: [
              {
                work_item_id: "K2-L2", category: "column", discipline: "Struktur", code: "K2",
                display_name: "Kolom K2", plain_name: "Kolom struktur", plain_description: "Elemen vertikal pemikul beban",
                level: "L2", level_label: "Lantai 2", status: "review", status_label: "Perlu verifikasi",
                readiness_score: 88, observed_label_count: 3, verified_physical_count: null,
                count_label: "3 label/simbol teramati", count_is_final: false, dimensions_text: "250 × 600 mm",
                known_facts: ["Ukuran tertulis 250 × 600 mm"], blockers: ["Jumlah fisik belum diverifikasi"],
                recommended_actions: ["Periksa overlay"], source_sheets: [{ sheet_number: "S-202", page_number: 44 }],
                evidence_refs: ["EV-K2"], user_accepted: false,
              },
              {
                work_item_id: "K3-L2", category: "column", discipline: "Struktur", code: "K3",
                display_name: "Kolom K3", plain_name: "Kolom struktur", level: "L2", level_label: "Lantai 2",
                status: "review", status_label: "Perlu verifikasi", readiness_score: 84,
                observed_label_count: 2, verified_physical_count: null, count_label: "2 label/simbol teramati",
                count_is_final: false, dimensions_text: "250 × 400 mm", source_sheets: [], evidence_refs: ["EV-K3"],
              },
              {
                work_item_id: "D1-L1", category: "door", discipline: "Arsitektur", code: "D1",
                display_name: "Pintu D1", level: "L1", level_label: "Lantai 1", readiness_score: 90,
                observed_label_count: 4, count_is_final: false,
              },
            ],
            needs_clarification: [],
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const tool = createQueryProjectGraphTool({ fetchImpl: fetchImpl as typeof fetch, documentIntelligenceUrl: "http://doc-intel" });
    const result = await tool.execute({ query: "kolom lantai 2 ada apa saja jumlah berapa ukuran berapa" }, { context });
    const human = result.human_drawing_view as { work_items: Array<Record<string, unknown>> };

    expect(result.available).toBe(true);
    expect(human.work_items.map((item) => item.code)).toEqual(["K2", "K3"]);
    expect(human.work_items[0].count_is_final).toBe(false);
    expect(human.work_items[0].count_label).toBe("3 label/simbol teramati");
    expect(human.work_items[0].citations).toEqual(["[S-202 p.44]"]);
    expect(result.nodes).toEqual([]);
    expect(result.audit_node_count).toBe(1);
    expect(result.audit_nodes_included).toBe(false);
    expect(JSON.stringify(human.work_items)).not.toContain("Pintu D1");
  });
});


describe("query_project_graph projection-first and audit behavior", () => {
  it("uses the human projection when PCKM is not ready", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/project-graph/retrieve")) {
        return { ok: true, json: async () => ({ status: "not_ready" }) } as Response;
      }
      if (url.endsWith("/dem/runs")) {
        return { ok: true, json: async () => [{ id: "RUN-NEW", status: "completed", completed_at: "2026-07-21T12:00:00Z" }] } as Response;
      }
      if (url.includes("/drawings/dem/RUN-NEW/intelligence?view=human")) {
        return { ok: true, json: async () => ({
          document_name: "Bridge Project.pdf", summary: {}, safety: {},
          work_items: [{
            work_item_id: "A1", category: "abutment", discipline: "structure", code: "A1",
            display_name: "Abutment A1", level: "substructure", level_label: "Substruktur",
            readiness_score: 91, observed_label_count: 1, count_label: "1 label/simbol teramati",
            count_is_final: false, source_sheets: [{ sheet_number: "S-01", page_number: 2 }], evidence_refs: ["EV-A1"],
          }], needs_clarification: [],
        }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    const tool = createQueryProjectGraphTool({ fetchImpl: fetchImpl as typeof fetch, documentIntelligenceUrl: "http://doc-intel" });
    const result = await tool.execute({ query: "abutment A1" }, { context });
    expect(result.available).toBe(true);
    expect(result.data_status).toBe("human_projection_only");
    expect((result.human_drawing_view as any).work_items[0].citations).toEqual(["[S-01 p.2]"]);
  });

  it("includes raw nodes only when the user explicitly asks for audit evidence", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/project-graph/retrieve")) return { ok: true, json: async () => ({
        status: "success", data_status: "grounded",
        nodes: [{ node_id: "N1", type: "element_type", name: "K2", discipline: "structure", confidence: 0.9 }],
        evidence: [{ evidence_id: "EV-K2", sheet_id: "S-2", page_index: 4, raw_text: "K2" }],
      }) } as Response;
      if (url.endsWith("/dem/runs")) return { ok: true, json: async () => [{ id: "R1", status: "completed" }] } as Response;
      if (url.includes("/drawings/dem/R1/intelligence?view=human")) return { ok: true, json: async () => ({
        document_name: "X.pdf", summary: {}, safety: {},
        work_items: [{ work_item_id: "K2", category: "column", code: "K2", level: "L2", level_label: "Lantai 2", readiness_score: 90, observed_label_count: 3, count_label: "3 label/simbol teramati", count_is_final: false, source_sheets: [{ sheet_number: "S-2", page_number: 5 }], evidence_refs: ["EV-K2"] }], needs_clarification: [],
      }) } as Response;
      return { ok: false, json: async () => ({}) } as Response;
    });
    const tool = createQueryProjectGraphTool({ fetchImpl: fetchImpl as typeof fetch, documentIntelligenceUrl: "http://doc-intel" });
    const result = await tool.execute({ query: "audit evidence kolom K2 lantai 2" }, { context });
    expect(result.audit_nodes_included).toBe(true);
    expect(Array.isArray(result.nodes) ? result.nodes : []).toHaveLength(1);
    expect(Array.isArray(result.evidence) ? result.evidence : []).toHaveLength(1);
  });
});


describe("query_project_graph real 88-page human-delivery fixture", () => {
  it("returns civil-engineering-ready L2 column items instead of raw PCKM noise", async () => {
    vi.stubEnv("DB_API_URL", "http://test-db");
    const delivery = JSON.parse(readFileSync(resolve(
      __dirname,
      "../../../../report/report_drawing_intelligence/DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_CONTINUED_2026-07-21.json",
    ), "utf8"));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/project-graph/retrieve")) return { ok: true, json: async () => ({
        status: "success", data_status: "grounded", intent: "LIST_FILTER",
        nodes: Array.from({ length: 20 }, (_, index) => ({
          node_id: `RAW-${index}`, type: "drawing_reference", name: `raw ${index}`, discipline: null, confidence: 0.5,
        })),
        evidence: [], notes: [],
      }) } as Response;
      if (url.endsWith("/dem/runs")) return { ok: true, json: async () => [{ id: "RUN-88", status: "completed" }] } as Response;
      if (url.includes("/drawings/dem/RUN-88/intelligence?view=human")) return { ok: true, json: async () => delivery } as Response;
      return { ok: false, json: async () => ({}) } as Response;
    });
    const tool = createQueryProjectGraphTool({ fetchImpl: fetchImpl as typeof fetch, documentIntelligenceUrl: "http://doc-intel" });
    const result = await tool.execute({ query: "kolom lantai 2 ada apa saja jumlah berapa ukuran berapa" }, { context });
    const items = (result.human_drawing_view as any).work_items;
    const codes = items.map((item: any) => item.code);
    expect(codes).toEqual(expect.arrayContaining(["K1A", "K2", "K3"]));
    expect(items.every((item: any) => item.count_is_final === false)).toBe(true);
    expect(items.find((item: any) => item.code === "K2").dimensions_text).toBe("250 × 600 mm");
    expect(items.find((item: any) => item.code === "K2").citations).toContain("[DENAH KOLOM LANTAI 2 p.43]");
    expect(result.nodes).toEqual([]);
    expect(result.audit_node_count).toBe(20);
    expect(JSON.stringify(items)).not.toContain('"category":"door"');
  });
});
