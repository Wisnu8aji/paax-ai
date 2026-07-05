"""Fase T (rencana besar 2026-07-13) — test `app.mapping.takeoff_ahsp`.

Anchor nyata: skor diverifikasi LANGSUNG thd `data/ahsp/cipta-karya-2026.json`
via skrip repro sesi ini (dicatat di komentar modul `takeoff_ahsp.py`) sebelum
jadi assert -- bukan tebakan. Fixture sintetis (§0.1) membuktikan pipeline
general di katalog KECIL buatan sendiri, bukan kebetulan cocok cuma di
katalog CK 2026.
"""
from __future__ import annotations

from pathlib import Path

from app.mapping.takeoff_ahsp import suggest_ahsp_for_item, suggest_ahsp_for_takeoff
from app.rab.loader import load_data
from app.rab.models import AHSPItem
from app.tkg.takeoff import TakeoffItem, takeoff_tkg

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_tkg import buat_tkg  # noqa: E402


REAL_AHSP = load_data().ahsp


# ─── Anchor katalog NYATA (CK 2026) ───────────────────────────────────────────

def test_bekisting_pondasi_telapak_auto_suggest_confident_real_catalog():
    """Anchor nyata terverifikasi: 'bekisting fondasi telapak' skor 0.5833
    thd kandidat #2 0.3500 (margin 0.2333) -- frasa 2-kata "Fondasi Telapak"
    tidak punya kompetitor dekat di katalog CK 2026, auto-suggest AMAN."""
    suggestion = suggest_ahsp_for_item(
        kode="P1", lantai=None, kategori="pondasi_telapak", work_type="bekisting",
        unit="m2", mutu_beton=None, ahsp_index=REAL_AHSP,
    )
    assert suggestion.ahsp_suggested is True
    assert suggestion.ahsp_code == "2.2.1.3.1"
    assert len(suggestion.ahsp_candidates) == 3


def test_besi_kolom_ambiguous_diameter_tidak_auto_suggest_real_catalog():
    """Anchor nyata: katalog CK 2026 hanya bedakan besi by DIAMETER (<12mm
    vs >=12mm) & METODE -- info yang TIDAK tersedia di TakeoffItem sekarang.
    Margin cuma ~0.04, di bawah ambang -> SAH tidak auto-suggest, TAPI
    kandidat tetap tampil (bukan kosong) supaya user bisa pilih manual."""
    suggestion = suggest_ahsp_for_item(
        kode="K1", lantai="LT1", kategori="kolom", work_type="besi",
        unit="kg", mutu_beton=None, ahsp_index=REAL_AHSP,
    )
    assert suggestion.ahsp_suggested is False
    assert suggestion.ahsp_code == ""
    assert len(suggestion.ahsp_candidates) == 3  # tetap tampil, tidak dipaksakan kosong


def test_beton_fc25_tie_dgn_boilerplate_slump_tidak_auto_suggest_real_catalog():
    """Anchor nyata paling penting: token '25' collide dgn boilerplate
    'Slump (100 ± 25) mm' yang ADA DI SETIAP item beton keluarga resmi ini,
    jadi 3 item resmi (fc20-manual, fc21-manual, fc25-semi-mekanis) skor
    PERSIS SAMA di antara mereka (margin=0). Kandidat #1 aktual malah item
    sample lawas `AHSP.CK.003` (nama pendek -> union kecil -> skor lebih
    tinggi, temuan data-hygiene terpisah: sample 4-item bisa ungguli
    katalog resmi di token-overlap) tapi margin ke #2 tetap kecil (~0.03),
    JADI DUA-DUANYA alasan auto-suggest tidak lolos ambang -- bukan bug."""
    suggestion = suggest_ahsp_for_item(
        kode="K1", lantai="LT1", kategori="kolom", work_type="beton",
        unit="m3", mutu_beton="fc' 25", ahsp_index=REAL_AHSP, top_k=5,
    )
    assert suggestion.ahsp_suggested is False
    assert suggestion.ahsp_code == ""
    resmi = [c for c in suggestion.ahsp_candidates if c.ahsp_code.startswith(("2.2.1.4", "2.2.1.5"))]
    assert len(resmi) >= 3
    assert len({c.score for c in resmi}) == 1  # 3 item resmi (fc20/fc21/fc25) tetap tie persis di antara mereka


