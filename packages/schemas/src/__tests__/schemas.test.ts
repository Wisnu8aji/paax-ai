/**
 * Test Zod schema parsing — memastikan schema selaras dengan response engine aktual.
 * Nilai di sini adalah contoh response aktual dari POST /rab/calculate engine.
 */
import {
  RABResult,
  HSPBreakdown,
  SCurveResult,
  RABLineInput,
  ScenarioConfig,
  ScenarioResult,
  ValidationResult,
  CPMRequest,
  CPMResult,
  SchedulePlanRequest,
  SchedulePlanResult,
  AiKudaKudaSuggestionSchema,
  AiArsitekturAreaSuggestionSchema,
  ContinuationPatchSchema,
  DemIntegrityReportSchema,
  DrawingEvidenceSheetSchema,
  DocumentManifestSchema,
  DrawingWorkItemsResultSchema,
  GraphQueryPlanSchema,
  GroundedAnswerSchema,
  ProjectGraphEdgeSchema,
  ProjectGraphNodeSchema,
  ProjectGraphSnapshotSchema,
  ProjectGraphReviewQueueResponseSchema,
  QuantityReadinessResponseSchema,
  ProjectGraphCorrectionResponseSchema,
  RabBridgeResponseSchema,
  MeasurementFactSchema,
} from "../index";

// Contoh response aktual dari POST /rab/calculate engine
const mockRABResult = {
  region: "Jawa Tengah",
  region_code: "jateng",
  lines: [
    {
      ahsp_code: "AHSP.CK.001",
      name: "Pasangan dinding bata merah 1/2 batu, camp. 1 PC : 5 PP",
      unit: "m2",
      volume: 120,
      hsp: 145387.0,
      amount: 17446440.0,
      weight_pct: 22.4804,
      tax_amount: 1919108.4,
      line_total: 19365548.4
    },
    {
      ahsp_code: "AHSP.CK.002",
      name: "Plesteran 1 PC : 3 PP, tebal 15 mm",
      unit: "m2",
      volume: 240,
      hsp: 82845.4,
      amount: 19882896.0,
      weight_pct: 25.6207,
      tax_amount: 2188118.56,
      line_total: 22071014.56
    }
  ],
  subtotal: 37329336.0,
  ppn_rate: 0.11,
  ppn: 4106226.96,
  total: 41435562.96
};

// Contoh response HSP
const mockHSPBreakdown = {
  ahsp_code: "AHSP.CK.001",
  name: "Pasangan dinding bata merah 1/2 batu, camp. 1 PC : 5 PP",
  unit: "m2",
  bahan: 81770.0,
  upah: 50400.0,
  alat: 0.0,
  base: 132170.0,
  overhead_profit: 0.10,
  overhead_profit_value: 13217.0,
  hsp: 145387.0,
  components: [
    {
      resource_code: "BTA.01",
      resource_name: "Bata merah",
      category: "bahan",
      unit: "buah",
      coefficient: 70,
      unit_price: 800,
      subtotal: 56000.0
    }
  ]
};

// Contoh SCurveResult
const mockSCurveResult = {
  total_days: 26,
  period_days: 7,
  mode: "sequential",
  points: [
    { period: 1, day_start: 1, day_end: 7, planned_pct: 25.68, cumulative_pct: 25.68 },
    { period: 4, day_start: 22, day_end: 26, planned_pct: 14.95, cumulative_pct: 100.0 }
  ]
};

describe("RABResult schema", () => {
  it("parses valid RAB response without error", () => {
    const result = RABResult.parse(mockRABResult);
    expect(result.subtotal).toBe(37329336.0);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].ahsp_code).toBe("AHSP.CK.001");
    expect(result.lines[0].tax_amount).toBe(1919108.4);
    expect(result.lines[0].line_total).toBe(19365548.4);
  });

  it("rejects missing required fields", () => {
    expect(() => RABResult.parse({ region: "test" })).toThrow();
  });
});

describe("MeasurementFactSchema", () => {
  const fact = {
    measurement_id: "M-K1-W", project_id: "P-1", snapshot_id: "S-1",
    measurement_type: "length", value: 400, unit: "mm",
    source_method: "written_dimension", element_ids: ["K1"], evidence_refs: ["EV-1"],
  };

  it("requires dimensional value and matching unit", () => {
    expect(MeasurementFactSchema.parse(fact).unit).toBe("mm");
    expect(() => MeasurementFactSchema.parse({ ...fact, unit: "m2" })).toThrow();
  });
});

