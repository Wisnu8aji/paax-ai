"""Fase B (rencana besar 2026-07-05) — test zone/judul/skala classifier.

Fixture SINTETIS (§0.1: judul/nilai beda dari PLHUT) membuktikan generalisasi;
smoke PLHUT (skipif) membandingkan ke nilai acuan yang sudah diverifikasi
manual terhadap PDF asli (lihat investigasi sesi ini).
"""
from __future__ import annotations

import os

import fitz
import pytest

from app.perception.assemble import assemble_document_from_pdf_bytes
from app.perception.ingest.span_extractor import extract_spans_from_page
from app.perception.vector.merge_run import merge_runs
from app.perception.zone_classifier import classify_zone, extract_judul, extract_skala


def _runs_for_text(lines: list[tuple[str, float, float, float]]) -> list:
    doc = fitz.open()
    page = doc.new_page()
    for text, x, y, fontsize in lines:
        page.insert_text((x, y), text, fontsize=fontsize)
    runs = merge_runs(extract_spans_from_page(page, 0))
    doc.close()
    return runs


def test_judul_and_zone_substruktur_synthetic():
    runs = _runs_for_text([("DENAH PONDASI TELAPAK", 50, 50, 12), ("A1", 50, 100, 10)])
    judul, used_ids = extract_judul(runs)
    assert judul == "DENAH PONDASI TELAPAK"
    assert classify_zone(judul) == "substruktur"
    assert len(used_ids) == 1


def test_judul_and_zone_struktur_lantai_2_synthetic():
    runs = _runs_for_text([("DENAH BALOK LT.2", 50, 50, 12)])
    judul, _used_ids = extract_judul(runs)
    assert judul == "DENAH BALOK LT.2"
    assert classify_zone(judul) == "struktur_lantai_2"


