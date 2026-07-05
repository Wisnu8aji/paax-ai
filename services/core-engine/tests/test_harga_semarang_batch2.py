from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from scripts.harga.semarang_batch2_report import classify_batch2_row  # noqa: E402


def test_batch2_match_besi_profil_ke_baja_profil_dengan_alias_ketat():
    row = {
        "source_name": "Besi profil",
        "source_unit": "kg",
        "source_category": "bahan",
        "source_price": 12000,
        "source_row": 42,
    }
    catalog = [
        {"code": "M.GEN.0085", "name": "Baja Profil", "category": "bahan", "unit": "kg"},
        {"code": "M.GEN.0032", "name": "Besi Strip", "category": "bahan", "unit": "kg"},
    ]

    result = classify_batch2_row(row, catalog)

    assert result["status"] == "matched_diusulkan"
    assert result["code"] == "M.GEN.0085"
    assert result["score"] == 1.0


def test_batch2_match_seal_tape_ke_sealtape_dengan_alias_spasi():
    row = {
        "source_name": "Seal tape",
        "source_unit": "buah",
        "source_category": "bahan",
        "source_price": 10000,
        "source_row": 74,
    }
    catalog = [
        {"code": "M.GEN.0456", "name": "Sealtape", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0364", "name": "Sealant", "category": "bahan", "unit": "tube"},
    ]

    result = classify_batch2_row(row, catalog)

    assert result["status"] == "matched_diusulkan"
    assert result["code"] == "M.GEN.0456"
    assert result["score"] == 1.0


def test_batch2_menahan_kran_air_karena_dua_ukuran_sama_sama_mungkin():
    row = {
        "source_name": "Kran air",
        "source_unit": "buah",
        "source_category": "bahan",
        "source_price": 60000,
        "source_row": 73,
    }
    catalog = [
        {"code": "M.GEN.0471", "name": "Kran Air diameter 1/2 inch", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0472", "name": "Kran Air diameter 3/4 inch", "category": "bahan", "unit": "buah"},
    ]

    result = classify_batch2_row(row, catalog)

    assert result["status"] == "ambigu"
    assert [c["code"] for c in result["candidates"]] == ["M.GEN.0471", "M.GEN.0472"]


def test_batch2_menahan_lampu_watt_tanpa_kandidat_watt_yang_sama():
    row = {
        "source_name": "Lampu LED 18 watt",
        "source_unit": "buah",
        "source_category": "bahan",
        "source_price": 75000,
        "source_row": 78,
    }
    catalog = [
        {"code": "M.GEN.1109", "name": "Lampu LED 7 Watt dan aksesoris", "category": "bahan", "unit": "Unit"},
        {"code": "M.GEN.1144", "name": "Lampu LED E27 19 Watt dan aksesoris", "category": "bahan", "unit": "Unit"},
    ]

    result = classify_batch2_row(row, catalog)

    assert result["status"] == "tidak_ketemu"
    assert result["reason"] == "tidak ada kandidat aman untuk batch2"
