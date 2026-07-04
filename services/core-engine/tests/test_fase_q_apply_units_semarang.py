from __future__ import annotations

import json
import re
from pathlib import Path

from app.data_audit.coverage import audit_data_coverage
from app.rab.loader import load_data


REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = REPO_ROOT / "data"
REPORT_ROOT = REPO_ROOT / "report"


def _unit_map_from_report() -> dict[str, str]:
    report = (REPORT_ROOT / "AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md").read_text(encoding="utf-8")
    entries: dict[str, str] = {}
    pattern = re.compile(
        r"<!-- unit-gap-code:([^ ]+) -->\s*\n"
        r"\| `[^`]+` \| .*? \| `([^`]+)` \|",
        re.DOTALL,
    )
    for code, unit in pattern.findall(report):
        entries[code] = unit
    return entries


def test_188_unit_gap_ahsp_diterapkan_persis_dari_laporan():
    expected = _unit_map_from_report()
    assert len(expected) == 188

    raw = json.loads((DATA_ROOT / "ahsp" / "cipta-karya-2026.json").read_text(encoding="utf-8"))
    by_code = {item["code"]: item for item in raw["items"]}
    empty_units = [item["code"] for item in raw["items"] if not str(item.get("unit", "")).strip()]

    assert empty_units == []
    assert {code: by_code[code]["unit"] for code in expected} == expected


def test_semarang_price_book_repo_memuat_25_resource_dan_loader_tidak_ditimpa_overrides():
    semarang_path = DATA_ROOT / "harga-satuan" / "semarang.json"
    raw = json.loads(semarang_path.read_text(encoding="utf-8"))

    assert raw["region_code"] == "semarang"
    assert len(raw["resources"]) == 25

    by_code = {resource["code"]: resource for resource in raw["resources"]}
    assert by_code["M.GEN.0085"] == {
        "code": "M.GEN.0085",
        "name": "Baja Profil",
        "category": "bahan",
        "unit": "kg",
        "price": 12000,
    }
    assert by_code["M.GEN.0456"] == {
        "code": "M.GEN.0456",
        "name": "Sealtape",
        "category": "bahan",
        "unit": "buah",
        "price": 10000,
    }

    store = load_data(DATA_ROOT)
    assert "semarang" in store.regions
    assert len(store.price_book("semarang")) == 25


def test_coverage_semarang_naik_jujur_tetap_kecil_setelah_import_25_resource():
    store = load_data(DATA_ROOT)
    coverage = audit_data_coverage(store.ahsp, store.price_book("semarang"), "semarang")

    assert coverage.resource_used_total == 2441
    assert coverage.resource_priced_total == 25
    assert coverage.coverage_ratio == 0.0102
