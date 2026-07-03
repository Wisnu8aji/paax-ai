// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { TkgDocument } from "@paax/schemas";

import { TkgWorkspace } from "./tkg-workspace";

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
}));

vi.mock("@/lib/projects/tkg-repository", () => ({
  emptyTkgRecord: (projectId: string) => ({
    projectId,
    tkg: null,
    source: "manual",
    reviewed: false,
    lastRenderedText: null,
    updatedAt: "2026-07-04T00:00:00.000Z",
  }),
  tkgRepository: {
    get: vi.fn(async (projectId: string) => ({
      projectId,
      tkg: null,
      source: "manual",
      reviewed: false,
      lastRenderedText: null,
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
  sheets: [],
};

const perceptionResult = {
  tkg: mockTkg,
  validation: {
    ok: true,
    gate_passed: true,
    n_errors: 0,
    n_warnings: 1,
    issues: [],
    type_index: {},
    orphans_tanpa_definisi: [],
    orphans_tanpa_instance: [],
  },
  metrics: {
    span_total: 12,
    span_terklasifikasi: 10,
    cakupan: 0.83,
    grammar_pass_rate: 0.92,
    n_unclassified: 1,
    n_warning: 2,
  },
  gerbang: {
    status: "draft",
    checks: [
      { code: "V-01", label: "Cakupan span lengkap", passed: true },
      { code: "V-06", label: "Grammar-pass memenuhi ambang", passed: false },
    ],
  },
  warnings: [
    { code: "W-FRG", message: "Fragmen angka perlu review", page: 2, bbox: [10, 20, 30, 40] },
    { code: "W-FRG", message: "Jarak span meragukan", page: 2, bbox: [50, 60, 70, 80] },
    { code: "W-UNIT", message: "Satuan dimensi perlu konfirmasi" },
  ],
  unclassified: [
    { raw: "teks bebas", alasan: "Tidak cocok grammar", page: 3, bbox: [1, 2, 3, 4] },
  ],
  tkg_txt: "SHEET A100\nTYPE K1",
};

function renderWorkspace() {
  return render(React.createElement(TkgWorkspace, { projectId: "project-1" }));
}

function makePdfFile() {
  return new File(["%PDF-1.7"], "gambar.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  saveMock.mockImplementation(async (record) => ({
    ...record,
    updatedAt: "2026-07-04T01:00:00.000Z",
  }));
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TkgWorkspace perception review", () => {
  it("renders the perception tab default empty state and upload controls", async () => {
    renderWorkspace();

    expect(await screen.findByRole("button", { name: /0 .* persepsi/i })).toBeTruthy();
    expect(screen.getByText(/belum ada hasil persepsi/i)).toBeTruthy();
    expect(screen.getByLabelText(/unggah pdf gambar kerja/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /jalankan persepsi/i })).toHaveProperty("disabled", true);
  });

  it("uploads a PDF and renders metrics, gate status, and grouped warnings", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => perceptionResult,
    } as Response);
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /jalankan persepsi/i }));

    expect((await screen.findAllByText(/DRAFT/i)).length).toBeGreaterThan(0);
    expect(screen.getByText("Cakupan")).toBeTruthy();
    expect(screen.getByText("83%")).toBeTruthy();
    expect(screen.getByText("Grammar-pass")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByRole("button", { name: /\[W-FRG\].*2/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /\[W-UNIT\].*1/i })).toBeTruthy();
  });

  it("expands and collapses warning groups with a native button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => perceptionResult,
    } as Response);
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /jalankan persepsi/i }));

    const group = await screen.findByRole("button", { name: /\[W-FRG\].*2/i });
    expect(screen.queryByText(/Fragmen angka perlu review/i)).toBeNull();

    fireEvent.click(group);
    expect(screen.getByText(/Fragmen angka perlu review/i)).toBeTruthy();
    expect(screen.getByText(/\(hal\. 2, bbox 10, 20, 30, 40\)/i)).toBeTruthy();

    fireEvent.click(group);
    expect(screen.queryByText(/Fragmen angka perlu review/i)).toBeNull();
  });

  it("shows an actionable fallback message when perception upload fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /jalankan persepsi/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/gunakan tab sumber/i);
    expect(screen.getByRole("button", { name: /1 .* sumber/i })).toBeTruthy();
  });

  it("uses the perceived TKG as a pipeline transcript and moves to transcript tab", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => perceptionResult,
    } as Response);
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText(/unggah pdf gambar kerja/i), {
      target: { files: [makePdfFile()] },
    });
    fireEvent.click(screen.getByRole("button", { name: /jalankan persepsi/i }));
    fireEvent.click(await screen.findByRole("button", { name: /pakai tkg ini sebagai transkrip/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls.at(-1)?.[0]).toMatchObject({
      projectId: "project-1",
      tkg: mockTkg,
      source: "pipeline",
      reviewed: false,
    });
    expect(screen.getByRole("button", { name: /validasi/i })).toBeTruthy();
  });

  it("keeps project-specific fixture names out of the component implementation", () => {
    const source = readFileSync(resolve(__dirname, "tkg-workspace.tsx"), "utf8");

    expect(source).not.toContain("PLHUT");
  });
});
