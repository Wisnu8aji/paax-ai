import type { ChatContext, ToolDefinition } from "./types";

interface ExportRabXlsxOptions {
  coreEngineUrl: string;
  fetchImpl?: typeof fetch;
}

const MISSING_RAB_MESSAGE = "Data RAB tidak tersedia di konteks percakapan ini - user perlu membuka halaman RAB proyek dulu sebelum export.";

/**
 * paax-xlsx-production primitif (blueprint §8.3, PLAN.md §9 Fase 7). Memanggil
 * endpoint core-engine /rab/export/excel yang SUDAH ADA dan matang (dibangun
 * jauh sebelum Command Room -- lihat services/core-engine/app/export/
 * excel_exporter.py) -- tool ini murni JEMBATAN, tidak menghitung apa pun
 * sendiri, sesuai Aturan Emas AGENTS.md §1 (Core Engine = sumber kalkulasi,
 * XLSX = representasi kalkulasi, LLM = penyusun dan penjelas).
 *
 * Hasil XLSX (binary) di-encode base64 dan dikembalikan sebagai data URI di
 * dalam tool result -- BUKAN disimpan ke storage/endpoint baru. Ini pendekatan
 * paling sederhana yang benar-benar berfungsi tanpa infrastruktur artifact
 * tambahan (blueprint §8.4 Artifact Quality Control adalah pekerjaan lanjutan
 * setelah pola pemakaian jelas, bukan prasyarat untuk export dasar).
 */
export function createExportRabXlsxTool(options: ExportRabXlsxOptions): ToolDefinition {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    declaration: {
      name: "export_rab_xlsx",
      description: "Export RAB proyek saat ini jadi file Excel (.xlsx) siap unduh. Memakai data RAB yang sama dengan query_rab -- WAJIB dipanggil hanya kalau user secara eksplisit minta file/export/unduh Excel, bukan untuk sekadar melihat data (pakai query_rab untuk itu).",
      parameters: {
        type: "OBJECT",
        properties: {
          region_code: { type: "STRING", description: "Kode wilayah harga: 'jateng', 'semarang', atau 'surakarta', default 'jateng'" },
        },
      },
    },
    execute: async (rawArgs, params) => executeExportRabXlsx(rawArgs, params?.context, options, fetchImpl),
    summarize: (result) => {
      if (typeof result.error === "string") return `error: ${result.error}`;
      if (result.available === false) return "data RAB tidak tersedia untuk export";
      return `file Excel RAB berhasil dibuat (${String(result.line_count ?? 0)} baris)`;
    },
  };
}

async function executeExportRabXlsx(
  rawArgs: Record<string, unknown>,
  context: ChatContext | undefined,
  options: ExportRabXlsxOptions,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  let lines = context?.rab_lines;
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  if (dbUrl && projectId) {
    try {
      const res = await fetch(`${dbUrl}/projects/${projectId}/rab`);
      if (res.ok) {
        const data = await res.json();
        if (data.payload && Array.isArray(data.payload.lines)) lines = data.payload.lines;
      }
    } catch { /* fallback ke context */ }
  }

  if (!lines || lines.length === 0) return { available: false, message: MISSING_RAB_MESSAGE };

  const validLines = lines.filter((l) => l.ahsp_code && l.volume !== null && l.volume !== undefined);
  if (validLines.length === 0) {
    return { available: false, message: "Semua baris RAB belum lengkap (kode AHSP/volume kosong) -- lengkapi dulu sebelum export." };
  }

  const body = {
    region_code: String(rawArgs.region_code ?? "jateng"),
    ppn_rate: 0.11,
    lines: validLines.map((l) => ({ ahsp_code: l.ahsp_code, volume: l.volume })),
  };

  try {
    const response = await fetchImpl(`${options.coreEngineUrl.replace(/\/+$/, "")}/rab/export/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { error: `core-engine export gagal: HTTP ${response.status} ${text.slice(0, 200)}` };
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return {
      available: true,
      line_count: validLines.length,
      filename: "RAB_export.xlsx",
      data_uri: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`,
      size_bytes: arrayBuffer.byteLength,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "core-engine tidak dapat dihubungi untuk export" };
  }
}