describe("HSPBreakdown schema", () => {
  it("parses valid HSP response without error", () => {
    const result = HSPBreakdown.parse(mockHSPBreakdown);
    expect(result.hsp).toBe(145387.0);
    expect(result.bahan).toBe(81770.0);
    expect(result.components[0].category).toBe("bahan");
  });
});

describe("SCurveResult schema", () => {
  it("parses valid SCurve response without error", () => {
    const result = SCurveResult.parse(mockSCurveResult);
    expect(result.points[result.points.length - 1].cumulative_pct).toBe(100.0);
  });
});

describe("CPM schemas", () => {
  it("parses CPM request defaults and result output", () => {
    const request = CPMRequest.parse({
      tasks: [
        { id: "A", duration_days: 3 },
        { id: "B", duration_days: 4, predecessors: ["A"] },
      ],
    });

    expect(request.tasks[0].predecessors).toEqual([]);

    const result = CPMResult.parse({
      project_duration_days: 7,
      tasks: [
        {
          id: "A",
          name: "A",
          duration_days: 3,
          early_start: 0,
          early_finish: 3,
          late_start: 0,
          late_finish: 3,
          total_float: 0,
          is_critical: true,
        },
      ],
      critical_path: ["A", "B"],
    });

    expect(result.project_duration_days).toBe(7);
    expect(result.critical_path).toEqual(["A", "B"]);
  });
});

describe("SchedulePlan schemas", () => {
  it("parses schedule plan request defaults and result output", () => {
    const request = SchedulePlanRequest.parse({
      project_start_date: "2026-06-01",
      tasks: [
        { id: "A", duration_days: 3, predecessors: [], weight_pct: 30 },
        { id: "B", duration_days: 2, predecessors: ["A"], weight_pct: 20 },
      ],
    });

    expect(request.calendar).toBeNull();
    expect(request.period_days).toBe(7);
    expect(request.tasks[0].name).toBeNull();

    const result = SchedulePlanResult.parse({
      project_duration_days: 5,
      project_start_date: "2026-06-01",
      project_end_date: "2026-06-06",
      tasks: [
        {
          id: "A",
          name: "A",
          duration_days: 3,
          early_start: 0,
          early_finish: 3,
          late_start: 0,
          late_finish: 3,
          total_float: 0,
          is_critical: true,
          start_date: "2026-06-01",
          end_date: "2026-06-03",
        },
      ],
      critical_path: ["A"],
      s_curve: null,
    });

    expect(result.tasks[0].start_date).toBe("2026-06-01");
    expect(result.s_curve).toBeNull();
  });
});

describe("DrawingWorkItemsResult schema", () => {
  it("parses Fase W work item grouping response and keeps unsupported volume empty", () => {
    const result = DrawingWorkItemsResultSchema.parse({
      work_items: [
        {
          work_id: "K1:beton:1",
          kode: "K1",
          kode_asli: ["K1", "KOLOM K1"],
          kategori: "kolom",
          work_type: "beton",
          uraian: "Beton kolom K1",
          wbs_section: "III",
          wbs_title: "Pekerjaan Struktur",
          formula_status: "dihitung",
          unit: "m3",
          volume: 0.42,
          formula: "F-B01",
          rule_id: "F-B01",
          source_pages: [1],
          element_refs: ["A1"],
          needs_review: false,
        },
        {
          work_id: "SAN1:manual:1",
          kode: "SAN1",
          kode_asli: ["SAN1"],
          kategori: "sanitasi",
          work_type: null,
          uraian: "Item sanitasi SAN1",
          wbs_section: "V",
          wbs_title: "Pekerjaan MEP",
          formula_status: "belum_didukung",
          unit: null,
          volume: null,
          formula: null,
          rule_id: null,
          source_pages: [7],
          element_refs: ["Detail sanitasi"],
          needs_review: true,
          review_reason: "kategori belum memiliki rumus takeoff deterministik",
        },
      ],
      warnings: [],
    });

    expect(result.work_items[0].formula_status).toBe("dihitung");
    expect(result.work_items[1].formula_status).toBe("belum_didukung");
    expect(result.work_items[1].volume).toBeNull();
  });
});

