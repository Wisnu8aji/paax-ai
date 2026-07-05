import type { ToolDefinition } from "./types";

interface RunScenarioOptions {
  coreEngineUrl: string;
  fetchImpl?: typeof fetch;
}

const EMPTY_LINES_ERROR = "tidak ada data RAB untuk disimulasikan - minta user menyebutkan item & volume, atau tunggu Chain 02 (context dari client)";

export function createRunScenarioTool(options: RunScenarioOptions): ToolDefinition {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    declaration: {
      name: "run_scenario",
      description: "Jalankan simulasi skenario waktu-biaya via core-engine deterministik.",
      parameters: {
        type: "OBJECT",
        properties: {
          lines: { type: "ARRAY", description: "Daftar item AHSP dan volume" },
          region_code: { type: "STRING" },
          ppn_rate: { type: "NUMBER" },
          crew_factor: { type: "NUMBER" },
        },
        required: ["lines"],
      },
    },
    execute: async (rawArgs) => {
      const rawLines = Array.isArray(rawArgs.lines) ? rawArgs.lines as Array<Record<string, unknown>> : [];
      if (rawLines.length === 0) return { error: EMPTY_LINES_ERROR };
      const body = {
        region_code: String(rawArgs.region_code ?? "jateng"),
        ppn_rate: Number(rawArgs.ppn_rate ?? 0.11),
        base_mode: "sequential",
        crew_factor: Number(rawArgs.crew_factor ?? 2.0),
        overtime_speedup: 1.25,
        overtime_cost_factor: 1.4,
        params: null,
        lines: rawLines.map((line) => ({
          ahsp_code: String(line.ahsp_code),
          volume: Number(line.volume),
          workers: Number(line.workers ?? 4),
        })),
      };
      try {
        const response = await fetchImpl(`${options.coreEngineUrl.replace(/\/+$/, "")}/scenario/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as {
          baseline_total_days: number;
          baseline_total_cost: number;
          candidates: Array<{ key: string; label: string; total_days: number; total_cost: number }>;
        };
        return {
          baseline_total_days: data.baseline_total_days,
          baseline_total_cost: data.baseline_total_cost,
          candidates: data.candidates.map((item) => ({
            key: item.key,
            label: item.label,
            total_days: item.total_days,
            total_cost: item.total_cost,
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "core-engine tidak dapat dihubungi" };
      }
    },
    summarize: (result) => {
      if (typeof result.error === "string") return `error: ${result.error}`;
      return `${Array.isArray(result.candidates) ? result.candidates.length : 0} skenario dihitung`;
    },
  };
}
