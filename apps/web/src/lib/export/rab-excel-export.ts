"use client";

import { CORE_ENGINE_URL, CoreEngineError } from "@/lib/core-engine-client";
import type { EngineLine } from "@/lib/engine";

export interface RabExcelExportRequest {
  region_code: string;
  ppn_rate: number;
  lines: EngineLine[];
}

function safeName(name: string): string {
  return (name || "proyek").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "proyek";
}

export function createRabExcelRequest(
  lines: EngineLine[],
  regionCode: string,
  ppnRate: number,
): RabExcelExportRequest {
  return { region_code: regionCode, ppn_rate: ppnRate, lines };
}

export async function downloadRabFormulaExcel(
  lines: EngineLine[],
  regionCode: string,
  ppnRate: number,
  projectName: string,
): Promise<void> {
  if (!lines.length) {
    throw new Error("Belum ada baris RAB valid untuk export Excel rumus.");
  }

  let res: Response;
  try {
    res = await fetch(`${CORE_ENGINE_URL}/rab/export/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRabExcelRequest(lines, regionCode, ppnRate)),
    });
  } catch {
    throw new CoreEngineError(
      `Tidak dapat terhubung ke Core Engine di ${CORE_ENGINE_URL}. ` +
        `Pastikan engine berjalan (pnpm run dev:core).`,
    );
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new CoreEngineError(err?.detail ?? `Engine export error ${res.status}`, res.status, err);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RAB Rumus - ${safeName(projectName)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