def test_mutu_beton_notasi_k_tidak_dikonversi_paksa():
    """Notasi 'K-300' (bukan 'fc ...') TIDAK dikonversi (butuh rumus K->fc
    yang tidak aman ditebak) -- fallback query generik dipakai, bukan
    salah tebak angka fc."""
    suggestion = suggest_ahsp_for_item(
        kode="K2", lantai="LT1", kategori="kolom", work_type="beton",
        unit="m3", mutu_beton="K-300", ahsp_index=REAL_AHSP,
    )
    assert suggestion.ahsp_candidates  # tetap ada kandidat dari fallback generik
    assert suggestion.ahsp_suggested is False


# ─── End-to-end lewat pipeline takeoff nyata (buat_tkg dari test_tkg.py) ──────

def test_end_to_end_takeoff_tkg_lalu_suggest_ahsp_real_catalog():
    """Anchor nyata terverifikasi: `buat_tkg()` -> `takeoff_tkg()` -> SL1
    (sloof) menghasilkan 3 item siap (beton/bekisting/besi, K1/kolom butuh
    parameter tinggi tambahan jadi needs_review & DILEWATI, konsisten
    `sendToRab` existing). Dari 3 item SL1: HANYA bekisting yang confident
    (cocok persis '2.2.1.3.2 Bekisting Sloof'), beton & besi tidak (sama
    dgn temuan anchor terpisah di atas)."""
    doc = buat_tkg()
    takeoff = takeoff_tkg(doc)
    suggestions = suggest_ahsp_for_takeoff(takeoff.items, REAL_AHSP)

    ready_items = [i for i in takeoff.items if i.quantity is not None]
    assert len(ready_items) == 3
    assert {i.kode for i in ready_items} == {"SL1"}
    assert len(suggestions) == 3

    by_work_type = {s.work_type: s for s in suggestions}
    assert by_work_type["bekisting"].ahsp_suggested is True
    assert by_work_type["bekisting"].ahsp_code == "2.2.1.3.2"
    assert by_work_type["beton"].ahsp_suggested is False
    assert by_work_type["besi"].ahsp_suggested is False


def test_needs_review_items_dilewati_konsisten_sendtorab():
    doc = buat_tkg()
    takeoff = takeoff_tkg(doc)
    n_needs_review = sum(1 for i in takeoff.items if i.quantity is None)
    assert n_needs_review > 0  # K1 butuh param tambahan -> needs_review (fakta fixture ini)
    suggestions = suggest_ahsp_for_takeoff(takeoff.items, REAL_AHSP)
    assert len(suggestions) == len(takeoff.items) - n_needs_review


# ─── Fixture AHSP SINTETIS (§0.1 — bukan katalog CK 2026, buktikan general) ───

def _katalog_sintetis() -> dict[str, AHSPItem]:
    def item(code: str, name: str, unit: str) -> AHSPItem:
        return AHSPItem(code=code, name=name, unit=unit, components=[])

    entries = [
        item("X.BETON.01", "Pengecoran kolom beton mutu sedang fc 20 mpa manual", "m3"),
        item("X.BETON.02", "Pengecoran sloof beton mutu sedang fc 20 mpa manual", "m3"),
        item("X.BEK.01", "Pasang bekisting kolom kayu", "m2"),
        item("X.BEK.02", "Pasang bekisting sloof kayu", "m2"),
        item("X.BEK.03", "Pasang bekisting balok kayu", "m2"),
        item("X.BEK.04", "Pasang bekisting plat lantai kayu", "m2"),
        item("X.BEK.05", "Pasang bekisting fondasi telapak batu", "m2"),
        item("X.BESI.01", "Pembesian kolom balok ring balok sloof bjtp ulir", "kg"),
        item("X.BESI.02", "Pembesian slab bjtp polos", "kg"),
        item("X.LAIN.01", "Pengecatan dinding tembok", "m2"),
        item("X.LAIN.02", "Pemasangan keramik lantai 30x30", "m2"),
        item("X.LAIN.03", "Galian tanah biasa manual", "m3"),
    ]
    return {i.code: i for i in entries}


