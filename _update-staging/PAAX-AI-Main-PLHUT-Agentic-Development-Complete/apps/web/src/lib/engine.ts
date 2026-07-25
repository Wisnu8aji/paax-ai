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
  TkgValidationResultSchema, TakeoffResultSchema, TakeoffAhspSuggestResultSchema,
  DataCoverageResultSchema, ConfidenceResultSchema, QaResultSchema, BrainBoeSchema,
  ReviewTriageResultSchema, CorrectionRecordSchema, EvalRunResultSchema,
  BoeExportPayloadSchema, BbsExportPayloadSchema,
} from "@paax/schemas";
import type {
  SchedulePlanRequest, ScenarioParams,
  TkgDocument, TkgValidationResult, TakeoffParams, TakeoffResult, TakeoffAhspSuggestResult,
  DataCoverageResult, ConfidenceRequest, ConfidenceResult, QaRequest, QaResult,
  BrainBoeRequest, BrainBoe, ReviewTriageRequest, ReviewTriageResult,
  CorrectionLogRequest, CorrectionRecord, EvalRunRequest, EvalRunResult,
  BoeExportPayload, BbsExportPayload, BbsResult,
} from "@paax/schemas";
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

/** GET /data/coverage — audit cakupan AHSP/HSD wilayah (engine, tanpa harga palsu). */
export async function fetchDataCoverage(regionCode = "jateng"): Promise<DataCoverageResult> {
  const data = await engineFetch(`/data/coverage?region_code=${encodeURIComponent(regionCode)}`);
  return DataCoverageResultSchema.parse(data);
}

/** POST /brain/confidence — skor confidence deterministik dari Evidence signals. */
export async function scoreBrainConfidence(request: ConfidenceRequest): Promise<ConfidenceResult> {
  const data = await engineFetch("/brain/confidence", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return ConfidenceResultSchema.parse(data);
}

/** POST /brain/qa — rekonsiliasi numerik F-K. */
export async function runBrainQa(request: QaRequest): Promise<QaResult> {
  const data = await engineFetch("/brain/qa", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return QaResultSchema.parse(data);
}

/** POST /brain/boe — Basis of Estimate dari ledger engine. */
export async function buildBrainBoe(request: BrainBoeRequest): Promise<BrainBoe> {
  const data = await engineFetch("/brain/boe", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return BrainBoeSchema.parse(data);
}

/** POST /rab/calculate — RAB lengkap (lines + subtotal + PPN + total). */
export async function triageReviewTasks(request: ReviewTriageRequest): Promise<ReviewTriageResult> {
  const data = await engineFetch("/review/triage", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return ReviewTriageResultSchema.parse(data);
}

export async function logReviewCorrection(request: CorrectionLogRequest): Promise<CorrectionRecord> {
  const data = await engineFetch("/review/corrections", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return CorrectionRecordSchema.parse(data);
}

export async function runEval(request: EvalRunRequest): Promise<EvalRunResult> {
  const data = await engineFetch("/eval/run", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return EvalRunResultSchema.parse(data);
}

export async function exportBoeJson(request: BrainBoe): Promise<BoeExportPayload> {
  const data = await engineFetch("/export/boe", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return BoeExportPayloadSchema.parse(data);
}

export async function exportBbsJson(request: BbsResult): Promise<BbsExportPayload> {
  const data = await engineFetch("/export/bbs", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return BbsExportPayloadSchema.parse(data);
}

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

/** POST /tkg/validate — validasi TKG (V-02..V-08 subset, gerbang brain TXT00 §7). */
export async function validateTkg(
  doc: TkgDocument,
  params?: Partial<TakeoffParams>,
): Promise<TkgValidationResult> {
  const data = await engineFetch("/tkg/validate", {
    method: "POST",
    body: JSON.stringify({ doc, params: params ?? null }),
  });
  return TkgValidationResultSchema.parse(data);
}

/** POST /tkg/render — render TKG menjadi skrip .tkg.txt (deterministik, auditable). */
export async function renderTkg(
  doc: TkgDocument,
  params?: Partial<TakeoffParams>,
): Promise<string> {
  const data = (await engineFetch("/tkg/render", {
    method: "POST",
    body: JSON.stringify({ doc, params: params ?? null }),
  })) as { text: string };
  return data.text;
}

/** POST /tkg/takeoff — TKG → WorkItem beton/bekisting/besi (semua angka dari engine). */
export async function takeoffTkg(
  doc: TkgDocument,
  params?: Partial<TakeoffParams>,
): Promise<TakeoffResult> {
  const data = await engineFetch("/tkg/takeoff", {
    method: "POST",
    body: JSON.stringify({ doc, params: params ?? null }),
  });
  return TakeoffResultSchema.parse(data);
}

/**
 * POST /tkg/takeoff-ahsp-suggest — takeoff + USULAN kode AHSP per item
 * (Fase T, token-overlap deterministik). ATURAN EMAS: `ahsp_suggested`
 * hanya penanda usulan, bukan keputusan final — user tetap bisa ganti di
 * halaman RAB.
 */
export async function takeoffAhspSuggestTkg(
  doc: TkgDocument,
  params?: Partial<TakeoffParams>,
): Promise<TakeoffAhspSuggestResult> {
  const data = await engineFetch("/tkg/takeoff-ahsp-suggest", {
    method: "POST",
    body: JSON.stringify({ doc, params: params ?? null }),
  });
  return TakeoffAhspSuggestResultSchema.parse(data);
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
