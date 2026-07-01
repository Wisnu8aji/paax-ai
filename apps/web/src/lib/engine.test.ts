import { afterEach, describe, expect, it, vi } from "vitest";

import { CoreEngineError } from "./core-engine-client";
import { fetchSchedulePlan, simulateScenarioCustom } from "./engine";

describe("Core Engine client wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts schedule plan requests and returns the engine result unchanged", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const engineResult = {
      project_duration_days: 7,
      project_start_date: "2026-07-06",
      project_end_date: "2026-07-13",
      tasks: [
        {
          id: "A",
          name: "Pekerjaan A",
          duration_days: 3,
          early_start: 0,
          early_finish: 3,
          late_start: 0,
          late_finish: 3,
          total_float: 0,
          is_critical: true,
          start_date: "2026-07-06",
          end_date: "2026-07-08",
        },
      ],
      critical_path: ["A"],
      s_curve: null,
    };

    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify(engineResult), { status: 200 });
    });

    const request = {
      project_start_date: "2026-07-06",
      calendar: null,
      period_days: 7,
      tasks: [{ id: "A", name: "Pekerjaan A", duration_days: 3, predecessors: [], weight_pct: null }],
    };

    const result = await fetchSchedulePlan(request);

    expect(capturedUrl).toBe("http://127.0.0.1:8081/schedule/plan");
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(String(capturedInit?.body))).toEqual(request);
    expect(result).toEqual(engineResult);
  });

  it("posts scenario config with 9B params and returns custom scenario output unchanged", async () => {
    let capturedBody: unknown;
    const engineResult = {
      region: "Jawa Tengah",
      region_code: "jateng",
      base_mode: "sequential",
      items: [
        {
          ahsp_code: "AHSP.CK.001",
          name: "Dinding bata",
          unit: "m2",
          volume: 50,
          labor_oh_per_unit: 0.425,
          mandays: 21.25,
          workers: 5,
          duration_days: 4.25,
        },
      ],
      baseline_total_days: 9.05,
      baseline_total_cost: 12666898.2,
      baseline_labor_cost: 5956500,
      candidates: [
        {
          key: "baseline",
          label: "Baseline",
          total_days: 9.05,
          total_cost: 12666898.2,
          delta_days: 0,
          delta_cost: 0,
          delta_days_pct: 0,
          delta_cost_pct: 0,
          note: "Rencana awal",
        },
      ],
      custom: {
        applied_crew_multiplier: 2,
        shifts: 2,
        efficiency: 0.8,
        target_days: null,
        resolved_from_target: false,
        items: [
          {
            ahsp_code: "AHSP.CK.001",
            name: "Dinding bata",
            volume: 50,
            base_mandays: 21.25,
            effective_workers: 16,
            duration_days: 1.328125,
          },
        ],
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
    };

    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(engineResult), { status: 200 });
    });

    const params = {
      crew_multiplier: 2,
      shifts: 2,
      efficiency: 0.8,
      target_days: null,
      shift_premium_rate: 0.3,
    };

    const result = await simulateScenarioCustom(
      [{ ahsp_code: "AHSP.CK.001", volume: 50, workers: 5 }],
      "jateng",
      0.11,
      "sequential",
      params,
    );

    expect(capturedBody).toEqual({
      region_code: "jateng",
      ppn_rate: 0.11,
      base_mode: "sequential",
      params,
      lines: [{ ahsp_code: "AHSP.CK.001", volume: 50, workers: 5 }],
    });
    expect(result.custom).toEqual(engineResult.custom);
  });

  it("throws CoreEngineError when the engine cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(fetchSchedulePlan({
      project_start_date: "2026-07-06",
      calendar: null,
      period_days: 7,
      tasks: [],
    })).rejects.toBeInstanceOf(CoreEngineError);
  });
});
