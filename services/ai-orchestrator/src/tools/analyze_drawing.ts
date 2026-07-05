import type { ToolDefinition } from "./types";

interface AnalyzeDrawingOptions {
  documentIntelligenceUrl: string;
  fetchImpl?: typeof fetch;
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createAnalyzeDrawingTool(options: AnalyzeDrawingOptions): ToolDefinition {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    declaration: {
      name: "analyze_drawing",
      description: "Cek status & ringkasan hasil analisa gambar kerja (job_id dari proses upload/analisa yang sudah dijalankan user).",
      parameters: {
        type: "OBJECT",
        properties: {
          job_id: { type: "STRING", description: "ID job hasil POST /drawings/analyze/start" },
        },
        required: ["job_id"],
      },
    },
    execute: async (rawArgs) => {
      const jobId = String(rawArgs.job_id ?? "").trim();
      if (!jobId) return { error: "job_id wajib diisi" };

      let response: Response;
      try {
        response = await fetchImpl(
          `${baseUrl(options.documentIntelligenceUrl)}/drawings/analyze/status/${encodeURIComponent(jobId)}`,
          { method: "GET" },
        );
      } catch {
        return { error: "document-intelligence tidak dapat dihubungi" };
      }

      if (response.status === 404) {
        return {
          available: false,
          message: "Job analisa gambar tidak ditemukan (mungkin sudah kadaluarsa atau service pernah restart).",
        };
      }
      if (!response.ok) return { error: `HTTP ${response.status} dari document-intelligence` };

      const job = await response.json() as Record<string, any>;
      if (job.status === "PENDING" || job.status === "PROCESSING") {
        return {
          available: true,
          status: job.status,
          progress_message: job.progress_message ?? null,
        };
      }
      if (job.status === "FAILED") {
        return {
          available: true,
          status: "FAILED",
          error: job.error ?? "analisa gagal tanpa detail",
        };
      }

      const consolidated = job.result?.consolidated ?? null;
      if (!consolidated) {
        return {
          available: true,
          status: "COMPLETED",
          message: "Job selesai tapi tidak ada hasil konsolidasi (kemungkinan bukan file PDF atau gagal parsial).",
        };
      }

      const registry = Array.isArray(consolidated.element_registry) ? consolidated.element_registry : [];
      const elementByCategory: Record<string, number> = {};
      for (const entry of registry) {
        const category = typeof entry?.kategori === "string" && entry.kategori.trim()
          ? entry.kategori
          : "lain";
        elementByCategory[category] = (elementByCategory[category] ?? 0) + 1;
      }
      const assumptions = Array.isArray(consolidated.assumptions) ? consolidated.assumptions : [];

      return {
        available: true,
        status: "COMPLETED",
        sheet_count: Array.isArray(consolidated.sheets) ? consolidated.sheets.length : 0,
        element_count: registry.length,
        element_by_category: elementByCategory,
        assumption_count: assumptions.length,
        high_severity_assumption_count: assumptions.filter((item: any) => item?.dampak === "tinggi").length,
        building_dimensions: consolidated.building_dimensions ?? null,
      };
    },
    summarize: (result) => {
      if (typeof result.error === "string") return `error: ${result.error}`;
      if (result.available === false) return "job analisa gambar tidak ditemukan";
      if (result.status === "COMPLETED" && typeof result.element_count === "number") {
        return `analisa selesai: ${result.sheet_count ?? 0} sheet, ${result.element_count} elemen`;
      }
      if (typeof result.status === "string") return `status ${result.status}`;
      return "hasil analisa gambar diterima";
    },
  };
}