def test_judul_and_zone_struktur_atap_synthetic():
    runs = _runs_for_text([("DENAH RANGKA ATAP BAJA", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert classify_zone(judul) == "struktur_atap"


def test_judul_multiword_beats_repeated_single_word_label():
    """Label satu kata berulang (mis. header kolom "CATATAN") TIDAK boleh
    mengalahkan judul multi-kata asli walau frekuensinya lebih tinggi."""
    runs = _runs_for_text([
        ("CATATAN", 50, 50, 8), ("CATATAN", 50, 70, 8), ("CATATAN", 50, 90, 8),
        ("TABEL PROFIL BAJA RINGAN", 50, 120, 12),
    ])
    judul, used_ids = extract_judul(runs)
    assert judul == "TABEL PROFIL BAJA RINGAN"
    assert len(used_ids) == 1  # HANYA run judul asli, bukan 3x "CATATAN"


def test_skala_extraction_synthetic():
    runs = _runs_for_text([("DENAH ATAP", 50, 50, 12), ("SKALA 1 : 50", 50, 400, 8)])
    skala, used_ids = extract_skala(runs)
    assert skala == "1:50"
    assert len(used_ids) == 1


def test_skala_nts_synthetic():
    runs = _runs_for_text([("TABEL PROFIL", 50, 50, 12), ("NTS", 50, 400, 8)])
    skala, _ = extract_skala(runs)
    assert skala == "NTS"


def test_no_title_returns_none():
    runs = _runs_for_text([("CATATAN UMUM PROYEK", 50, 50, 10)])
    judul, used_ids = extract_judul(runs)
    assert judul is None
    assert used_ids == set()
    assert classify_zone(None) is None


def test_detail_tabel_fallback_without_floor_qualifier():
    runs = _runs_for_text([("TABEL KOLOM", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert classify_zone(judul) == "detail_tabel"


def test_judul_and_zone_daftar_gambar_synthetic():
    """Fase U-2 (2026-07-13): bukti nyata screenshot `G:\\gambar contoh`
    menunjukkan sheet daftar-gambar jatuh 'Belum diketahui' krn rule lama
    hanya kenal keyword struktur."""
    runs = _runs_for_text([("DAFTAR GAMBAR KERJA", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert judul == "DAFTAR GAMBAR KERJA"
    assert classify_zone(judul) == "daftar_gambar"


def test_judul_and_zone_daftar_singkatan_notasi_synthetic():
    """Bukti nyata: 'DAFTAR SINGKATAN DAN NOTASI GAMBAR' (halaman legenda,
    BUKAN daftar-gambar per se) juga masuk kategori `daftar_gambar` -- rule
    generik 'diawali DAFTAR' sengaja luas krn ini semua front-matter list,
    bukan pekerjaan struktur yang perlu takeoff."""
    runs = _runs_for_text([("DAFTAR SINGKATAN DAN NOTASI GAMBAR", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert classify_zone(judul) == "daftar_gambar"


def test_judul_and_zone_situasi_synthetic():
    runs = _runs_for_text([("SITUASI LOKASI PROYEK", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert classify_zone(judul) == "situasi"


def test_judul_and_zone_tampak_synthetic():
    runs = _runs_for_text([("TAMPAK DEPAN DAN SAMPING", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert judul == "TAMPAK DEPAN DAN SAMPING"
    assert classify_zone(judul) == "tampak"


def test_judul_and_zone_potongan_synthetic():
    runs = _runs_for_text([("POTONGAN A-A", 50, 50, 12)])
    judul, _ = extract_judul(runs)
    assert classify_zone(judul) == "potongan"


def test_cover_fallback_only_for_early_page_without_grid_or_elements():
    """Sheet tanpa judul/grid/elemen di antara 2 halaman pertama -> `cover`.
    Sheet SERUPA tapi bukan di halaman awal (mis. index 5) tetap jujur
    `None` -- heuristik posisi bukan bukti pasti (§0.1, jangan dipaksakan)."""
    assert classify_zone(None, page_index=0, has_grid=False, has_elements=False) == "cover"
    assert classify_zone(None, page_index=1, has_grid=False, has_elements=False) == "cover"
    assert classify_zone(None, page_index=5, has_grid=False, has_elements=False) is None
    assert classify_zone(None, page_index=0, has_grid=True, has_elements=False) is None
    assert classify_zone(None, page_index=0, has_grid=False, has_elements=True) is None


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PDF PLHUT asli (env PAAX_PLHUT_PDF)")
def test_smoke_real_plhut_zone_judul_skala_matches_manual_verification():
    """Nilai acuan diverifikasi manual terhadap 15 halaman PDF PLHUT asli
    sesi ini (bukan ditebak) - lihat investigasi zone_classifier."""
    with open(os.environ["PAAX_PLHUT_PDF"], "rb") as fh:
        pdf_bytes = fh.read()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="plhut-zone-smoke")
    assert len(doc.sheets) == 15

    expected = {
        "S01": ("DENAH FOOTPLAT", "1:100", "substruktur"),
        "S02": ("DENAH PONDASI BATU KALI", "1:100", "substruktur"),
        "S03": ("DENAH SLOOF", "1:100", "struktur_lantai_1"),
        "S04": ("DENAH KOLOM LANTAI 1", "1:100", "struktur_lantai_1"),
        "S05": ("DENAH KOLOM LANTAI 2", "1:100", "struktur_lantai_2"),
        "S06": ("DENAH BALOK LANTAI 2", "1:100", "struktur_lantai_2"),
        "S07": ("DENAH BALOK LANTAI ATAP", "1:100", "struktur_atap"),
        "S08": ("DENAH ATAP", "1:100", "struktur_atap"),
        "S09": ("DENAH BALOK LINTEL LT.1", "1:100", "struktur_lantai_1"),
        "S10": ("DENAH BALOK LINTEL LT 2", "1:100", "struktur_lantai_2"),
        "S11": ("DETAIL PONDASI", "1:100", "substruktur"),
        "S12": ("TABEL KOLOM", "1:20", "detail_tabel"),
        "S13": ("TABEL BALOK LANTAI 1 & SLOOF", "1:20", "struktur_lantai_1"),
        "S14": ("TABEL BALOK LANTAI 2", "1:20", "struktur_lantai_2"),
        "S15": ("TABEL PELAT", "NTS", "detail_tabel"),
    }
    for sheet in doc.sheets:
        exp_judul, exp_skala, exp_zone = expected[sheet.sheet_id]
        assert sheet.meta.judul == exp_judul, sheet.sheet_id
        assert sheet.meta.skala == exp_skala, sheet.sheet_id
        assert sheet.meta.zone == exp_zone, sheet.sheet_id