describe("AiKudaKudaSuggestionSchema", () => {
  it("parses complete kuda-kuda profile suggestion", () => {
    const result = AiKudaKudaSuggestionSchema.parse({
      designation: "WF 200.100.5.5.8",
      kg_per_m: 21.3,
      length_m: 6.5,
      qty: 12,
      confidence: 0.82,
      reasoning: "designasi, berat, panjang, dan jumlah disebut eksplisit",
      source_texts: [
        "PROFIL WF 200.100.5.5.8",
        "BERAT PROFIL 21.3 KG/M",
        "PANJANG BATANG 6.5 M",
        "JUMLAH 12 BATANG",
      ],
      model: "gemini-2.5-flash",
      generated_at: "2026-07-05T00:00:00+00:00",
    });

    expect(result.designation).toBe("WF 200.100.5.5.8");
    expect(result.kg_per_m).toBe(21.3);
    expect(result.qty).toBe(12);
  });
});

describe("AiArsitekturAreaSuggestionSchema", () => {
  it("parses generic area-based architecture suggestion", () => {
    const result = AiArsitekturAreaSuggestionSchema.parse({
      kategori: "plafon",
      fields: {
        a_neto_m2: 45,
        keliling_tepi_m: 28,
      },
      confidence: 0.8,
      reasoning: "area plafon dan keliling tepi disebut eksplisit",
      source_texts: ["PLAFON AREA NETO 45 M2", "KELILING TEPI 28 M"],
      model: "gemini-2.5-flash",
      generated_at: "2026-07-05T00:00:00+00:00",
    });

    expect(result.kategori).toBe("plafon");
    expect(result.fields.a_neto_m2).toBe(45);
    expect(result.fields.keliling_tepi_m).toBe(28);
  });
});

// Contoh response /scenario/simulate (anchor manual di test_scenario.py)
const mockScenarioResult = {
  region: "Jawa Tengah",
  region_code: "jateng",
  base_mode: "sequential",
  items: [
    { ahsp_code: "AHSP.CK.001", name: "Dinding bata", unit: "m2", volume: 50, labor_oh_per_unit: 0.425, mandays: 21.25, workers: 5, duration_days: 4.25 },
  ],
  baseline_total_days: 9.05,
  baseline_total_cost: 12666898.2,
  baseline_labor_cost: 5956500.0,
  candidates: [
    { key: "baseline", label: "Baseline", total_days: 9.05, total_cost: 12666898.2, delta_days: 0, delta_cost: 0, delta_days_pct: 0, delta_cost_pct: 0, note: "Rencana awal" },
  ],
  custom: null,
};

// Contoh response /rab/validate
const mockValidationResult = {
  score: 90,
  ok: true,
  items_count: 2,
  errors: 0,
  warnings: 1,
  infos: 0,
  issues: [
    { code: "DUPLICATE_ITEM", severity: "warning", message: "Item muncul 2x", ahsp_code: "AHSP.CK.001" },
  ],
};

describe("ScenarioResult schema", () => {
  it("parses valid scenario response without error", () => {
    const result = ScenarioResult.parse(mockScenarioResult);
    expect(result.baseline_total_days).toBe(9.05);
    expect(result.candidates[0].key).toBe("baseline");
    expect(result.custom).toBeNull();
  });

  it("parses custom scenario params and result", () => {
    const config = ScenarioConfig.parse({
      lines: [{ ahsp_code: "AHSP.CK.001", volume: 50, workers: 5 }],
      params: { crew_multiplier: 2, shifts: 2, efficiency: 0.8, target_days: null },
    });

    expect(config.params?.shift_premium_rate).toBe(0.3);

    const result = ScenarioResult.parse({
      ...mockScenarioResult,
      custom: {
        applied_crew_multiplier: 2,
        shifts: 2,
        efficiency: 0.8,
        target_days: null,
        resolved_from_target: false,
        items: [{
          ahsp_code: "AHSP.CK.001",
          name: "Dinding bata",
          volume: 50,
          base_mandays: 21.25,
          effective_workers: 16,
          duration_days: 1.328125,
        }],
        total_days: 2.83,
        subtotal: 15134432.5,
        labor_cost: 9679312.5,
        total_cost: 16799220.08,
        delta_days: -6.22,
        delta_cost: 4132321.88,
        delta_days_pct: -68.75,
        delta_cost_pct: 32.62,
        note: "Skenario kustom",
      },
    });

    expect(result.custom?.total_days).toBe(2.83);
  });
});

