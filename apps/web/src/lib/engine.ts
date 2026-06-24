/**
 * PAAX v0.6 — Helper Core Engine (deterministik) untuk halaman "Uji RAB Manual".
 *
 * ATURAN EMAS: frontend TIDAK menghitung apa pun. Semua angka (HSP, jumlah, bobot,
 * subtotal, PPN, total, Kurva S) berasal dari engine, lalu divalidasi dengan Zod
 * (@paax/schemas) sebelum dipakai. Modul ini hanya memanggil API & mem-parsing respons.
 *
 * Reuse: CORE_ENGINE_URL & CoreEngineError dari core-engine-client.ts.
 */
import { RABResult, HSPBreakdown, SCurveResult } from "@paax/schemas";
import { CORE_ENGINE_URL, CoreEngineError } from "./core-engine-client";

export interface AHSPListItem {
  code: string;
  name: string;
  unit: string;
  bidang: string;
}

export interface EngineLine {
  ahsp_code: string;
  volume: number;
  duration_days?: number;
}

export type ScheduleMode = "sequential" | "parallel";

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
