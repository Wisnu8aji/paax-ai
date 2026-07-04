// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { TkgDocument } from "@paax/schemas";

import { TkgWorkspace } from "./tkg-workspace";

const { analyzeDrawingFileInBackgroundMock, saveMock } = vi.hoisted(() => ({
  analyzeDrawingFileInBackgroundMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/lib/ai/document-intelligence-tkg", () => ({
  analyzeDrawingFileInBackground: analyzeDrawingFileInBackgroundMock,
  DocumentIntelligenceError: class DocumentIntelligenceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "DocumentIntelligenceError";
    }
  },
}));

vi.mock("@/lib/projects/tkg-repository", () => ({
  emptyTkgRecord: (projectId: string) => ({
    projectId,
    tkg: null,
    source: "manual",
    reviewed: false,
    lastRenderedText: null,
    lastTakeoff: null,
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  tkgRepository: {
    get: vi.fn(async (projectId: string) => ({
      projectId,
      tkg: null,
      source: "manual",
      reviewed: false,
      lastRenderedText: null,
      lastTakeoff: null,
      updatedAt: "2026-07-04T00:00:00.000Z",
    })),
    save: saveMock,
  },
}));

vi.mock("@/lib/engine", () => ({
  renderTkg: vi.fn(),
  takeoffTkg: vi.fn(),
  validateTkg: vi.fn(),
}));

vi.mock("@/lib/projects/rab-repository", () => ({
  emptyRabLine: vi.fn(() => ({})),
  rabRepository: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("@/components/review/triage-panel", () => ({
  TriagePanel: () => null,
}));

const mockTkg: TkgDocument = {
  prj_id: "project-1",
  rev_id: "R0",
  locale: "id-ID",
  satuan_default: "mm",
  generated_by: "perception",
  sheets: [
    {
      sheet_id: "S01",
      jenis: "denah",
      meta: { judul: "DENAH KOLOM LT.1", nomor: null, skala: "1:100", disiplin: null, zone: "struktur_lantai_1" },
      grid: null,
      levels: [],
      tables: [
        {
          judul: "Tabel Kolom",
          records: [
            {
              kode: "K1",
              lantai: "L1",
              kategori: "kolom",
              dimensi: { b: 300, h: 400 },
              satuan_dimensi: "mm",
              tulangan: [],
              mutu_beton: "K-250",
              keterangan: null,
              raw_cells: null,
            },
          ],
        },
      ],
      elements: [{
        kode: "K1", alamat: "A1", alamat_list: ["A1"], alamat_needs_review: false,
        bentuk: "titik", n: 1, count_simbol: null, count_label: null, lantai: "L1", ruas: null, panjang_m: null,
      }],
      dimensions: [],
      notes: [],
      unclassified: [{ raw: "teks bebas", alasan: "Tidak cocok grammar" }],
    },
  ],
};

const intakeResult = {
  tkg: mockTkg,
  tkgText: "SHEET S01\nTYPE K1",
  classification: "STRUCTURAL_DRAWING",
  classificationConfidence: 0.83,
  warnings: ["[W-FRG] Fragmen angka perlu review", "Satuan dimensi perlu konfirmasi"],
  metrics: {
    span_total: 10,
    span_terklasifikasi: 9,
    cakupan: 0.9,
    grammar_pass_rate: 0.9,
    n_unclassified: 1,
    n_warning: 2,
  },
  gerbang: {
    status: "draft" as const,
    checks: [
      { code: "V-01", label: "Cakupan teks (zero-loss)", passed: true, detail: "9/10 run terklasifikasi" },
      { code: "V-06", label: "Grammar-pass rate >= 85%", passed: true, detail: "90.0% run cocok grammar" },
    ],
  },
  consolidated: {
    sheets: [{ page: 1, sheet_id: "S01", zone: "struktur_lantai_1", judul: "DENAH KOLOM LT.1", skala: "1:100" }],
    grid: null,
    element_registry: [
      {
        kode: "K1",
        kategori: "kolom",
        instances: [{ sheet_page: 1, alamat: "A1", catatan: null }],
        definisi: { dimensi: { b: 300, h: 400 }, satuan_dimensi: "mm", tulangan: [], mutu_beton: "K-250", sumber_halaman: 1 },
        status: "terbaca" as const,
      },
    ],
    assumptions: [
      { pernyataan: "Teks 'teks bebas' tidak dikenali di sheet 1", alasan: "Tidak cocok grammar apa pun", sheet_page: 1, dampak: "rendah" as const },
    ],
    building_dimensions: { total_x_mm: 20000, total_y_mm: 10000, sumber: "grid" as const },
  },
};

function renderWorkspace() {
  return render(React.createElement(TkgWorkspace, { projectId: "project-1" }));
}

function makePdfFile() {
  return new File(["%PDF-1.7"], "gambar.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  analyzeDrawingFileInBackgroundMock.mockResolvedValue(intakeResult);
  saveMock.mockImplementation(async (record) => ({
    ...record,
    updatedAt: "2026-07-04T01:00:00.000Z",
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TkgWorkspace Review Gambar (rencana besar 2026-07-05)", () => {
  it("renders upload controls without saving a transcript yet", async () => {
    renderWorkspace();

    const upload = await screen.findByLabelText(/unggah pdf gambar kerja/i);
    const runButton = screen.getByRole("button", { name: /analisa gambar kerja/i }) as HTMLButtonElement;

    expect(upload).toBeTruthy();
    expect(screen.getByText(/belum ada hasil analisis/i)).toBeTruthy();
    expect(runButton.disabled).toBe(true);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("reviews the drawing with friendly labels first, then saves it as a pipeline transcript after confirmation", async () => {
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    // chip lampiran menampilkan nama file (bukan lagi teks polos di dropzone)
    expect(await screen.findByText("gambar.pdf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /analisa gambar kerja/i }));

    expect(analyzeDrawingFileInBackgroundMock).toHaveBeenCalledWith(expect.any(File), "project-1", expect.any(Function));
    await waitFor(() => expect(saveMock).not.toHaveBeenCalled());

    // Halaman & zona ditampilkan bahasa manusia, bukan kode teknis.
    expect(await screen.findByText("DENAH KOLOM LT.1")).toBeTruthy();
    expect(screen.getAllByText(/struktur lantai 1/i).length).toBeGreaterThan(0);
    // Grid & elemen: alamat asli "A1" tampil, dikelompokkan per zona.
    expect(screen.getByText("A1")).toBeTruthy();
    // Dimensi bangunan dikonversi ke meter.
    expect(screen.getByText(/20 m/)).toBeTruthy();
    // "Perlu dicek" pakai bahasa manusia, bukan field 'alasan' mentah tampil sbg label teknis.
    expect(screen.getByText(/teks bebas/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /simpan hasil analisis/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls.at(-1)?.[0]).toMatchObject({
      projectId: "project-1",
      tkg: mockTkg,
      source: "pipeline",
      reviewed: false,
    });
  });

  it("shows a disabled Generate RAB placeholder that is not wired to any logic yet", async () => {
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /analisa gambar kerja/i }));

    const generateRabButton = await screen.findByRole("button", { name: /generate rab/i });
    expect((generateRabButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("supports removing an attached file before analysis", async () => {
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    expect(await screen.findByText("gambar.pdf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /hapus file/i }));
    expect(screen.queryByText("gambar.pdf")).toBeNull();
    expect(screen.getByText(/seret pdf ke sini/i)).toBeTruthy();
  });

  it("keeps project-specific fixture names out of the component implementation", () => {
    const source = readFileSync(resolve(__dirname, "tkg-workspace.tsx"), "utf8");

    expect(source).not.toContain("PLHUT");
  });

  it("never surfaces raw technical gerbang/coverage jargon to the end user", () => {
    const source = readFileSync(resolve(__dirname, "tkg-workspace.tsx"), "utf8");

    // Fabrikasi lama (sesi sebelumnya) - tetap dijaga tak pernah muncul lagi.
    expect(source).not.toContain("V-TKG");
    expect(source).not.toContain("V-COV");
    expect(source).not.toContain("V-WARN");
    expect(source).not.toContain("V-CLS");
    // Rencana besar 2026-07-05: istilah teknis mentah disembunyikan dari UI utama.
    expect(source).not.toContain("Grammar-pass");
    expect(source).not.toContain("GERBANG-2 LOLOS");
  });
});