describe("ValidationResult schema", () => {
  it("parses valid validation response without error", () => {
    const result = ValidationResult.parse(mockValidationResult);
    expect(result.score).toBe(90);
    expect(result.issues[0].code).toBe("DUPLICATE_ITEM");
  });
});

describe("RABLineInput schema", () => {
  it("parses input with all fields", () => {
    const input = RABLineInput.parse({
      ahsp_code: "AHSP.CK.001",
      volume: 120,
      duration_days: 6
    });
    expect(input.volume).toBe(120);
  });

  it("parses input without optional fields", () => {
    const input = RABLineInput.parse({
      ahsp_code: "AHSP.CK.001",
      volume: 50
    });
    expect(input.duration_days).toBeUndefined();
  });
});

// Contoh payload sama persis dengan test_drawing_evidence_sheet_accepts_minimal_valid_payload
// di services/document-intelligence/tests/test_transcription_models.py - parity dijaga
// dengan menjaga kedua contoh ini identik, bukan generator otomatis.
const mockDrawingEvidenceSheet = {
  schema_version: "paax.dem.sheet.v1",
  run_id: "DEMRUN-20260714-001",
  document_id: "DOC-PLHUT-001",
  project_id: "PRJ-001",
  source: {
    document_hash: "sha256:abc123",
    file_name: "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
    page_index: 5,
    page_number: 6,
    render_uri: "object://renders/doc-plhut-001/page-006.png",
    width_px: 4096,
    height_px: 2896,
  },
  generation: {
    provider: "qwen",
    model_alias: "qwen-3.7-plus",
    prompt_version: "dem-extraction-v1.0.0",
    started_at: "2026-07-14T10:00:00Z",
    completed_at: "2026-07-14T10:00:12Z",
    continuation_count: 0,
    temperature: 0.0,
    status: "complete",
  },
  sheet_identity: {
    sheet_number: { value: "A-06", raw: "A-06", confidence: 0.98, evidence_refs: ["EV-P006-001"] },
    title: { value: "Rencana Paving", raw: "RENCANA PAVING", confidence: 0.99, evidence_refs: ["EV-P006-002"] },
    discipline: { value: "architecture", confidence: 0.88, status: "ai_interpreted" },
    scale_candidates: [{ raw: "1 : 100", normalized: "1:100", confidence: 0.94, evidence_refs: ["EV-P006-003"] }],
  },
  views: [{ view_id: "VIEW-P006-01", type: "site_plan", title: "Rencana Paving", bbox: [0.08, 0.12, 0.84, 0.91], confidence: 0.91 }],
  observations: {
    texts: [{ raw: "R.PLHUT", normalized: "Ruang PLHUT", confidence: 0.9, evidence_refs: ["EV-P006-004"] }],
    dimensions: [{ raw: "20400", normalized: "20400", numeric_value: 20400.0, unit: "mm", confidence: 0.86, evidence_refs: ["EV-P006-005"] }],
  },
  evidence: [
    { evidence_id: "EV-P006-001", kind: "visible_text", raw: "A-06", bbox: [0.91, 0.88, 0.96, 0.92], confidence: 0.98 },
  ],
  completion: { sections_expected: 13, sections_completed: 13, is_complete: true, next_cursor: null },
};

