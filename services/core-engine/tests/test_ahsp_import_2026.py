from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.data_audit.coverage import audit_data_coverage
from app.mapping.models import PriceBindRequest
from app.mapping.price_binding import bind_prices
from app.rab.loader import load_data
from app.rab.rab import compute_hsp


REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = REPO_ROOT / "data"


def _store():
    return load_data(DATA_ROOT)


def test_loader_memuat_sample_lama_dan_katalog_ck_2026_tanpa_collision():
    store = _store()
    raw_total = 0
    for path in sorted((DATA_ROOT / "ahsp").glob("*.json")):
        raw_total += len(json.loads(path.read_text(encoding="utf-8"))["items"])

    assert raw_total == 2546
    assert len(store.ahsp) == raw_total
    assert "AHSP.CK.001" in store.ahsp
    assert "AHSP.CK.004" in store.ahsp
    assert "1.1.1.1" in store.ahsp
    assert "1.1.1.2" in store.ahsp
    assert "9.8.1.8" in store.ahsp


def test_katalog_ck_2026_price_binding_jujur_banyak_missing_resources():
    store = _store()
    assert "jateng" in store.regions

    for code in ["1.1.1.1", "1.1.1.2", "9.8.1.8"]:
        binding = bind_prices(
            PriceBindRequest(ahsp_code=code, region_code="jateng"),
            store.ahsp,
            store.price_book("jateng"),
        )

        assert binding.coverage_ratio < 1.0
        assert "L.01" in binding.missing_resources


def test_compute_hsp_katalog_ck_2026_fail_fast_kalau_harga_belum_ada():
    store = _store()

    with pytest.raises(KeyError, match="L\\.01"):
        compute_hsp(store.ahsp["1.1.1.1"], store.price_book("jateng"))


def test_data_coverage_setelah_import_menunjukkan_gap_harga_regional():
    store = _store()
    coverage = audit_data_coverage(store.ahsp, store.price_book("jateng"), "jateng")

    assert coverage.ahsp_total == 2546
    assert coverage.resource_used_total == 2441
    assert coverage.resource_priced_total == 12
    assert coverage.coverage_ratio == 0.0049
    assert coverage.ahsp_fully_priced == 4
    assert len(coverage.missing_resources) == 2429
