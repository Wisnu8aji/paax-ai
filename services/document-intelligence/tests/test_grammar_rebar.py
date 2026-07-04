"""Fase 2 P2 — anchor test parse_rebar (brain-00 §2.2)."""
from __future__ import annotations

from app.perception.grammar.rebar import parse_rebar


def test_pokok_12d16():
    r = parse_rebar("12D16")
    assert r is not None
    assert r.kind == "pokok" and r.n == 12 and r.d == 16 and r.jenis == "D"
    assert r.needs_review is False


def test_pokok_10d16():
    r = parse_rebar("10D16")
    assert r.n == 10 and r.d == 16 and r.jenis == "D"


def test_pokok_8d16():
    r = parse_rebar("8D16")
    assert r.n == 8 and r.d == 16


def test_pokok_toleran_spasi_tunggal():
    r = parse_rebar("12 D16")
    assert r.n == 12 and r.d == 16


def test_pokok_toleran_spasi_ganda():
    r = parse_rebar("12 D 16")
    assert r.n == 12 and r.d == 16


def test_sebar_d10_150():
    r = parse_rebar("D10-150")
    assert r.kind == "sebar" and r.d == 10 and r.s == 150 and r.jenis == "D"


def test_sebar_d10_300():
    r = parse_rebar("D10-300")
    assert r.d == 10 and r.s == 300


def test_sebar_d16_150():
    r = parse_rebar("D16-150")
    assert r.d == 16 and r.s == 150


def test_sebar_polos_oe_simbol():
    r = parse_rebar("Ø10-150")
    assert r.jenis == "O" and r.d == 10 and r.s == 150


def test_sebar_polos_huruf_o():
    r = parse_rebar("O10-150")
    assert r.jenis == "O" and r.d == 10 and r.s == 150


def test_sebar_diameter_di_luar_rentang_needs_review():
    r = parse_rebar("D40-150")
    assert r.d == 40
    assert r.needs_review is True
    assert "W-NUM" in r.warnings


def test_bukan_rebar_returns_none():
    assert parse_rebar("12X16") is None
    assert parse_rebar("400x400") is None
    assert parse_rebar("K1") is None
