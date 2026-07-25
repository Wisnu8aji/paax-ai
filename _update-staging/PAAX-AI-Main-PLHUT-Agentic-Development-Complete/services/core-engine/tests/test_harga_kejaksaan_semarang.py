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
    nearest_rejected_candidates,
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


def test_kandidat_nama_paling_mirip_tetap_tampil_walau_unit_katalog_keliru():
    """Regresi kasus nyata (Fase S, 2026-07-12): 'Kloset jongkok porselen' vs
    M.GEN.0450 'Kloset Jongkok' -- katalog master menulis unit-nya sebagai
    'unit' (generik/keliru), bukan 'buah', sehingga kandidat ini kalah
    ranking gabungan dari kandidat lain yang unit-nya cocok tapi namanya
    jauh lebih jauh. Kandidat nama-paling-mirip WAJIB tetap tampil."""
    source = HargaSourceRow(
        source_name="Kloset jongkok porselen",
        unit="buah",
        price=350000,
        category="bahan",
        row_number=71,
    )
    catalog = [
        # 5 kandidat unit cocok ("buah") tapi nama jauh -- akan memenuhi top-5
        # ranking gabungan (category_score=1, unit_score=1) walau nama beda.
        {"code": "M.GEN.0458", "name": "Porselen 11x11", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0315", "name": "Dinding Porselen uk. 10 x 20 cm", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0316", "name": "Dinding Porselen uk. 20 x 20 cm", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0466", "name": "Ubin Porselen 20x20cm", "category": "bahan", "unit": "buah"},
        {"code": "M.GEN.0035", "name": "Bata merah", "category": "bahan", "unit": "buah"},
        # Kandidat nama paling mirip, tapi unit di katalog keliru ("unit").
        {"code": "M.GEN.0450", "name": "Kloset Jongkok", "category": "bahan", "unit": "unit"},
    ]

    result = classify_kejaksaan_row(source, catalog, near_limit=5)

    assert result["status"] == "tidak_ketemu"
    codes = [c["code"] for c in result["near_candidates"]]
    assert "M.GEN.0450" in codes
    assert len(result["near_candidates"]) == 5  # tetap dalam batas limit, bukan menambah panjang

    kloset = next(c for c in result["near_candidates"] if c["code"] == "M.GEN.0450")
    assert "unit beda" in kloset["reject_reason"]


def test_nearest_rejected_candidates_kosong_bila_katalog_kosong():
    source = HargaSourceRow(source_name="X", unit="buah", price=1, category="bahan", row_number=1)
    assert nearest_rejected_candidates(source, [], limit=5) == []


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
