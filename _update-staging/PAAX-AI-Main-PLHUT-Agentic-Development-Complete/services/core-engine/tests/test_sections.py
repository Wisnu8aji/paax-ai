"""
Tes RAB tersektor (WBS). Anchor: CK.001 vol50 (III), CK.002 vol50 (IV).
  amount III = 50*145387   = 7.269.350
  amount IV  = 50*82845.4  = 4.142.270
  subtotal   = 11.411.620
"""
from pathlib import Path

from app.rab.loader import load_data
from app.rab.models import RABLineInput
from app.rab.sections import build_sectioned_rab, normalize_section

REPO_ROOT = Path(__file__).resolve().parents[3]
STORE = load_data(REPO_ROOT / "data")
BOOK = STORE.price_book("jateng")


def _build(lines):
    return build_sectioned_rab(lines, STORE.ahsp, BOOK, region="Jawa Tengah",
                               region_code="jateng", ppn_rate=0.11)


def test_normalize_section_variants():
    assert normalize_section("III") == "III"
    assert normalize_section("iii") == "III"
    assert normalize_section("3") == "III"
    assert normalize_section("Pekerjaan Struktur") == "III"
    assert normalize_section(None) == "LAINNYA"
    assert normalize_section("ngawur") == "LAINNYA"


def test_sections_grouped_and_ordered():
    res = _build([
        RABLineInput(ahsp_code="AHSP.CK.002", volume=50, section="IV"),
        RABLineInput(ahsp_code="AHSP.CK.001", volume=50, section="III"),
    ])
    # Walau input IV dulu, output harus urut kanonik: III sebelum IV.
    assert [s.code for s in res.sections] == ["III", "IV"]
    s3 = next(s for s in res.sections if s.code == "III")
    s4 = next(s for s in res.sections if s.code == "IV")
    assert s3.subtotal == 7269350.0
    assert s4.subtotal == 4142270.0
    assert res.subtotal == 11411620.0


def test_section_weights_sum_to_100():
    res = _build([
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120, section="III"),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240, section="IV"),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=85, section="IV"),
    ])
    assert abs(sum(s.weight_pct for s in res.sections) - 100.0) < 0.01


def test_unknown_section_goes_last():
    res = _build([
        RABLineInput(ahsp_code="AHSP.CK.001", volume=10, section=None),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=10, section="I"),
    ])
    assert res.sections[0].code == "I"
    assert res.sections[-1].code == "LAINNYA"


def test_titles_present():
    res = _build([RABLineInput(ahsp_code="AHSP.CK.001", volume=10, section="III")])
    assert res.sections[0].title == "Pekerjaan Struktur"
