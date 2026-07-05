"""Fase X2 (2026-07-05, dikerjakan langsung oleh Claude atas instruksi
owner) — test unit lapisan AI-assist (`app/perception/ai_assist/`).

Prinsip yang diuji (bukan cuma "jalan tanpa error"):
- Rule-based tetap fast-path: fungsi assist TIDAK dipanggil kalau tidak ada
  konteks teks sama sekali.
- Anti-halusinasi WAJIB: usulan model yang mengutip teks yang TIDAK ADA di
  input, atau angka yang tidak match ke `source_texts` yang dikutip, HARUS
  ditolak (`None`), bukan diloloskan.
- Rentang wajar WAJIB: angka di luar rentang dimensi footplat masuk akal
  ditolak walau "dikutip" dgn benar (mis. kebetulan menangkap tahun
  anggaran).
- Enum tertutup WAJIB utk zona: nilai zona di luar enum resmi (termasuk
  'tidak_yakin') ditolak sbg kandidat.
- Degradasi anggun: client yang mengembalikan `None` (gagal jaringan/parse)
  TIDAK membuat fungsi ini crash -- cukup mengembalikan `None`.

Test ini TIDAK PERNAH memanggil API Gemini sungguhan -- semua pakai
`FakeAiAssistClient` (stub in-memory) sesuai instruksi eksplisit owner.
"""
from __future__ import annotations

import json
from typing import Any
from urllib import error

import pytest

from app.perception.ai_assist.client import (
    GeminiAiAssistClient,
    NullAiAssistClient,
)
from app.perception.ai_assist.dimension_assist import suggest_footplat_dimensions
from app.perception.ai_assist.kuda_kuda_assist import suggest_kuda_kuda_profile
from app.perception.ai_assist.kusen_assist import suggest_kusen_schedule
from app.perception.ai_assist.mep_assist import suggest_mep_points
from app.perception.ai_assist.roof_frame_assist import suggest_roof_frame_dimensions
from app.perception.ai_assist.wall_assist import suggest_dinding_pasangan
from app.perception.ai_assist.zone_assist import ZONE_ENUM, suggest_zone


class FakeAiAssistClient:
    """Stub deterministik -- TIDAK pernah memanggil jaringan. Mengembalikan
    `response` yang sama utk setiap panggilan (cukup utk test unit ini krn
    tiap test hanya memanggil satu skenario)."""

    def __init__(self, response: dict[str, Any] | None):
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def generate_json(self, *, system_prompt: str, user_prompt: str, response_schema: dict[str, Any]):
        self.calls.append({
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "response_schema": response_schema,
        })
        return self.response


# --- dimension_assist.suggest_footplat_dimensions ---------------------------

def test_dimension_assist_accepts_valid_suggestion_with_matching_source_texts():
    detail_texts = ["P9", "900", "800", "kedalaman galian 450"]
    fake = FakeAiAssistClient({
        "b_mm": 900, "l_mm": 800, "d_gali_mm": 450,
        "confidence": 0.82,
        "reasoning": "900 dan 800 adalah dimensi dasar footplat P9, 450 kedalaman galian.",
        "source_texts": ["900", "800", "kedalaman galian 450"],
    })
    result = suggest_footplat_dimensions("P9", ["P 9"], detail_texts, fake)
    assert result is not None
    assert result.b_mm == 900
    assert result.l_mm == 800
    assert result.d_gali_mm == 450
    assert 0.0 <= result.confidence <= 1.0
    assert result.model == "gemini-2.5-flash"
    assert list(result.source_texts) == ["900", "800", "kedalaman galian 450"]
    assert len(fake.calls) == 1


def test_dimension_assist_rejects_hallucinated_number_not_in_source_texts():
    """Anti-halusinasi #2: model mengaku dasar b_mm=999 padahal 999 TIDAK
    pernah muncul di source_texts yang dikutip -- harus ditolak."""
    detail_texts = ["P9", "900", "800"]
    fake = FakeAiAssistClient({
        "b_mm": 999, "l_mm": 800, "d_gali_mm": None,
        "confidence": 0.9,
        "reasoning": "mengarang b_mm",
        "source_texts": ["900", "800"],
    })
    result = suggest_footplat_dimensions("P9", [], detail_texts, fake)
    assert result is None


