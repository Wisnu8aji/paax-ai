"""Fase 2 P2 — anchor test parse_section + infer_unit (brain-00 §2.3, §2.7)."""
from __future__ import annotations

from app.perception.grammar.section import parse_section
from app.perception.lexicon.units import infer_unit
from app.perception.params import DIMS_RANGE


def test_section_400x400_kolom_infers_mm():
    sec = parse_section("400x400")
    assert sec.b == 400 and sec.h == 400
    unit = infer_unit((sec.b, sec.h), "kolom", DIMS_RANGE)
    assert unit.satuan == "mm"
    assert unit.needs_review is False


def test_section_250x600_kolom_mm():
    sec = parse_section("250x600")
    unit = infer_unit((sec.b, sec.h), "kolom", DIMS_RANGE)
    assert unit.satuan == "mm"


def test_section_slash_separator_250_600_balok_mm():
    sec = parse_section("250/600")
    assert sec.b == 250 and sec.h == 600
    unit = infer_unit((sec.b, sec.h), "balok", DIMS_RANGE)
    assert unit.satuan == "mm"


def test_section_15x10_latei_infers_cm_with_assumption():
    sec = parse_section("15x10")
    assert sec.b == 15 and sec.h == 10
    unit = infer_unit((sec.b, sec.h), "latei", DIMS_RANGE)
    assert unit.satuan == "cm"
    assert unit.needs_review is False
    assert unit.assumption is not None


def test_section_t_120_plat_mm():
    sec = parse_section("t=120")
    assert sec.t == 120
    unit = infer_unit((sec.t,), "plat_t", DIMS_RANGE)
    assert unit.satuan == "mm"


def test_section_out_of_range_both_units_needs_review():
    sec = parse_section("9999x9999")
    unit = infer_unit((sec.b, sec.h), "kolom", DIMS_RANGE)
    assert unit.satuan is None
    assert unit.needs_review is True
