"""Fase 2 P2 — anchor test parse_mutu + parse_level (brain-00 §2.4, §2.5)."""
from __future__ import annotations

from app.perception.grammar.level import parse_level
from app.perception.grammar.mutu import parse_mutu


def test_fc_with_apostrophe_and_space():
    r = parse_mutu("fc' 25")
    assert r.jenis == "fc" and r.nilai == 25


def test_fc_no_space():
    r = parse_mutu("fc'25")
    assert r.jenis == "fc" and r.nilai == 25


def test_k_dash_300():
    r = parse_mutu("K-300")
    assert r.jenis == "K" and r.nilai == 300


def test_k_no_dash_300():
    r = parse_mutu("K300")
    assert r.jenis == "K" and r.nilai == 300


def test_wf_profile_dims():
    r = parse_mutu("WF 200x100x5.5x8")
    assert r.jenis == "WF"
    assert r.dims == [200.0, 100.0, 5.5, 8.0]


def test_level_sfl_plus_zero():
    r = parse_level("SFL +0.000")
    assert r.nilai_m == 0.0


def test_level_el_minus_1500():
    r = parse_level("EL -1.500")
    assert r.nilai_m == -1.5


def test_level_bare_plus_minus_zero():
    r = parse_level("±0.000")
    assert r.nilai_m == 0.0


def test_potongan_label_is_neither_level_nor_mutu():
    assert parse_level("POTONGAN A-A") is None
    assert parse_mutu("POTONGAN A-A") is None