def test_dimension_assist_rejects_source_text_not_present_in_input():
    """Anti-halusinasi #1: model 'mengutip' teks yang tidak pernah dikirim
    sbg detail_texts -- harus ditolak walau angkanya sendiri masuk akal."""
    detail_texts = ["P9", "900", "800"]
    fake = FakeAiAssistClient({
        "b_mm": 900, "l_mm": None, "d_gali_mm": None,
        "confidence": 0.7,
        "reasoning": "mengutip teks asing",
        "source_texts": ["900", "teks yang tidak pernah ada di halaman ini"],
    })
    result = suggest_footplat_dimensions("P9", [], detail_texts, fake)
    assert result is None


def test_dimension_assist_rejects_value_out_of_plausible_range():
    """Nilai di luar rentang wajar footplat (mis. kebetulan menangkap nomor
    halaman/tahun anggaran 4 digit besar '45000') ditolak walau dikutip dgn
    benar dari source_texts."""
    detail_texts = ["P9", "45000", "800"]
    fake = FakeAiAssistClient({
        "b_mm": 45000, "l_mm": 800, "d_gali_mm": None,
        "confidence": 0.6,
        "reasoning": "45000 dianggap lebar (SALAH, ini bukan dimensi footplat wajar)",
        "source_texts": ["45000", "800"],
    })
    result = suggest_footplat_dimensions("P9", [], detail_texts, fake)
    assert result is None


def test_dimension_assist_returns_none_without_detail_texts_and_does_not_call_client():
    fake = FakeAiAssistClient({"confidence": 1.0, "reasoning": "x", "source_texts": ["x"]})
    result = suggest_footplat_dimensions("P9", [], [], fake)
    assert result is None
    assert fake.calls == []


def test_dimension_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    result = suggest_footplat_dimensions("P9", [], ["900", "800"], fake)
    assert result is None


def test_dimension_assist_rejects_missing_reasoning_or_source_texts():
    detail_texts = ["900", "800"]
    fake = FakeAiAssistClient({
        "b_mm": 900, "l_mm": 800, "d_gali_mm": None,
        "confidence": 0.5, "reasoning": "", "source_texts": [],
    })
    result = suggest_footplat_dimensions("P9", [], detail_texts, fake)
    assert result is None


# --- zone_assist.suggest_zone -----------------------------------------------

def test_zone_assist_accepts_valid_enum_value():
    fake = FakeAiAssistClient({
        "zone": "situasi", "confidence": 0.75,
        "reasoning": "Judul memuat 'SITE PLAN KAWASAN' dan peta lokasi.",
    })
    result = suggest_zone("SITE PLAN KAWASAN", ["Skala 1:500"], fake)
    assert result is not None
    assert result.zone == "situasi"
    assert result.zone in ZONE_ENUM
    assert result.model == "gemini-2.5-flash"


def test_zone_assist_rejects_foreign_enum_value():
    fake = FakeAiAssistClient({
        "zone": "zona_asing_tidak_terdaftar", "confidence": 0.9,
        "reasoning": "mengarang kategori baru",
    })
    result = suggest_zone("JUDUL ANEH", [], fake)
    assert result is None


def test_zone_assist_rejects_tidak_yakin_as_candidate():
    """'tidak_yakin' valid sbg respons model (skema mengizinkannya), TAPI
    tetap bukan kandidat yang bisa dipakai -- caller harus tetap None."""
    fake = FakeAiAssistClient({
        "zone": "tidak_yakin", "confidence": 0.3,
        "reasoning": "tidak ada indikasi jelas",
    })
    result = suggest_zone("JUDUL SAMAR", [], fake)
    assert result is None


def test_zone_assist_rejects_missing_reasoning():
    fake = FakeAiAssistClient({"zone": "cover", "confidence": 0.5, "reasoning": ""})
    result = suggest_zone("SAMPUL", [], fake)
    assert result is None


def test_zone_assist_returns_none_without_any_context_and_does_not_call_client():
    fake = FakeAiAssistClient({"zone": "cover", "confidence": 1.0, "reasoning": "x"})
    result = suggest_zone(None, [], fake)
    assert result is None
    assert fake.calls == []


def test_zone_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    result = suggest_zone("JUDUL", ["teks lain"], fake)
    assert result is None


# --- wall_assist.suggest_dinding_pasangan (2026-07-05, lanjutan Fase X2) ----
# Dinding TIDAK PUNYA kode per-instance sama sekali (audit B0) -- konteksnya
# dokumen-luas (semua teks unclassified), bukan per-entry seperti footplat.

