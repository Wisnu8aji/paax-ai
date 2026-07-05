from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from app.rab.models import ResourcePrice
from app.rab.rab import compute_hsp
from app.rab.loader import load_data


REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = REPO_ROOT / "data"
REPORT_ROOT = REPO_ROOT / "report"


def _unit_gap_codes_from_findings() -> list[str]:
    findings = (REPORT_ROOT / "AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md").read_text(encoding="utf-8")
    return re.findall(r"- `([^`]+)`: unit kosong", findings)


def test_compute_hsp_menghitung_resource_duplikat_sebagai_baris_terpisah():
    store = load_data(DATA_ROOT)
    item = store.ahsp["1.1.1.1"]
    price_book = {
        comp.resource_code: ResourcePrice(
            code=comp.resource_code,
            name=comp.resource_code,
            category=comp.category,
            unit="sat",
            price=0.0,
        )
        for comp in item.components
    }
    price_book["L.02"] = ResourcePrice(
        code="L.02",
        name="Tukang batu",
        category="upah",
        unit="OH",
        price=1000.0,
    )

    hsp = compute_hsp(item, price_book)

    assert [c.resource_code for c in item.components].count("L.02") == 2
    assert hsp.upah == 400.0
    assert hsp.overhead_profit_value == 40.0
    assert hsp.hsp == 440.0
    assert [c.subtotal for c in hsp.components if c.resource_code == "L.02"] == [200.0, 200.0]


def test_laporan_unit_gap_ahsp_memuat_semua_188_kode_persis_sekali():
    report_path = REPORT_ROOT / "AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md"
    report = report_path.read_text(encoding="utf-8")

    expected_codes = _unit_gap_codes_from_findings()
    assert len(expected_codes) == 188

    reported_codes = re.findall(r"<!-- unit-gap-code:([^ ]+) -->", report)

    assert len(reported_codes) == 188
    assert Counter(reported_codes) == Counter(expected_codes)
    assert all(count == 1 for count in Counter(reported_codes).values())


def test_laporan_harga_semarang_batch2_memuat_68_baris_sumber_persis_sekali():
    report_path = REPORT_ROOT / "HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md"
    report = report_path.read_text(encoding="utf-8")

    source_rows = re.findall(r"<!-- semarang-batch2-source-row:(\d+) -->", report)

    assert len(source_rows) == 68
    assert all(count == 1 for count in Counter(source_rows).values())
    assert "Acuan harga existing: `G:\\paax-data\\harga-satuan\\semarang.json`" in report
