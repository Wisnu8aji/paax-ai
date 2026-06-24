"""
Tes engine deterministik. Angka acuan dihitung manual dari data contoh + harga jateng.

AHSP.CK.001 (dinding bata 1/2 batu), harga jateng:
  Bahan: 70*800 + 9.68*1500 + 0.045*250000 = 56000 + 14520 + 11250 = 81770
  Upah : 0.30*110000 + 0.10*135000 + 0.01*150000 + 0.015*160000
       = 33000 + 13500 + 1500 + 2400 = 50400
  Base = 132170 ; Overhead+Profit 10% = 13217 ; HSP = 145387
"""
from pathlib import Path
import pytest

from app.rab.loader import load_data
from app.rab.rab import compute_hsp, compute_rab
from app.rab.schedule import build_s_curve
from app.rab.models import RABLineInput

REPO_ROOT = Path(__file__).resolve().parents[3]
STORE = load_data(REPO_ROOT / "data")
BOOK = STORE.price_book("jateng")


def test_data_loaded():
    assert "AHSP.CK.001" in STORE.ahsp
    assert "jateng" in STORE.regions
    assert len(STORE.ahsp) >= 4


def test_hsp_known_value():
    h = compute_hsp(STORE.ahsp["AHSP.CK.001"], BOOK)
    assert h.bahan == 81770.0
    assert h.upah == 50400.0
    assert h.alat == 0.0
    assert h.base == 132170.0
    assert h.overhead_profit_value == 13217.0
    assert h.hsp == 145387.0


def test_hsp_components_sum_matches():
    h = compute_hsp(STORE.ahsp["AHSP.CK.001"], BOOK)
    bahan = sum(c.subtotal for c in h.components if c.category == "bahan")
    upah = sum(c.subtotal for c in h.components if c.category == "upah")
    assert round(bahan, 2) == h.bahan
    assert round(upah, 2) == h.upah


def test_rab_totals():
    lines = [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=50),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=50),
    ]
    rab = compute_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                      region_code="jateng", ppn_rate=0.11)
    # item1 amount = 50 * 145387 = 7269350
    # item2 HSP = (17414 + 57900) * 1.1 = 75314 * 1.1 = 82845.4 ; amount = 4142270
    assert rab.lines[0].amount == 7269350.0
    assert rab.lines[1].amount == 4142270.0
    assert rab.subtotal == 11411620.0
    assert rab.ppn == round(11411620.0 * 0.11, 2)
    assert rab.total == round(11411620.0 * 1.11, 2)


def test_weights_sum_to_100():
    lines = [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240),
        RABLineInput(ahsp_code="AHSP.CK.003", volume=18),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=85),
    ]
    rab = compute_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                      region_code="jateng")
    assert abs(sum(ln.weight_pct for ln in rab.lines) - 100.0) < 0.01


def test_missing_ahsp_raises():
    with pytest.raises(KeyError):
        compute_rab([RABLineInput(ahsp_code="NOPE", volume=1)], STORE.ahsp, BOOK,
                    region="x", region_code="jateng")


def test_s_curve_cumulative_reaches_100():
    lines = [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120, duration_days=6),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240, duration_days=8),
        RABLineInput(ahsp_code="AHSP.CK.003", volume=18,  duration_days=5),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=85,  duration_days=7),
    ]
    rab = compute_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                      region_code="jateng")
    sc = build_s_curve(rab, lines, period_days=7, mode="sequential")
    assert sc.total_days == 26  # 6+8+5+7
    assert sc.points[-1].cumulative_pct == 100.0
    # monotonic non-decreasing
    cums = [p.cumulative_pct for p in sc.points]
    assert all(b >= a for a, b in zip(cums, cums[1:]))


def test_s_curve_parallel_duration():
    lines = [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120, duration_days=6),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240, duration_days=8),
    ]
    rab = compute_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                      region_code="jateng")
    sc = build_s_curve(rab, lines, period_days=7, mode="parallel")
    assert sc.total_days == 8  # max(6, 8)
    assert sc.points[-1].cumulative_pct == 100.0