describe("DrawingEvidenceSheetSchema", () => {
  it("parses a real DEM page payload matching the Pydantic model", () => {
    const result = DrawingEvidenceSheetSchema.parse(mockDrawingEvidenceSheet);
    expect(result.source.page_number).toBe(6);
    expect(result.sheet_identity.discipline.status).toBe("ai_interpreted");
    expect(result.observations.dimensions[0].numeric_value).toBe(20400.0);
    expect(result.completion.is_complete).toBe(true);
  });

  it("defaults empty observation lists when omitted", () => {
    const minimal = {
      schema_version: "paax.dem.sheet.v1",
      run_id: "DEMRUN-20260714-002",
      document_id: "DOC-PLHUT-001",
      project_id: "PRJ-001",
      source: {
        document_hash: "sha256:abc123",
        file_name: "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
        page_index: 0,
        page_number: 1,
        render_uri: "object://renders/doc-plhut-001/page-001.png",
        width_px: 4096,
        height_px: 2896,
      },
      generation: {
        provider: "qwen",
        model_alias: "qwen-3.7-plus",
        prompt_version: "dem-extraction-v1.0.0",
        started_at: "2026-07-14T10:00:00Z",
        continuation_count: 0,
        temperature: 0.0,
        status: "complete",
      },
      sheet_identity: {
        sheet_number: { value: "", confidence: 0.0 },
        title: { value: "GAMBAR KERJA", confidence: 0.95 },
        discipline: { value: "cover", confidence: 0.9, status: "ai_interpreted" },
      },
      completion: { sections_expected: 13, sections_completed: 13, is_complete: true, next_cursor: null },
    };

    const result = DrawingEvidenceSheetSchema.parse(minimal);
    expect(result.observations.texts).toEqual([]);
    expect(result.views).toEqual([]);
    expect(result.evidence).toEqual([]);
  });
});

describe("DemIntegrityReportSchema", () => {
  it("parses the A4 evidence-integrity report contract", () => {
    const report = DemIntegrityReportSchema.parse({
      page_index: 41,
      sheet_id: "A-42",
      coordinate_space: "pixel_like",
      counts: {
        total_bbox: 80,
        out_of_contract_bbox: 79,
        dangling_refs: 12,
        duplicate_evidence_ids: 1,
        quarantined_observation_count: 3,
      },
      quarantined_observations: [
        {
          category: "dimensions",
          raw: "400",
          reason: "integrity: dangling evidence",
          evidence_refs: ["EV-MISSING"],
        },
      ],
      flagged_observations: [],
      completion_consistent: false,
      notes: ["completion inconsistent"],
    });

    expect(report.counts.quarantined_observation_count).toBe(3);
    expect(report.quarantined_observations[0].reason).toBe("integrity: dangling evidence");
  });
});

describe("DocumentManifestSchema", () => {
  it("tracks page status and resume state", () => {
    const manifest = DocumentManifestSchema.parse({
      document_id: "DOC-PLHUT-001",
      document_hash: "sha256:abc123",
      total_pages: 88,
      pages: [
        { page_index: 0, status: "complete", attempt_count: 1, input_hash: "sha256:page0hash" },
        { page_index: 46, status: "failed", attempt_count: 3, input_hash: "sha256:page46hash", error: "timeout after 30s" },
        { page_index: 47, status: "queued", attempt_count: 0, input_hash: null },
      ],
    });

    const failed = manifest.pages.find((p) => p.page_index === 46);
    expect(failed?.error).toBe("timeout after 30s");
    expect(failed?.attempt_count).toBe(3);
  });
});

describe("ContinuationPatchSchema", () => {
  it("carries base hash and cursor for deterministic merge", () => {
    const patch = ContinuationPatchSchema.parse({
      schema_version: "paax.dem.patch.v1",
      run_id: "DEMRUN-20260714-001",
      page_index: 5,
      base_result_hash: "sha256:previousresulthash",
      cursor: "grids:0",
      append: { grids: [], levels: [], spaces: [] },
      is_complete: false,
      next_cursor: "element_labels:0",
    });

    expect(patch.base_result_hash).toBe("sha256:previousresulthash");
    expect(patch.is_complete).toBe(false);
  });
});

