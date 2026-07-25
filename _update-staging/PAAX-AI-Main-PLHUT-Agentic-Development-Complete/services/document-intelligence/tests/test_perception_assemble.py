"""
Fase 2 P3 — anchor test rakit persepsi -> TkgDocument (sintetis non-PLHUT, §0.1).

Nilai diverifikasi manual dari `_generate_synthetic_table_pdf.py`: tabel B1/B2
(gaya balok, BUKAN kolom K-series PLHUT), grid A-B=6000, level SFL +0.000,
elemen standalone K1 x3, dan satu teks yang sengaja tak cocok grammar apa pun.
"""
from __future__ import annotations

import os

import fitz
import pytest

from app.perception.assemble import assemble_document_from_pdf_bytes
from tests.fixtures.perception._generate_synthetic_table_pdf import build_synthetic_table_pdf_bytes


def test_synthetic_table_reconstructed_correctly():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    sheet = doc.sheets[0]

    assert len(sheet.tables) == 1
    records = {r.kode: r for r in sheet.tables[0].records}
    assert set(records.keys()) == {"B1", "B2"}

    b1 = records["B1"]
    assert b1.dimensi == {"b": 300.0, "h": 500.0}
    assert b1.satuan_dimensi == "mm"
    assert b1.kategori == "balok"
    tul_by_posisi = {t.posisi: t for t in b1.tulangan}
    assert tul_by_posisi["tul_utama"].jumlah == 4
    assert tul_by_posisi["tul_utama"].diameter_mm == 19
    assert tul_by_posisi["sengkang"].diameter_mm == 10
    assert tul_by_posisi["sengkang"].jarak_mm == 150


def test_synthetic_grid_reconstructed():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    sheet = doc.sheets[0]

    assert len(sheet.grid.bentang_x) == 1
    assert sheet.grid.bentang_x[0].dari == "A"
    assert sheet.grid.bentang_x[0].ke == "B"
    assert sheet.grid.bentang_x[0].nilai == 6000
    assert sheet.grid.total_x is not None
    assert sheet.grid.total_x.nilai == 6000


def test_synthetic_level_reconstructed():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    sheet = doc.sheets[0]
    assert len(sheet.levels) == 1
    assert sheet.levels[0].nilai_m == 0.0


def test_synthetic_standalone_element_counted():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    sheet = doc.sheets[0]
    k1 = next(e for e in sheet.elements if e.kode == "K1")
    assert k1.n == 3
    assert k1.count_label == 3
    assert k1.count_simbol is None  # deteksi simbol grafis belum diimplementasi


def test_unclassified_text_not_lost():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    sheet = doc.sheets[0]
    raws = [u.raw for u in sheet.unclassified]
    assert any("CATATAN UMUM PROYEK" in r for r in raws)


def test_document_is_valid_tkg_document_shape():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    dumped = doc.model_dump()
    assert dumped["prj_id"] == "TEST-P3"
    assert dumped["generated_by"] == "pipeline"


def test_metrics_reflect_classification():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    _doc, metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P3")
    m = metrics[0]
    assert m["run_total"] > 0
    assert m["n_unclassified"] >= 1  # "CATATAN UMUM PROYEK"
    assert 0.0 <= m["cakupan"] <= 1.0
    assert m["run_terklasifikasi"] + m["n_unclassified"] == m["run_total"]


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PAAX_PLHUT_PDF (materi PLHUT nyata di luar repo)")
def test_smoke_real_plhut_pdf_does_not_crash():
    """
    Uji asap JUJUR (bukan golden-match): pipeline harus jalan tanpa crash pada
    PDF nyata dan menghasilkan TkgDocument valid. TIDAK mengasumsikan hasil
    cocok golden transkrip-tangan (`test_plhut_golden.py`) — grid geometri
    (§3.1.1) dan label->grid binding (§5, lihat `test_smoke_real_plhut_
    footplat_alamat_matches_reference_positions` di bawah) sudah
    diimplementasikan, tapi masih ada gap: deteksi simbol grafis
    (count_simbol), konsolidasi lintas-halaman, dan grid yang HANYA bisa
    direkonstruksi dari bubble+dimensi-garis (bukan sheet tanpa bubble sama
    sekali, mis. sheet detail/tabel murni) belum tercakup.
    """
    pdf_path = os.environ["PAAX_PLHUT_PDF"]
    pdf_bytes = fitz.open(pdf_path).tobytes()
    doc, metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="PLHUT-SKA-2024")
    assert len(doc.sheets) > 0
    total_unclassified = sum(len(s.unclassified) for s in doc.sheets)
    total_elements = sum(len(s.elements) for s in doc.sheets)
    total_table_records = sum(len(t.records) for s in doc.sheets for t in s.tables)
    avg_cakupan = sum(m["cakupan"] for m in metrics) / len(metrics)
    print(
        f"[smoke PLHUT] sheets={len(doc.sheets)} unclassified={total_unclassified} "
        f"elements={total_elements} table_records={total_table_records} "
        f"avg_cakupan={avg_cakupan:.2%}"
    )


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PAAX_PLHUT_PDF (materi PLHUT nyata di luar repo)")
def test_smoke_real_plhut_footplat_alamat_matches_reference_positions():
    """Fase C (§5 binding). Nilai acuan = tabel referensi owner (`Downloads/
    paax_plhut_extraction_summary (1).md` §"High-confidence inferred
    placements") -- HANYA dipakai sbg bahan verifikasi (§0.1), bukan
    ditanam jadi logika. Dibandingkan sbg SET (bukan urutan) krn urutan
    ekstraksi tidak dijamin sama dgn urutan penulisan manual referensi."""
    pdf_path = os.environ["PAAX_PLHUT_PDF"]
    pdf_bytes = fitz.open(pdf_path).tobytes()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="PLHUT-SKA-2024")
    sheet0 = doc.sheets[0]
    by_kode = {e.kode: e for e in sheet0.elements}

    assert set(by_kode["PC1"].alamat_list) == {
        "A1", "B1", "C1", "D1", "E1", "F1", "A3", "B3", "C3", "D3", "E3", "F3",
    }
    assert by_kode["PC1"].alamat_needs_review is False

    assert set(by_kode["PC2"].alamat_list) == {"A4", "B4", "C4", "D4", "E4", "F4"}
    assert by_kode["PC2"].alamat_needs_review is False

    assert set(by_kode["PC3"].alamat_list) == {
        "B-offset_sebelum_1", "C-offset_sebelum_1", "D-offset_sebelum_1",
    }
    assert by_kode["PC3"].alamat_needs_review is False
