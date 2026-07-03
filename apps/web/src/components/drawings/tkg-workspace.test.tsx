// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { TkgDocument } from "@paax/schemas";

import { TkgWorkspace } from "./tkg-workspace";

const { analyzeDrawingFileMock, saveMock } = vi.hoisted(() => ({
  analyzeDrawingFileMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/lib/ai/document-intelligence-tkg", () => ({
  analyzeDrawingFile: analyzeDrawingFileMock,
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
      sheet_id: "A100",
      jenis: "denah",
      meta: { judul: "Denah Struktur", nomor: "A100", skala: "1:100", disiplin: "struktur" },
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
      elements: [{ kode: "K1", alamat: "A-1", bentuk: "titik", n: 1, count_simbol: null, count_label: null, lantai: "L1", ruas: null, panjang_m: null }],
      dimensions: [],
      notes: [],
      unclassified: [{ raw: "teks bebas", alasan: "Tidak cocok grammar" }],
    },
  ],
};

const intakeResult = {
  tkg: mockTkg,
  tkgText: "SHEET A100\nTYPE K1",
  classification: "STRUCTURAL_DRAWING",
  classificationConfidence: 0.83,
  warnings: ["[W-FRG] Fragmen angka perlu review", "Satuan dimensi perlu konfirmasi"],
};

function renderWorkspace() {
  return render(React.createElement(TkgWorkspace, { projectId: "project-1" }));
}

function makePdfFile() {
  return new File(["%PDF-1.7"], "gambar.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  analyzeDrawingFileMock.mockResolvedValue(intakeResult);
  saveMock.mockImplementation(async (record) => ({
    ...record,
    updatedAt: "2026-07-04T01:00:00.000Z",
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TkgWorkspace premium perception review", () => {
  it("renders PDF perception controls without saving a transcript yet", async () => {
    renderWorkspace();

    const upload = await screen.findByLabelText(/unggah pdf gambar kerja/i);
    const runButton = screen.getByRole("button", { name: /jalankan persepsi/i }) as HTMLButtonElement;

    expect(upload).toBeTruthy();
    expect(screen.getByText(/belum ada hasil persepsi/i)).toBeTruthy();
    expect(runButton.disabled).toBe(true);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("reviews PDF perception first, then saves it as a pipeline transcript after confirmation", async () => {
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /jalankan persepsi/i }));

    expect((await screen.findAllByText(/draft persepsi/i)).length).toBeGreaterThan(0);
    expect(analyzeDrawingFileMock).toHaveBeenCalledWith(expect.any(File), "project-1");
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("Cakupan")).toBeTruthy();
    expect(screen.getAllByText("Unclassified").length).toBeGreaterThan(0);
    expect(screen.getByText("teks bebas")).toBeTruthy();
    expect(screen.getByRole("button", { name: /\[W-FRG\].*1/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /pakai tkg sebagai transkrip/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls.at(-1)?.[0]).toMatchObject({
      projectId: "project-1",
      tkg: mockTkg,
      source: "pipeline",
      reviewed: false,
    });
  });

  it("keeps project-specific fixture names out of the component implementation", () => {
    const source = readFileSync(resolve(__dirname, "tkg-workspace.tsx"), "utf8");

    expect(source).not.toContain("PLHUT");
  });
});
