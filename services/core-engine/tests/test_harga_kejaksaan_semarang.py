from __future__ import annotations

import re
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from scripts.harga.kejaksaan_semarang_report import (  # noqa: E402
    HargaSourceRow,
    classify_kejaksaan_row,
    compare_price_overlap,
)


REPORT_ROOT = REPO_ROOT / "report"


def test_laporan_kejaksaan_memuat_121_baris_sumber_persis_sekali():
    report = (REPORT_ROOT / "HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md").read_text(encoding="utf-8")
    rows = re.findall(r"<!-- kejaksaan-source-row:(\d+) -->", report)

    assert len(rows) == 121
    assert len(set(rows)) == 121


def test_kejaksaan_tidak_ketemu_tetap_menampilkan_kandidat_dekat_dengan_alasan():
    source = HargaSourceRow(
        source_name="Baja tulangan polos U-24",
        unit="kg",
        price=10100,
        category="bahan",
        row_number=65,
    )
    catalog = [
        {"code": "M.GEN.0138", "name": "Baja tulangan polos U24 diameter 10 mm", "category": "bahan", "unit": "kg"},
        {"code": "M.GEN.0141", "name": "Baja tulangan polos U24 diameter 12 mm", "category": "bahan", "unit": "kg"},
        {"code": "M.GEN.0464", "name": "Baja Tulangan", "category": "bahan", "unit": "kg"},
    ]

    result = classify_kejaksaan_row(source, catalog)

    assert result["status"] == "tidak_ketemu"
    assert result["near_candidates"][0]["code"] == "M.GEN.0138"
    assert "angka tidak cocok" in result["near_candidates"][0]["reject_reason"]


def test_perbandingan_harga_overlap_menandai_selisih_di_atas_15_persen_tanpa_merata_ratakan():
    kejaksaan = [
        {
            "status": "matched",
            "code": "M.TEST",
            "catalog_name": "Material Test",
            "source_price": 130000,
        }
    ]
    semarang = {
        "M.TEST": {
            "code": "M.TEST",
            "name": "Material Test",
            "price": 100000,
        }
    }

    comparisons = compare_price_overlap(kejaksaan, semarang, threshold=0.15)

    assert comparisons == [
        {
            "code": "M.TEST",
            "name": "Material Test",
            "kejaksaan_price": 130000,
            "semarang_price": 100000,
            "diff_pct": 30.0,
            "status": "perlu ditinjau",
        }
    ]
