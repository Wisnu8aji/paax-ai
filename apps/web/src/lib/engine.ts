/**
 * PAAX v0.6 — Helper Core Engine (deterministik) untuk halaman "Uji RAB Manual".
 *
 * ATURAN EMAS: frontend TIDAK menghitung apa pun. Semua angka (HSP, jumlah, bobot,
 * subtotal, PPN, total, Kurva S) berasal dari engine, lalu divalidasi dengan Zod
 * (@paax/schemas) sebelum dipakai. Modul ini hanya memanggil API & mem-parsing respons.
 *
 * Reuse: CORE_ENGINE_URL & CoreEngineError dari core-engine-client.ts.
 */
import {
  RABResult, HSPBreakdown, SCurveResult, ScenarioResult, ValidationResult,
  VolumeResult, SectionedRABResult, SchedulePlanResult,
} from "@paax/schemas";
import type { SchedulePlanRequest, ScenarioParams } from "@paax/schemas";
import { CORE_ENGINE_URL, CoreEngineError } from "./core-engine-client";

export type {
  CalendarConfig,
  PlanTaskInput,
  ScheduledTask,
  SchedulePlanRequest,
  SchedulePlanResult,
  ScenarioConfig,
  ScenarioParams,
  ScenarioResult,
} from "@paax/schemas";

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

export interface ScenarioControls {
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

export interface SectionLineInput {
  ahsp_code: string;
  volume: number;
  section?: string;
  description?: string;
}

/** GET /geometry/elements — daftar tipe elemen yang didukung kalkulator volume. */
export async function fetchElementTypes(): Promise<string[]> {
  const data = (await engineFetch("/geometry/elements")) as { element_types: string[] };
  return data.element_types;
}

/** POST /geometry/volume — hitung volume/luas dari dimensi (engine, untuk AI). */
export async function computeVolume(
  elementType: string,
  dims: Record<string, number>,
): Promise<VolumeResult> {
  const data = await engineFetch("/geometry/volume", {
    method: "POST",
    body: JSON.stringify({ element_type: elementType, dims }),
  });
  return VolumeResult.parse(data);
}

/** POST /rab/build — RAB tersektor (WBS) dari item + section. */
export async function buildSectionedRAB(
  lines: SectionLineInput[],
  regionCode = "jateng",
  ppnRate = 0.11,
): Promise<SectionedRABResult> {
  const data = await engineFetch("/rab/build", {
    method: "POST",
    body: JSON.stringify({ region_code: regionCode, ppn_rate: ppnRate, lines }),
  });
  return SectionedRABResult.parse(data);
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
  params: ScenarioControls = {},
): Promise<ScenarioResult> {
  const data = await engineFetch("/scenario/simulate", {
    method: "POST",
    body: JSON.stringify({ region_code: regionCode, ppn_rate: ppnRate, ...params, lines }),
  });
  return ScenarioResult.parse(data);
}

/** POST /scenario/simulate - skenario kustom v0.9B (params engine, tanpa hitung di TS). */
export async function simulateScenarioCustom(
  lines: ScenarioLine[],
  regionCode = "jateng",
  ppnRate = 0.11,
  baseMode: ScheduleMode = "sequential",
  params: ScenarioParams,
): Promise<ScenarioResult> {
  const data = await engineFetch("/scenario/simulate", {
    method: "POST",
    body: JSON.stringify({
      region_code: regionCode,
      ppn_rate: ppnRate,
      base_mode: baseMode,
      params,
      lines,
    }),
  });
  return ScenarioResult.parse(data);
}

/** POST /schedule/plan - CPM + tanggal kalender + Kurva S dependency dari engine. */
export async function fetchSchedulePlan(request: SchedulePlanRequest): Promise<SchedulePlanResult> {
  const data = await engineFetch("/schedule/plan", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return SchedulePlanResult.parse(data);
}

/** POST /schedule/s-curve - Kurva S rencana dari RAB + durasi tiap item. */
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