describe("ProjectGraphNodeSchema", () => {
  it("parses an element_type node with typed properties", () => {
    const node = ProjectGraphNodeSchema.parse({
      node_id: "ELTYPE-COLUMN-K1",
      type: "element_type",
      canonical_name: "Kolom K1",
      aliases: ["K1", "Kol. K1"],
      properties: {
        shape: { value: "rectangular", value_source: "extracted", evidence_refs: [] },
        b_mm: { value: 300, value_source: "extracted", evidence_refs: ["EV-P049-121"] },
        h_mm: { value: 500, value_source: "extracted", evidence_refs: ["EV-P049-122"] },
      },
      discipline: "structure",
      verification_status: "ai_interpreted",
      confidence: 0.92,
      source_refs: [
        { document_id: "DOC-PLHUT-001", page_index: 48, sheet_id: "S-49", evidence_refs: ["EV-P049-121", "EV-P049-122"] },
      ],
    });

    expect(node.properties.b_mm.value).toBe(300);
    expect(node.verification_status).toBe("ai_interpreted");
  });

  it("defaults empty aliases and properties", () => {
    const node = ProjectGraphNodeSchema.parse({
      node_id: "LEVEL-01",
      type: "level",
      canonical_name: "Lantai 1",
      discipline: "general",
      verification_status: "extracted",
      confidence: 0.99,
    });

    expect(node.aliases).toEqual([]);
    expect(node.properties).toEqual({});
  });
});

describe("ProjectGraphEdgeSchema", () => {
  it("parses an INSTANCE_OF relation with cross-sheet-inferred confidence", () => {
    const edge = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-001",
      source: "ELOC-K1-L1-B2",
      target: "ELTYPE-COLUMN-K1",
      relation: "INSTANCE_OF",
      confidence_class: "CROSS_SHEET_INFERRED",
      confidence: 0.89,
      evidence_refs: ["EV-P032-017", "EV-P049-121"],
    });

    expect(edge.relation).toBe("INSTANCE_OF");
    expect(edge.confidence_class).toBe("CROSS_SHEET_INFERRED");
  });

  it("accepts the two-step opening pattern relations", () => {
    const voids = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-010", source: "WALL-01", target: "OPENING-01",
      relation: "HAS_OPENING", confidence_class: "EXTRACTED", confidence: 0.9,
    });
    const fills = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-011", source: "OPENING-01", target: "DOOR-P1",
      relation: "FILLED_BY", confidence_class: "EXTRACTED", confidence: 0.9,
    });

    expect(voids.relation).toBe("HAS_OPENING");
    expect(fills.relation).toBe("FILLED_BY");
  });
});

describe("ProjectGraphSnapshotSchema", () => {
  const validSnapshot = {
    schema_version: "paax.pckm.graph.v1",
    project_id: "PRJ-001",
    snapshot_id: "PGS-001",
    document_ids: ["DOC-PLHUT-001"],
    dem_run_ids: ["DEMRUN-20260714-001"],
    page_count: 88,
    nodes: [
      { node_id: "ELTYPE-COLUMN-K1", type: "element_type", canonical_name: "Kolom K1", discipline: "structure", verification_status: "extracted", confidence: 0.9 },
      { node_id: "LEVEL-01", type: "level", canonical_name: "Lantai 1", discipline: "general", verification_status: "extracted", confidence: 0.99 },
    ],
    edges: [
      { edge_id: "E1", source: "ELTYPE-COLUMN-K1", target: "LEVEL-01", relation: "LOCATED_ON", confidence_class: "EXTRACTED", confidence: 0.9 },
    ],
  };

  it("parses a valid snapshot", () => {
    const snapshot = ProjectGraphSnapshotSchema.parse(validSnapshot);
    expect(snapshot.snapshot_id).toBe("PGS-001");
    expect(snapshot.nodes).toHaveLength(2);
  });

  it("rejects more than one active LOCATED_ON edge for a source", () => {
    const withDuplicateLocatedOn = {
      ...validSnapshot,
      edges: [
        { edge_id: "E1", source: "ELTYPE-COLUMN-K1", target: "LEVEL-01", relation: "LOCATED_ON", confidence_class: "EXTRACTED", confidence: 0.9 },
        { edge_id: "E2", source: "ELTYPE-COLUMN-K1", target: "LEVEL-02", relation: "LOCATED_ON", confidence_class: "AMBIGUOUS", confidence: 0.3 },
      ],
    };

    expect(() => ProjectGraphSnapshotSchema.parse(withDuplicateLocatedOn)).toThrow();
  });
});

