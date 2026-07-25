"""Fase 2 P3-geometri — test `reconstruct_grid_from_geometry` (§3.1.1).

Fixture SINTETIS (`_generate_synthetic_grid_pdf.py`, §0.1: label/nilai
SENGAJA beda dari PLHUT) membuktikan generalisasi geometri; smoke test
PLHUT (skipif) membuktikan hasil tetap benar terhadap nilai acuan manual
yang sudah diverifikasi analitis (lihat docstring modul).
"""
from __future__ import annotations

import os

import fitz
import pytest

from app.perception.ingest.span_extractor import extract_spans_from_page
from app.perception.vector.grid_geometry import reconstruct_grid_from_geometry
from app.perception.vector.merge_run import merge_runs
from tests.fixtures.perception._generate_synthetic_grid_pdf import build_synthetic_grid_pdf_bytes


def _grid_from_bytes(pdf_bytes: bytes, page_index: int = 0):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc.load_page(page_index)
        runs = merge_runs(extract_spans_from_page(page, page_index))
        grid, used_ids, _axis_points = reconstruct_grid_from_geometry(page, runs)
        return grid, used_ids
    finally:
        doc.close()


def test_synthetic_axes_and_positions_reconstructed():
    grid, _used = _grid_from_bytes(build_synthetic_grid_pdf_bytes())
    assert grid is not None
    sumbu_x = {a.label: a.posisi_mm for a in grid.sumbu_x}
    sumbu_y = {a.label: a.posisi_mm for a in grid.sumbu_y}
    assert sumbu_x == {"1": 0.0, "2": 3500.0, "3": 6300.0}
    assert sumbu_y == {"P": 0.0, "Q": 4000.0, "R": 7200.0}


def test_synthetic_bentang_matches_manual_anchor():
    grid, _used = _grid_from_bytes(build_synthetic_grid_pdf_bytes())
    bentang_x = {(s.dari, s.ke): s.nilai for s in grid.bentang_x}
    bentang_y = {(s.dari, s.ke): s.nilai for s in grid.bentang_y}
    assert bentang_x == {("1", "2"): 3500.0, ("2", "3"): 2800.0}
    assert bentang_y == {("P", "Q"): 4000.0, ("Q", "R"): 3200.0}


def test_synthetic_total_accepted_only_when_arithmetic_matches():
    grid, _used = _grid_from_bytes(build_synthetic_grid_pdf_bytes())
    assert grid.total_x is not None and grid.total_x.nilai == 6300.0
    assert grid.total_y is not None and grid.total_y.nilai == 7200.0


def test_synthetic_edge_offset_excluded_from_bentang():
    grid, _used = _grid_from_bytes(build_synthetic_grid_pdf_bytes())
    assert len(grid.offset_tepi) == 1
    offset = grid.offset_tepi[0]
    assert offset.nilai == 600.0
    assert offset.ke == "1"
    # nilai offset TIDAK boleh ikut sebagai bentang antar-as manapun (AP-E-08)
    assert 600.0 not in [s.nilai for s in grid.bentang_x]


def test_synthetic_small_unrelated_circles_not_treated_as_axis_family():
    """2 lingkaran kecil (label M/N) sejajar cx=520 TAPI beda ukuran dari
    keluarga bubble-as asli (diameter 20 vs 36) -> harus gugur via filter
    kelompok-ukuran dominan, bukan salah dianggap keluarga grid baru."""
    grid, _used = _grid_from_bytes(build_synthetic_grid_pdf_bytes())
    all_labels = {a.label for a in grid.sumbu_x} | {a.label for a in grid.sumbu_y}
    assert "M" not in all_labels
    assert "N" not in all_labels


def test_no_bubbles_returns_none():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "CATATAN TANPA GRID BUBBLE", fontsize=10)
    runs = merge_runs(extract_spans_from_page(page, 0))
    grid, used_ids, axis_points = reconstruct_grid_from_geometry(page, runs)
    assert grid is None
    assert used_ids == set()
    assert axis_points == {"x": {}, "y": {}}
    doc.close()


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PDF PLHUT asli (env PAAX_PLHUT_PDF)")
def test_smoke_real_plhut_grid_matches_manual_anchor():
    """Nilai acuan dihitung manual dari geometri PDF asli (bubble+garis
    dimensi halaman 1), diverifikasi analitis SEBELUM kode ditulis — bukan
    ditebak mundur dari hasil kode. Lihat investigasi sesi ini utk detail."""
    with open(os.environ["PAAX_PLHUT_PDF"], "rb") as fh:
        pdf_bytes = fh.read()
    grid, _used = _grid_from_bytes(pdf_bytes, page_index=0)
    assert grid is not None
    sumbu_x = {a.label: a.posisi_mm for a in grid.sumbu_x}
    sumbu_y = {a.label: a.posisi_mm for a in grid.sumbu_y}
    assert sumbu_x == {"1": 0.0, "2": 5000.0, "3": 7000.0, "4": 10000.0}
    assert sumbu_y == {"A": 0.0, "B": 4000.0, "C": 8000.0, "D": 12000.0, "E": 16000.0, "F": 20000.0}
    assert grid.total_x is not None and grid.total_x.nilai == 10000.0
    assert grid.total_y is not None and grid.total_y.nilai == 20000.0
    assert len(grid.offset_tepi) == 1 and grid.offset_tepi[0].nilai == 1580.0
