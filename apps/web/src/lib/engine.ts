/**
 * PAAX v0.6 — Helper Core Engine (deterministik) untuk halaman "Uji RAB Manual".
 *
 * ATURAN EMAS: frontend TIDAK menghitung apa pun. Semua angka (HSP, jumlah, bobot,
 * subtotal, PPN, total, Kurva S) berasal dari engine, lalu divalidasi dengan Zod
 * (@paax/schemas) sebelum dipakai. Modul ini hanya memanggil API & mem-parsing respons.
 *
 * Reuse: CORE_ENGINE_URL & CoreEngineError dari core-engine-client.ts.
 */
import { RABResult, HSPBreakdown, SCurveResult, ScenarioResult, ValidationResult } from "@paax/schemas";
import { CORE_ENGINE_URL, CoreEngineError } from "./core-engine-client";

export interface AHSPListItem {
  code: string;
  name: string;
  unit: string;
  bidang: string;
}

export interface RegionItem {
  code: string;
  name: string;
}

export interface EngineLine {
  ahsp_code: string;
  volume: number;
  duration_days?: number;
}

export type ScheduleMode = "sequential" | "parallel";

export interface ScenarioLine {
  ahsp_code: string;
  volume: number;
  workers: number;
}

export interface ScenarioParams {
  base_mode?: ScheduleMode;
  crew_factor?: number;
  overtime_speedup?: number;
  overtime_cost_factor?: number;
}

async function engineFetch(endpoint: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${CORE_ENGINE_URL}${endpoint}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new CoreEngineError(
      `Tidak dapat terhubung ke Core Engine di ${CORE_ENGINE_URL}. ` +
        `Pastikan engine berjalan (pnpm run dev:core).`,
    );
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new CoreEngineError(
      err?.detail ?? `Engine error ${res.status} ${res.statusText}`,
      res.status,
      err,
    );
  }
  return res.json();
}

/** GET /ahsp — daftar item AHSP yang tersedia di engine. */
export async function fetchAHSPList(): Promise<AHSPListItem[]> {
  return (await engineFetch("/ahsp")) as AHSPListItem[];
}

/** GET /regions — daftar wilayah harga satuan yang tersedia di engine. */
export async function fetchRegions(): Promise<RegionItem[]> {
  return (await engineFetch("/regions")) as RegionItem[];
}

/** POST /rab/calculate — RAB lengkap (lines + subtotal + PPN + total). */
export async function calculateRAB(
  lines: EngineLine[],
  regionCode = "jateng",
  ppnRate = 0.11,
): Promise<RABResult> {
  const data = await engineFetch("/rab/calculate", {
    method: "POST",
    body: JSON.stringify({ region_code: regionCode, ppn_rate: ppnRate, lines }),
  });
  return RABResult.parse(data); // validasi Zod — selaras dengan Pydantic engine
}

/** POST /rab/hsp — rincian HSP satu item (auditable: bahan/upah/alat + komponen). */
export async function getHSPDetail(
  ahspCode: string,
  regionCode = "jateng",
): Promise<HSPBreakdown> {
  const data = await engineFetch("/rab/hsp", {
    method: "POST",
    body: JSON.stringify({ ahsp_code: ahspCode, region_code: regionCode }),
  });
  return HSPBreakdown.parse(data);
}

/** POST /rab/validate — health check RAB (skor + peringatan deterministik). */
export async function validateRAB(
  lines: EngineLine[],
  regionCode = "jateng",
  ppnRate = 0.11,
): Promise<ValidationResult> {
  const data = await engineFetch("/rab/validate", {
    method: "POST",
    body: JSON.stringify({ region_code: regionCode, ppn_rate: ppnRate, lines }),
  });
  return ValidationResult.parse(data);
}

/** POST /scenario/simulate — simulasi what-if waktu-biaya (semua angka dari engine). */
export async function simulateScenario(
  lines: ScenarioLine[],
  regionCode = "jateng",
  ppnRate = 0.11,
  params: ScenarioParams = {},
): Promise<ScenarioResult> {
  const data = await engineFetch("/scenario/simulate", {
    method: "POST",
    body: JSON.stringify({ region_code: regionCode, ppn_rate: ppnRate, ...params, lines }),
  });
  return ScenarioResult.parse(data);
}

/** POST /schedule/s-curve — Kurva S rencana dari RAB + durasi tiap item. */
export async function getSCurve(
  lines: EngineLine[],
  regionCode = "jateng",
  periodDays = 7,
  mode: ScheduleMode = "sequential",
): Promise<SCurveResult> {
  const data = await engineFetch("/schedule/s-curve", {
    method: "POST",
    body: JSON.stringify({
      region_code: regionCode,
      period_days: periodDays,
      mode,
      lines,
    }),
  });
  return SCurveResult.parse(data);
}
