"""
Tes RAB Health Check (deterministik).

Set 4-item seimbang (bobot 22.5 / 25.6 / 30.9 / 20.9 %, tak ada > 60%):
  CK.001 vol120, CK.002 vol240, CK.003 vol18, CK.004 vol85
"""
from pathlib import Path

from app.rab.loader import load_data
from app.rab.models import RABLineInput
from app.rab.validate import validate_rab

REPO_ROOT = Path(__file__).resolve().parents[3]
STORE = load_data(REPO_ROOT / "data")
BOOK = STORE.price_book("jateng")


def _validate(lines):
    return validate_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                        region_code="jateng", ppn_rate=0.11)


def _balanced(with_duration=True):
    d = 5 if with_duration else None
    return [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120, duration_days=d),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240, duration_days=d),
        RABLineInput(ahsp_code="AHSP.CK.003", volume=18, duration_days=d),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=85, duration_days=d),
    ]


def _codes(res):
    return {i.code for i in res.issues}


def test_clean_rab_scores_100():
    res = _validate(_balanced())
    assert res.ok is True
    assert res.score == 100
    assert res.issues == []
    assert res.items_count == 4


def test_empty_is_error():
    res = _validate([])
    assert res.ok is False
    assert "EMPTY" in _codes(res)
    assert res.score == 75  # 100 - 25


def test_unknown_ahsp_is_error():
    res = _validate([RABLineInput(ahsp_code="NOPE", volume=5, duration_days=2)])
    assert res.ok is False
    assert "UNKNOWN_AHSP" in _codes(res)


def test_nonpositive_volume_is_error():
    res = _validate([RABLineInput(ahsp_code="AHSP.CK.001", volume=0, duration_days=2)])
    assert res.ok is False
    assert "NONPOSITIVE_VOLUME" in _codes(res)


def test_duplicate_item_is_warning():
    res = _validate([
        RABLineInput(ahsp_code="AHSP.CK.001", volume=50, duration_days=3),
        RABLineInput(ahsp_code="AHSP.CK.001", volume=50, duration_days=3),
    ])
    assert "DUPLICATE_ITEM" in _codes(res)
    assert res.ok is True  # duplikat = warning, bukan error


def test_missing_duration_is_info_only():
    res = _validate(_balanced(with_duration=False))
    assert _codes(res) == {"MISSING_DURATION"}
    assert res.infos == 4
    assert res.score == 88  # 100 - 4*3
    assert res.ok is True


def test_weight_concentration_flagged():
    res = _validate([
        RABLineInput(ahsp_code="AHSP.CK.003", volume=1000, duration_days=10),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=1, duration_days=1),
    ])
    assert "WEIGHT_CONCENTRATION" in _codes(res)
