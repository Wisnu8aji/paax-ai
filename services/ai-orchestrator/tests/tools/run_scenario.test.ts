import { describe, expect, it } from "vitest";

import { createRunScenarioTool } from "../../src/tools/run_scenario";

describe("run_scenario", () => {
  it("posts ScenarioConfig-shaped payload and maps response fields", async () => {
    let captured: unknown;
    const tool = createRunScenarioTool({
      coreEngineUrl: "http://core",
      fetchImpl: async (_url, init) => {
        captured = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({
            baseline_total_days: 10,
            baseline_total_cost: 200000,
            candidates: [{ key: "parallel", label: "Paralel", total_days: 5, total_cost: 210000 }],
          }),
        } as Response;
      },
    });

    const result = await tool.execute({ lines: [{ ahsp_code: "A", volume: 2 }], crew_factor: 3 });

    expect(captured).toEqual({
      region_code: "jateng",
      ppn_rate: 0.11,
      base_mode: "sequential",
      crew_factor: 3,
      overtime_speedup: 1.25,
      overtime_cost_factor: 1.4,
      params: null,
      lines: [{ ahsp_code: "A", volume: 2, workers: 4 }],
    });
    expect(result).toEqual({
      baseline_total_days: 10,
      baseline_total_cost: 200000,
      candidates: [{ key: "parallel", label: "Paralel", total_days: 5, total_cost: 210000 }],
    });
  });

  it("rejects empty lines without calling core-engine", async () => {
    let calls = 0;
    const tool = createRunScenarioTool({
      coreEngineUrl: "http://core",
      fetchImpl: async () => {
        calls += 1;
        return {} as Response;
      },
    });

    const result = await tool.execute({ lines: [] });

    expect(calls).toBe(0);
    expect(result).toEqual({
      error: "tidak ada data RAB untuk disimulasikan - minta user menyebutkan item & volume, atau tunggu Chain 02 (context dari client)",
    });
  });
});
