/**
 * Test Zod schema parsing — memastikan schema selaras dengan response engine aktual.
 * Nilai di sini adalah contoh response aktual dari POST /rab/calculate engine.
 */
import { RABResult, HSPBreakdown, SCurveResult, RABLineInput, ScenarioResult, ValidationResult } from "../index";

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
      weight_pct: 22.4804
    },
    {
      ahsp_code: "AHSP.CK.002",
      name: "Plesteran 1 PC : 3 PP, tebal 15 mm",
      unit: "m2",
      volume: 240,
      hsp: 82845.4,
      amount: 19882896.0,
      weight_pct: 25.6207
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
  });

  it("rejects missing required fields", () => {
    expect(() => RABResult.parse({ region: "test" })).toThrow();
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
