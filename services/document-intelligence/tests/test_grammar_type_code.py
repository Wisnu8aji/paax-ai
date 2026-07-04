"""Fase 2 P2 — anchor test parse_type_code (brain-00 §2.1)."""
from __future__ import annotations

from app.perception.grammar.type_code import parse_type_code


def test_k1_kolom():
    r = parse_type_code("K1")
    assert r.prefiks == "K" and r.indeks == 1 and r.sufiks is None
    assert r.kategori == "kolom"


def test_k1a_variant_different_from_k1():
    r_k1 = parse_type_code("K1")
    r_k1a = parse_type_code("K1A")
    assert r_k1a.sufiks == "A"
    assert r_k1a != r_k1
    assert r_k1a.kategori == "kolom"


def test_pc1_pondasi_telapak():
    r = parse_type_code("PC1")
    assert r.prefiks == "PC" and r.kategori == "pondasi_telapak"


def test_sl1_sloof():
    assert parse_type_code("SL1").kategori == "sloof"


def test_b2_balok():
    assert parse_type_code("B2").kategori == "balok"


def test_kp1_kolom_praktis():
    assert parse_type_code("KP1").kategori == "kolom_praktis"


def test_s1_plat():
    assert parse_type_code("S1").kategori == "plat"


def test_unknown_prefix_no_legend_returns_none():
    assert parse_type_code("ZZ9") is None


def test_unknown_prefix_with_legend_resolves():
    r = parse_type_code("ZZ9", legenda={"ZZ": "gording"})
    assert r is not None
    assert r.kategori == "gording"
    assert r.sumber == "legenda"


def test_code_with_slash_kept_raw_needs_review():
    r = parse_type_code("1/2KD")
    assert r is not None
    assert r.kode_raw == "1/2KD"
    assert r.needs_review is True
