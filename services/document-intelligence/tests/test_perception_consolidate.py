"""Fase E (rencana besar 2026-07-05) — test `consolidate.consolidate_document`.

Fixture sintetis (§0.1) membangun `TkgDocument` LANGSUNG (bukan lewat PDF)
supaya cepat menguji logika konsolidasi murni; smoke PLHUT (skipif) menguji
sanity terhadap dokumen 15-halaman nyata.
"""
from __future__ import annotations

import os

import fitz
import pytest

from app.perception.assemble import assemble_document_from_pdf_bytes
from app.perception.consolidate import consolidate_document
from app.perception.tkg.models import (
    ElementInstance,
    Grid,
    GridAxis,
    GridTotal,
    RebarSpec,
    SheetMeta,
    TkgDocument,
    TkgSheet,
    TkgTable,
    TypeRecord,
    Unclassified,
)


def _doc(sheets: list[TkgSheet]) -> TkgDocument:
    return TkgDocument(prj_id="TEST-E", sheets=sheets)


def test_canonical_grid_picks_most_complete():
    sheet_partial = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0)]),
    )
    sheet_full = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH Y"),
        grid=Grid(
            sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)],
            sumbu_y=[GridAxis(label="P", posisi_mm=0.0), GridAxis(label="Q", posisi_mm=4000.0)],
        ),
    )
    result = consolidate_document(_doc([sheet_partial, sheet_full]))
    assert result.grid is not None
    assert {a.label for a in result.grid.sumbu_x} == {"1", "2"}
    assert {a.label for a in result.grid.sumbu_y} == {"P", "Q"}


def test_grid_conflict_flagged_not_overwritten():
    canonical = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)]),
    )
    conflicting = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH Y"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=9999.0)]),
    )
    result = consolidate_document(_doc([canonical, conflicting]))
    assert result.grid is not None
    assert next(a.posisi_mm for a in result.grid.sumbu_x if a.label == "2") == 3000.0
    conflict_msgs = [a for a in result.assumptions if a.dampak == "tinggi"]
    assert len(conflict_msgs) == 1
    assert "2" in conflict_msgs[0].pernyataan


def test_element_registry_merges_instances_across_sheets():
    sheet1 = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.1"),
        elements=[ElementInstance(kode="K1", alamat="A1, B1", alamat_list=["A1", "B1"], n=2, count_label=2)],
    )
    sheet2 = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.2"),
        elements=[ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1)],
    )
    result = consolidate_document(_doc([sheet1, sheet2]))
    entry = next(e for e in result.element_registry if e.kode == "K1")
    assert len(entry.instances) == 3
    assert {(i.sheet_page, i.alamat) for i in entry.instances} == {(1, "A1"), (1, "B1"), (2, "A1")}


def test_element_registry_binds_table_definition():
    sheet = TkgSheet(
        sheet_id="S1", jenis="tabel", meta=SheetMeta(judul="TABEL KOLOM"),
        elements=[ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1)],
        tables=[TkgTable(judul="tabel kolom", records=[
            TypeRecord(kode="K1", kategori="kolom", dimensi={"b": 400.0, "h": 400.0},
                       tulangan=[RebarSpec(posisi="tul_utama", raw="12D16", jumlah=12, diameter_mm=16)]),
        ])],
    )
    result = consolidate_document(_doc([sheet]))
    entry = next(e for e in result.element_registry if e.kode == "K1")
    assert entry.kategori == "kolom"
    assert entry.definisi is not None
    assert entry.definisi.dimensi == {"b": 400.0, "h": 400.0}
    assert entry.definisi.tulangan[0].jumlah == 12


def test_needs_review_element_marks_registry_status_and_assumption():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        elements=[ElementInstance(
            kode="K9", alamat="dekat Z9 (perlu verifikasi)",
            alamat_list=["dekat Z9 (perlu verifikasi)"], alamat_needs_review=True, n=1, count_label=1,
        )],
    )
    result = consolidate_document(_doc([sheet]))
    entry = next(e for e in result.element_registry if e.kode == "K9")
    assert entry.status == "perlu_review"
    assert any("K9" in a.pernyataan for a in result.assumptions)


def test_unclassified_becomes_assumption_with_page_reference():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        unclassified=[Unclassified(raw="CATATAN ANEH", alasan="tidak cocok grammar apa pun")],
    )
    result = consolidate_document(_doc([sheet]))
    assumption = next(a for a in result.assumptions if "CATATAN ANEH" in a.pernyataan)
    assert assumption.sheet_page == 1
    assert assumption.dampak == "rendah"


def test_building_dimensions_from_canonical_grid_total():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(
            sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)],
            total_x=GridTotal(dari="1", ke="2", nilai=3000.0),
            total_y=GridTotal(dari="P", ke="Q", nilai=4000.0),
        ),
    )
    result = consolidate_document(_doc([sheet]))
    assert result.building_dimensions.total_x_mm == 3000.0
    assert result.building_dimensions.total_y_mm == 4000.0
    assert result.building_dimensions.sumber == "grid"


def test_no_grid_anywhere_reports_honest_unavailable():
    sheet = TkgSheet(sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"))
    result = consolidate_document(_doc([sheet]))
    assert result.grid is None
    assert result.building_dimensions.sumber == "tidak_tersedia"
    assert result.building_dimensions.total_x_mm is None


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PDF PLHUT asli (env PAAX_PLHUT_PDF)")
def test_smoke_real_plhut_consolidation_sane():
    with open(os.environ["PAAX_PLHUT_PDF"], "rb") as fh:
        pdf_bytes = fh.read()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="plhut-consolidate-smoke")
    result = consolidate_document(doc)
    assert len(result.sheets) == 15
    assert result.building_dimensions.total_x_mm == 10000.0
    assert result.building_dimensions.total_y_mm == 20000.0
    pc1 = next(e for e in result.element_registry if e.kode == "PC1")
    assert len(pc1.instances) == 12
    assert pc1.status == "terbaca"