def test_wall_assist_accepts_valid_suggestion_with_matching_source_texts():
    texts = ["PANJANG DINDING KELILING 45.6 M", "TINGGI DINDING 3.0 M", "PASANGAN BATA 1/2"]
    fake = FakeAiAssistClient({
        "l_dinding_m": 45.6, "h_dinding_m": 3.0, "bukaan_total_m2": None,
        "plester_sisi": 2, "acian": True, "cat": True,
        "confidence": 0.75,
        "reasoning": "panjang & tinggi dinding disebut eksplisit di catatan",
        "source_texts": ["PANJANG DINDING KELILING 45.6 M", "TINGGI DINDING 3.0 M"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is not None
    assert result.l_dinding_m == 45.6
    assert result.h_dinding_m == 3.0
    assert result.plester_sisi == 2
    assert result.acian is True
    assert len(fake.calls) == 1


def test_wall_assist_returns_none_without_wall_keyword_and_does_not_call_client():
    """Fast filter GRATIS: tidak ada kata kunci dinding sama sekali di
    seluruh dokumen -> jangan panggil LLM sama sekali (hemat biaya)."""
    fake = FakeAiAssistClient({
        "l_dinding_m": 10.0, "h_dinding_m": 3.0, "confidence": 1.0,
        "reasoning": "x", "source_texts": ["x"],
    })
    result = suggest_dinding_pasangan(["KOLOM K1", "BALOK B1"], fake)
    assert result is None
    assert fake.calls == []


def test_wall_assist_rejects_hallucinated_source_text_not_in_input():
    texts = ["DINDING BATA TINGGI 3.0 M"]
    fake = FakeAiAssistClient({
        "l_dinding_m": 40.0, "h_dinding_m": 3.0, "confidence": 0.7,
        "reasoning": "mengutip teks asing",
        "source_texts": ["DINDING BATA TINGGI 3.0 M", "teks yang tidak pernah ada"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is None


def test_wall_assist_rejects_number_not_matching_source_texts():
    texts = ["DINDING BATA", "PANJANG 40 M", "TINGGI 3 M"]
    fake = FakeAiAssistClient({
        "l_dinding_m": 999.0, "h_dinding_m": 3.0, "confidence": 0.7,
        "reasoning": "mengarang panjang",
        "source_texts": ["PANJANG 40 M", "TINGGI 3 M"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is None


def test_wall_assist_rejects_length_out_of_plausible_range():
    texts = ["DINDING BATA", "PANJANG 450 M", "TINGGI 3 M"]
    fake = FakeAiAssistClient({
        "l_dinding_m": 450.0, "h_dinding_m": 3.0, "confidence": 0.7,
        "reasoning": "450m dianggap panjang dinding (tidak masuk akal utk 1 bangunan)",
        "source_texts": ["PANJANG 450 M", "TINGGI 3 M"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is None


def test_wall_assist_rejects_height_out_of_plausible_range():
    texts = ["DINDING BATA", "PANJANG 40 M", "TINGGI 25 M"]
    fake = FakeAiAssistClient({
        "l_dinding_m": 40.0, "h_dinding_m": 25.0, "confidence": 0.7,
        "reasoning": "25m dianggap tinggi dinding (tidak masuk akal)",
        "source_texts": ["PANJANG 40 M", "TINGGI 25 M"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is None


def test_wall_assist_rejects_when_neither_length_nor_height_found():
    texts = ["DINDING BATA 1/2 SEMUA SISI"]
    fake = FakeAiAssistClient({
        "l_dinding_m": None, "h_dinding_m": None, "confidence": 0.5,
        "reasoning": "tidak ada angka disebut", "source_texts": ["DINDING BATA 1/2 SEMUA SISI"],
    })
    result = suggest_dinding_pasangan(texts, fake)
    assert result is None


def test_wall_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    result = suggest_dinding_pasangan(["DINDING BATA", "PANJANG 40 M"], fake)
    assert result is None


# --- roof_frame_assist.suggest_roof_frame_dimensions (lanjutan Fase X2) -----
# gording/trekstang/ikatan_angin SUDAH dikenali taksonomi (beda dari
# dinding) -- gap murni bridging+kelengkapan dimensi, pola sama footplat
# TAPI semua field WAJIB lengkap sekaligus (tidak ada rumus parsial).

def test_roof_frame_assist_accepts_valid_gording_suggestion():
    texts = ["GD1", "L MIRING SISI 6 M", "JARAK GORDING 1.2 M", "L ARAH GORDING 8 M", "2 SISI ATAP"]
    fake = FakeAiAssistClient({
        "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2,
        "confidence": 0.8, "reasoning": "semua dimensi disebut eksplisit",
        "source_texts": ["L MIRING SISI 6 M", "JARAK GORDING 1.2 M", "L ARAH GORDING 8 M", "2 SISI ATAP"],
    })
    result = suggest_roof_frame_dimensions("gording", "GD1", ["GD1"], texts, fake)
    assert result is not None
    assert result.kategori == "gording"
    assert result.fields == {
        "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2.0,
    }


def test_roof_frame_assist_rejects_unknown_category():
    result = suggest_roof_frame_dimensions("kuda_kuda", "KD1", [], ["x"], FakeAiAssistClient({}))
    assert result is None


def test_roof_frame_assist_rejects_incomplete_fields_no_partial_allowed():
    """BEDA dari footplat: rumus gording butuh SEMUA field sekaligus --
    kalau satu saja hilang, seluruh usulan ditolak (bukan sebagian)."""
    texts = ["GD1", "L MIRING SISI 6 M"]
    fake = FakeAiAssistClient({
        "l_miring_sisi_m": 6.0, "s_gording_m": None, "l_arah_gording_m": None, "n_sisi_atap": None,
        "confidence": 0.5, "reasoning": "cuma satu field ketemu",
        "source_texts": ["L MIRING SISI 6 M"],
    })
    result = suggest_roof_frame_dimensions("gording", "GD1", ["GD1"], texts, fake)
    assert result is None


def test_roof_frame_assist_rejects_hallucinated_number():
    texts = ["TS1", "PANJANG BATANG 3 M", "JUMLAH 12"]
    fake = FakeAiAssistClient({
        "panjang_per_batang_m": 999.0, "jumlah": 12,
        "confidence": 0.7, "reasoning": "mengarang panjang batang",
        "source_texts": ["PANJANG BATANG 3 M", "JUMLAH 12"],
    })
    result = suggest_roof_frame_dimensions("trekstang", "TS1", ["TS1"], texts, fake)
    assert result is None


def test_roof_frame_assist_rejects_value_out_of_plausible_range():
    texts = ["IA1", "A 45 M", "B 5 M", "QTY 2"]
    fake = FakeAiAssistClient({
        "a_m": 45.0, "b_m": 5.0, "qty": 2,
        "confidence": 0.6, "reasoning": "45m tidak masuk akal utk ikatan angin",
        "source_texts": ["A 45 M", "B 5 M", "QTY 2"],
    })
    result = suggest_roof_frame_dimensions("ikatan_angin", "IA1", ["IA1"], texts, fake)
    assert result is None


def test_roof_frame_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    result = suggest_roof_frame_dimensions("trekstang", "TS1", [], ["x"], fake)
    assert result is None


# --- kuda_kuda_assist.suggest_kuda_kuda_profile (Task 02) ------------------
# Kuda-kuda baja profil beda dari gording/trekstang: berat kg/m adalah DATA
# dari teks gambar. Test ini memastikan nilai yang "benar secara umum" tetap
# ditolak kalau tidak muncul di source_texts/detail_texts.

def test_kuda_kuda_assist_accepts_complete_profile_from_matching_source_texts():
    texts = [
        "KD9",
        "PROFIL WF 200.100.5.5.8",
        "BERAT PROFIL 21.3 KG/M",
        "PANJANG BATANG 6.5 M",
        "JUMLAH 12 BATANG",
    ]
    fake = FakeAiAssistClient({
        "designation": "WF 200.100.5.5.8",
        "kg_per_m": 21.3,
        "length_m": 6.5,
        "qty": 12,
        "confidence": 0.82,
        "reasoning": "designasi, berat, panjang, dan jumlah disebut eksplisit.",
        "source_texts": [
            "PROFIL WF 200.100.5.5.8",
            "BERAT PROFIL 21.3 KG/M",
            "PANJANG BATANG 6.5 M",
            "JUMLAH 12 BATANG",
        ],
    })

    result = suggest_kuda_kuda_profile("KD9", ["KD 9"], texts, fake)

    assert result is not None
    assert result.designation == "WF 200.100.5.5.8"
    assert result.kg_per_m == 21.3
    assert result.length_m == 6.5
    assert result.qty == 12
    assert result.model == "gemini-2.5-flash"


def test_kuda_kuda_assist_rejects_designation_not_present_in_source_texts():
    texts = ["KD9", "PROFIL WF 200.100.5.5.8", "BERAT PROFIL 21.3 KG/M", "PANJANG 6.5 M", "JUMLAH 12"]
    fake = FakeAiAssistClient({
        "designation": "WF 250.125.6.9",
        "kg_per_m": 21.3,
        "length_m": 6.5,
        "qty": 12,
        "confidence": 0.8,
        "reasoning": "designasi dikarang",
        "source_texts": ["BERAT PROFIL 21.3 KG/M", "PANJANG 6.5 M", "JUMLAH 12"],
    })

    result = suggest_kuda_kuda_profile("KD9", [], texts, fake)

    assert result is None


def test_kuda_kuda_assist_rejects_hallucinated_kg_per_m_not_in_source_texts():
    texts = ["KD9", "PROFIL WF 200.100.5.5.8", "PANJANG 6.5 M", "JUMLAH 12"]
    fake = FakeAiAssistClient({
        "designation": "WF 200.100.5.5.8",
        "kg_per_m": 21.3,
        "length_m": 6.5,
        "qty": 12,
        "confidence": 0.8,
        "reasoning": "berat diisi dari pengetahuan umum, bukan teks",
        "source_texts": ["PROFIL WF 200.100.5.5.8", "PANJANG 6.5 M", "JUMLAH 12"],
    })

    result = suggest_kuda_kuda_profile("KD9", [], texts, fake)

    assert result is None


def test_kuda_kuda_assist_rejects_missing_required_field_no_partial_allowed():
    texts = ["KD9", "PROFIL WF 200.100.5.5.8", "BERAT PROFIL 21.3 KG/M", "PANJANG 6.5 M"]
    fake = FakeAiAssistClient({
        "designation": "WF 200.100.5.5.8",
        "kg_per_m": 21.3,
        "length_m": 6.5,
        "qty": None,
        "confidence": 0.8,
        "reasoning": "jumlah tidak disebut",
        "source_texts": ["PROFIL WF 200.100.5.5.8", "BERAT PROFIL 21.3 KG/M", "PANJANG 6.5 M"],
    })

    result = suggest_kuda_kuda_profile("KD9", [], texts, fake)

    assert result is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("kg_per_m", 350.0),
        ("length_m", 25.0),
        ("qty", 750),
    ],
)
def test_kuda_kuda_assist_rejects_values_out_of_plausible_range(field: str, value: float):
    texts = [
        "KD9",
        "PROFIL WF 200.100.5.5.8",
        f"BERAT PROFIL {value if field == 'kg_per_m' else 21.3} KG/M",
        f"PANJANG {value if field == 'length_m' else 6.5} M",
        f"JUMLAH {value if field == 'qty' else 12}",
    ]
    payload = {
        "designation": "WF 200.100.5.5.8",
        "kg_per_m": 21.3,
        "length_m": 6.5,
        "qty": 12,
        "confidence": 0.8,
        "reasoning": "angka dikutip tapi di luar rentang wajar",
        "source_texts": texts[1:],
    }
    payload[field] = value

    result = suggest_kuda_kuda_profile("KD9", [], texts, FakeAiAssistClient(payload))

    assert result is None


def test_kuda_kuda_assist_degrades_gracefully_when_client_returns_none():
    result = suggest_kuda_kuda_profile("KD9", [], ["KD9"], FakeAiAssistClient(None))
    assert result is None


def test_kuda_kuda_assist_rejects_standard_weight_when_not_sourced_from_text():
    """Nilai bisa saja benar menurut tabel baja umum, tapi kalau angka itu
    tidak ada di teks gambar, tetap wajib ditolak."""
    texts = ["KD9", "PROFIL WF 150.75.5.7", "PANJANG 5.5 M", "JUMLAH 8"]
    fake = FakeAiAssistClient({
        "designation": "WF 150.75.5.7",
        "kg_per_m": 14.0,
        "length_m": 5.5,
        "qty": 8,
        "confidence": 0.9,
        "reasoning": "berat diambil dari tabel baja umum, bukan teks gambar",
        "source_texts": ["PROFIL WF 150.75.5.7", "PANJANG 5.5 M", "JUMLAH 8"],
    })

    result = suggest_kuda_kuda_profile("KD9", [], texts, fake)

    assert result is None


# --- kusen_assist.suggest_kusen_schedule (lanjutan Fase X2) -----------------
# Beda dari roof_frame (satu elemen, all-or-nothing): jadwal kusen bisa
# banyak baris sekaligus, tiap baris divalidasi INDEPENDEN.

def test_kusen_assist_accepts_multiple_valid_rows():
    texts = ["JADWAL PINTU JENDELA", "P1 0.8X2.1 JUMLAH 6", "J1 0.6X1.2 JUMLAH 10"]
    fake = FakeAiAssistClient({
        "items": [
            {"tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
             "source_texts": ["P1 0.8X2.1 JUMLAH 6"]},
            {"tipe": "J1", "width_m": 0.6, "height_m": 1.2, "qty": 10,
             "source_texts": ["J1 0.6X1.2 JUMLAH 10"]},
        ],
    })
    results = suggest_kusen_schedule(texts, fake)
    assert len(results) == 2
    assert {r.tipe for r in results} == {"P1", "J1"}
    p1 = next(r for r in results if r.tipe == "P1")
    assert p1.width_m == 0.8 and p1.height_m == 2.1 and p1.qty == 6


def test_kusen_assist_returns_empty_without_kusen_keyword_and_does_not_call_client():
    fake = FakeAiAssistClient({"items": [{"tipe": "P1", "source_texts": ["x"]}]})
    results = suggest_kusen_schedule(["KOLOM K1", "BALOK B1"], fake)
    assert results == []
    assert fake.calls == []


def test_kusen_assist_drops_only_invalid_row_keeps_valid_ones():
    """Baris gagal validasi DIBUANG SENDIRI -- tidak menggagalkan baris
    lain yang valid (beda dari roof_frame yang all-or-nothing)."""
    texts = ["JADWAL PINTU", "P1 0.8X2.1 JUMLAH 6", "P2 lebar tidak disebutkan"]
    fake = FakeAiAssistClient({
        "items": [
            {"tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
             "source_texts": ["P1 0.8X2.1 JUMLAH 6"]},
            {"tipe": "P2", "width_m": 999.0, "height_m": None, "qty": None,
             "source_texts": ["P2 lebar tidak disebutkan"]},  # halusinasi + tidak lengkap
        ],
    })
    results = suggest_kusen_schedule(texts, fake)
    assert len(results) == 1
    assert results[0].tipe == "P1"


def test_kusen_assist_rejects_row_with_hallucinated_source_text():
    texts = ["JADWAL PINTU", "P1 0.8X2.1 JUMLAH 6"]
    fake = FakeAiAssistClient({
        "items": [
            {"tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
             "source_texts": ["teks yang tidak pernah ada"]},
        ],
    })
    results = suggest_kusen_schedule(texts, fake)
    assert results == []


def test_kusen_assist_rejects_dimension_out_of_plausible_range():
    texts = ["JADWAL PINTU", "P1 8000X2.1 JUMLAH 6"]
    fake = FakeAiAssistClient({
        "items": [
            {"tipe": "P1", "width_m": 8000.0, "height_m": 2.1, "qty": 6,
             "source_texts": ["P1 8000X2.1 JUMLAH 6"]},
        ],
    })
    results = suggest_kusen_schedule(texts, fake)
    assert results == []


def test_kusen_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    results = suggest_kusen_schedule(["JADWAL PINTU", "P1 80X210"], fake)
    assert results == []


# --- mep_assist.suggest_mep_points (slice TERAKHIR rangkaian X2 lanjutan) ---
# HANYA dari catatan jumlah eksplisit -- TIDAK mencoba hitung simbol/ikon
# dari piksel (di luar cakupan, deteksi vision-on-pixel tetap dihindari).

def test_mep_assist_accepts_multiple_valid_rows():
    texts = ["TOTAL TITIK LAMPU 12", "JUMLAH STOP KONTAK 8"]
    fake = FakeAiAssistClient({
        "items": [
            {"jenis": "lampu", "count": 12, "source_texts": ["TOTAL TITIK LAMPU 12"]},
            {"jenis": "stop_kontak", "count": 8, "source_texts": ["JUMLAH STOP KONTAK 8"]},
        ],
    })
    results = suggest_mep_points(texts, fake)
    assert len(results) == 2
    assert {r.jenis for r in results} == {"lampu", "stop_kontak"}
    lampu = next(r for r in results if r.jenis == "lampu")
    assert lampu.count == 12


def test_mep_assist_returns_empty_without_keyword_and_does_not_call_client():
    fake = FakeAiAssistClient({"items": [{"jenis": "lampu", "count": 12, "source_texts": ["x"]}]})
    results = suggest_mep_points(["KOLOM K1", "BALOK B1"], fake)
    assert results == []
    assert fake.calls == []


def test_mep_assist_drops_only_invalid_row_keeps_valid_ones():
    texts = ["TOTAL TITIK LAMPU 12", "SAKLAR tanpa jumlah disebut"]
    fake = FakeAiAssistClient({
        "items": [
            {"jenis": "lampu", "count": 12, "source_texts": ["TOTAL TITIK LAMPU 12"]},
            {"jenis": "saklar", "count": None, "source_texts": ["SAKLAR tanpa jumlah disebut"]},
        ],
    })
    results = suggest_mep_points(texts, fake)
    assert len(results) == 1
    assert results[0].jenis == "lampu"


def test_mep_assist_rejects_hallucinated_count():
    texts = ["TOTAL TITIK LAMPU 12"]
    fake = FakeAiAssistClient({
        "items": [{"jenis": "lampu", "count": 999, "source_texts": ["TOTAL TITIK LAMPU 12"]}],
    })
    results = suggest_mep_points(texts, fake)
    assert results == []


def test_mep_assist_rejects_count_out_of_plausible_range():
    texts = ["TOTAL TITIK LAMPU 5000"]
    fake = FakeAiAssistClient({
        "items": [{"jenis": "lampu", "count": 5000, "source_texts": ["TOTAL TITIK LAMPU 5000"]}],
    })
    results = suggest_mep_points(texts, fake)
    assert results == []


def test_mep_assist_degrades_gracefully_when_client_returns_none():
    fake = FakeAiAssistClient(None)
    results = suggest_mep_points(["TOTAL TITIK LAMPU 12"], fake)
    assert results == []


# --- client.py: degradasi anggun + parsing (tanpa panggilan jaringan nyata) --

def test_null_client_always_returns_none():
    client = NullAiAssistClient()
    assert client.generate_json(system_prompt="s", user_prompt="u", response_schema={}) is None


def test_gemini_client_from_env_returns_none_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert GeminiAiAssistClient.from_env() is None


def test_gemini_client_from_env_returns_instance_with_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-for-test")
    client = GeminiAiAssistClient.from_env()
    assert client is not None
    assert client.api_key == "fake-key-for-test"


class _FakeHttpResponse:
    def __init__(self, payload: dict[str, Any]):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc: Any) -> None:
        return None


def test_gemini_client_parses_valid_response_without_real_network_call(monkeypatch):
    """Monkeypatch `urlopen` supaya test ini TIDAK PERNAH memanggil jaringan
    sungguhan, tapi tetap membuktikan parsing response Gemini bekerja."""
    gemini_payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps({"zone": "cover", "confidence": 0.9, "reasoning": "ok"})}]}}
        ]
    }

    def fake_urlopen(req, timeout):
        return _FakeHttpResponse(gemini_payload)

    monkeypatch.setattr("app.perception.ai_assist.client.request.urlopen", fake_urlopen)
    client = GeminiAiAssistClient(api_key="fake-key")
    result = client.generate_json(system_prompt="s", user_prompt="u", response_schema={})
    assert result == {"zone": "cover", "confidence": 0.9, "reasoning": "ok"}


def test_gemini_client_degrades_gracefully_on_network_error(monkeypatch):
    def fake_urlopen(req, timeout):
        raise error.URLError("simulated network failure")

    monkeypatch.setattr("app.perception.ai_assist.client.request.urlopen", fake_urlopen)
    client = GeminiAiAssistClient(api_key="fake-key")
    result = client.generate_json(system_prompt="s", user_prompt="u", response_schema={})
    assert result is None


def test_gemini_client_degrades_gracefully_on_malformed_response(monkeypatch):
    def fake_urlopen(req, timeout):
        return _FakeHttpResponse({"candidates": []})

    monkeypatch.setattr("app.perception.ai_assist.client.request.urlopen", fake_urlopen)
    client = GeminiAiAssistClient(api_key="fake-key")
    result = client.generate_json(system_prompt="s", user_prompt="u", response_schema={})
    assert result is None
