import { describe, expect, it } from "vitest";

import { createAnalyzeDrawingTool } from "../../src/tools/analyze_drawing";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

describe("analyze_drawing tool", () => {
  it("returns error for empty job_id and does not call fetch", async () => {
    let calls = 0;
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse({});
      }) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "   " })).resolves.toEqual({ error: "job_id wajib diisi" });
    expect(calls).toBe(0);
  });

  it("returns honest unavailable message for 404 job", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel/",
      fetchImpl: (async (url: RequestInfo | URL) => {
        expect(String(url)).toBe("http://doc-intel/drawings/analyze/status/job-404");
        return jsonResponse({ detail: "tidak ditemukan" }, 404);
      }) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-404" })).resolves.toEqual({
      available: false,
      message: "Job analisa gambar tidak ditemukan (mungkin sudah kadaluarsa atau service pernah restart).",
    });
  });

  it("returns connection error when document-intelligence cannot be reached", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-1" })).resolves.toEqual({
      error: "document-intelligence tidak dapat dihubungi",
    });
  });

  it("summarizes pending and processing status", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => jsonResponse({
        job_id: "job-1",
        status: "PROCESSING",
        progress_message: "Membaca gambar... (halaman 2/5)",
        created_at: "2026-07-05T00:00:00",
        updated_at: "2026-07-05T00:01:00",
        result: null,
        error: null,
      })) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-1" })).resolves.toEqual({
      available: true,
      status: "PROCESSING",
      progress_message: "Membaca gambar... (halaman 2/5)",
    });
  });

  it("summarizes failed status", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => jsonResponse({
        job_id: "job-1",
        status: "FAILED",
        progress_message: null,
        created_at: "2026-07-05T00:00:00",
        updated_at: "2026-07-05T00:01:00",
        result: null,
        error: "PDF rusak",
      })) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-1" })).resolves.toEqual({
      available: true,
      status: "FAILED",
      error: "PDF rusak",
    });
  });

  it("summarizes completed consolidated result without dumping raw payload", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => jsonResponse({
        job_id: "job-1",
        status: "COMPLETED",
        progress_message: "Selesai",
        created_at: "2026-07-05T00:00:00",
        updated_at: "2026-07-05T00:01:00",
        result: {
          consolidated: {
            sheets: [{ page: 1 }, { page: 2 }, { page: 3 }],
            element_registry: [
              { kode: "K1", kategori: "kolom" },
              { kode: "K2", kategori: "kolom" },
              { kode: "B1", kategori: "balok" },
              { kode: "D1", kategori: "dinding" },
              { kode: "X1" },
            ],
            assumptions: [
              { dampak: "tinggi", pernyataan: "grid konflik" },
              { dampak: "rendah", pernyataan: "catatan bebas" },
            ],
            building_dimensions: { total_x_mm: 10000, total_y_mm: 20000, sumber: "grid" },
          },
        },
        error: null,
      })) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-1" })).resolves.toEqual({
      available: true,
      status: "COMPLETED",
      sheet_count: 3,
      element_count: 5,
      element_by_category: { kolom: 2, balok: 1, dinding: 1, lain: 1 },
      assumption_count: 2,
      high_severity_assumption_count: 1,
      building_dimensions: { total_x_mm: 10000, total_y_mm: 20000, sumber: "grid" },
    });
  });

  it("handles completed job without consolidated result", async () => {
    const tool = createAnalyzeDrawingTool({
      documentIntelligenceUrl: "http://doc-intel",
      fetchImpl: (async () => jsonResponse({
        job_id: "job-1",
        status: "COMPLETED",
        progress_message: "Selesai",
        created_at: "2026-07-05T00:00:00",
        updated_at: "2026-07-05T00:01:00",
        result: { consolidated: null },
        error: null,
      })) as typeof fetch,
    });

    await expect(tool.execute({ job_id: "job-1" })).resolves.toEqual({
      available: true,
      status: "COMPLETED",
      message: "Job selesai tapi tidak ada hasil konsolidasi (kemungkinan bukan file PDF atau gagal parsial).",
    });
  });
});