describe("C7/C8 graph workflow schemas", () => {
  it("parses deterministic review queue and quantity readiness contracts", () => {
    const queue = ProjectGraphReviewQueueResponseSchema.parse({
      project_id: "PROJECT-C78",
      snapshot_id: "SNAP-C78",
      items: [{
        id: "missing_dimension:node:TYPE-K1A",
        category: "missing_dimension",
        target_type: "node",
        target_id: "TYPE-K1A",
        reason_codes: ["no_written_dimension"],
        reasons: [{
          code: "no_written_dimension",
          message: "Element type terpakai belum memiliki dimensi tertulis.",
          target_type: "node",
          target_id: "TYPE-K1A",
          evidence_refs: ["EV-K1A"],
        }],
        priority: 2.5,
        weight: 2.5,
        occurrence_count: 1,
        evidence_refs: ["EV-K1A"],
      }],
      summary: { total: 1, by_reason: { no_written_dimension: 1 } },
    });
    const readiness = QuantityReadinessResponseSchema.parse({
      project_id: "PROJECT-C78",
      snapshot_id: "SNAP-C78",
      items: [{
        element_type_id: "TYPE-K1A",
        name: "K1A",
        readiness: "blocked",
        has_canonical_type: true,
        has_occurrence: true,
        has_written_dimension: false,
        no_open_conflict: true,
        level_binding_confirmed: true,
        occurrence_count: 1,
        reason_codes: ["no_written_dimension"],
        reasons: [],
      }],
      summary: { total: 1, ready: 0, needs_review: 0, blocked: 1 },
    });
    expect(queue.items[0].priority).toBe(2.5);
    expect(readiness.items[0].readiness).toBe("blocked");
  });

  it("accepts correction overlay and persisted proposal identifiers", () => {
    expect(ProjectGraphCorrectionResponseSchema.parse({
      id: "CORR-1", project_id: "PROJECT-C78", snapshot_id: "SNAP-C78",
      target_type: "node", target_id: "TYPE-K1", correction_type: "rename",
      proposed_value: { canonical_name: "K1 corrected" }, rationale: "Human review",
      status: "accepted", created_by: "OWNER-C78",
    }).status).toBe("accepted");
    expect(RabBridgeResponseSchema.parse({
      status: "requires_human_approval", snapshot_id: "SNAP-C78",
      proposal_id: "PROPOSAL-1", items: [],
    }).proposal_id).toBe("PROPOSAL-1");
  });
});

describe("GraphQueryPlanSchema", () => {
  it("parses an ELEMENT_LOOKUP intent with BFS traversal", () => {
    const plan = GraphQueryPlanSchema.parse({
      intent: "ELEMENT_LOOKUP",
      project_id: "PRJ-001",
      entities: [{ type: "element_type", value: "K1" }],
      filters: { level: null, discipline: "structure" },
      relations: ["INSTANCE_OF", "LOCATED_ON", "DEFINED_BY", "DEPICTED_IN"],
      traversal_mode: "bfs",
      traversal_depth: 2,
      budget_tokens: 1400,
    });

    expect(plan.intent).toBe("ELEMENT_LOOKUP");
    expect(plan.relations).toContain("INSTANCE_OF");
  });

  it("rejects relations outside the graph relation vocabulary", () => {
    expect(() => GraphQueryPlanSchema.parse({
      intent: "SPACE_LOOKUP",
      project_id: "PRJ-001",
      relations: ["SERVED_BY"],
    })).toThrow();
  });
});

describe("GroundedAnswerSchema", () => {
  it("carries citations and a retrieval trace", () => {
    const answer = GroundedAnswerSchema.parse({
      answer: "Kolom K1 ditemukan di lantai 1, grid B3.",
      citations: [
        { citation_id: "C1", document_id: "DOC-PLHUT-001", sheet_id: "S-49", page_number: 49, title: "Detail Kolom", evidence_ids: ["EV-P049-121"] },
      ],
      data_status: "grounded",
      confidence: 0.91,
      missing_information: [],
      conflicts: [],
      retrieval_trace: { intent: "ELEMENT_LOOKUP", seed_node_ids: ["ELTYPE-COLUMN-K1"], node_count: 8, edge_count: 11, context_token_estimate: 1120 },
    });

    expect(answer.data_status).toBe("grounded");
    expect(answer.citations[0].page_number).toBe(49);
  });
});