def test_sintetis_bekisting_kolom_auto_suggest_confident():
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="KX1", lantai=None, kategori="kolom", work_type="bekisting",
        unit="m2", mutu_beton=None, ahsp_index=katalog,
    )
    assert suggestion.ahsp_suggested is True
    assert suggestion.ahsp_code == "X.BEK.01"


def test_sintetis_bekisting_pondasi_telapak_auto_suggest_confident():
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="PDX1", lantai=None, kategori="pondasi_telapak", work_type="bekisting",
        unit="m2", mutu_beton=None, ahsp_index=katalog,
    )
    assert suggestion.ahsp_suggested is True
    assert suggestion.ahsp_code == "X.BEK.05"


def test_sintetis_besi_kolom_auto_suggest_confident_tanpa_kompetitor_diameter():
    """Katalog sintetis ini sengaja HANYA punya 1 item struktur besi (tidak
    ada varian diameter<12mm/>=12mm seperti katalog CK 2026 nyata) --
    membuktikan mekanisme margin BEKERJA (bisa auto-suggest) saat memang
    tidak ada kompetitor dekat, bukan modul ini yang selalu menolak."""
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="KX1", lantai=None, kategori="kolom", work_type="besi",
        unit="kg", mutu_beton=None, ahsp_index=katalog,
    )
    assert suggestion.ahsp_suggested is True
    assert suggestion.ahsp_code == "X.BESI.01"


def test_sintetis_besi_plat_auto_suggest_confident():
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="PLX1", lantai=None, kategori="plat", work_type="besi",
        unit="kg", mutu_beton=None, ahsp_index=katalog,
    )
    assert suggestion.ahsp_suggested is True
    assert suggestion.ahsp_code == "X.BESI.02"


def test_sintetis_beton_tanpa_kata_kategori_tidak_bisa_bedakan_kolom_sloof():
    """Query fc-based TIDAK menyertakan kata kategori ("kolom"/"sloof"), jadi
    kedua item beton sintetis (kolom & sloof, keduanya fc20) SKOR SAMA --
    replikasi jujur temuan katalog nyata dgn data yang sama sekali beda."""
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="KX1", lantai=None, kategori="kolom", work_type="beton",
        unit="m3", mutu_beton="fc' 20", ahsp_index=katalog,
    )
    assert suggestion.ahsp_suggested is False
    scores = {c.score for c in suggestion.ahsp_candidates[:2]}
    assert len(scores) == 1


def test_sintetis_kategori_tanpa_kamus_tetap_dapat_kandidat_via_fallback():
    """Kategori 'tangga' work_type 'besi' TIDAK ada di `_BESI_QUERY` --
    fallback generik tetap menghasilkan kandidat (bukan list kosong/error),
    hanya saja hampir pasti tidak lolos ambang auto-suggest."""
    katalog = _katalog_sintetis()
    suggestion = suggest_ahsp_for_item(
        kode="TX1", lantai=None, kategori="tangga", work_type="besi",
        unit="kg", mutu_beton=None, ahsp_index=katalog,
    )
    assert suggestion.ahsp_candidates  # tidak kosong
    assert "belum ada kamus" not in suggestion.reason  # fallback generik tetap jalan, bukan skip total


def test_takeoff_ahsp_suggestion_via_takeoffitem_pydantic_langsung():
    """`suggest_ahsp_for_takeoff` menerima `List[TakeoffItem]` pydantic asli
    (bukan cuma primitif) -- item needs_review (quantity=None) DILEWATI."""
    katalog = _katalog_sintetis()
    items = [
        TakeoffItem(
            kode="KX9", kategori="kolom", work_type="bekisting", quantity=12.0,
            unit="m2", formula="F-C01", detail="uji", rule_id="F-C01",
        ),
        TakeoffItem(
            kode="KX10", kategori="kolom", work_type="bekisting", quantity=None,
            unit="m2", formula="F-C01", detail="butuh review", rule_id="F-C01",
            needs_review=True, review_reason="uji",
        ),
    ]
    suggestions = suggest_ahsp_for_takeoff(items, katalog)
    assert len(suggestions) == 1
    assert suggestions[0].kode == "KX9"
    assert suggestions[0].ahsp_suggested is True
