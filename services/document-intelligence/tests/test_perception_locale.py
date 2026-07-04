"""Fase 2 P1 — anchor test deteksi locale & normalisasi angka (brain-00 §2.6)."""
from __future__ import annotations

from app.perception.locale import detect_locale, normalize_number


def test_detect_locale_from_grid_and_level_patterns():
    spans_text = ["4000", "±0.000", "5000", "K1"]
    result = detect_locale(spans_text)
    assert result["locale"] == "id-ID"
    assert result["desimal"] == "."
    assert result["confidence"] > 0
    assert any("grid" in b or "level" in b for b in result["bukti"])


def test_normalize_number_valid_decimal_point():
    res = normalize_number("0.000", {"desimal": "."})
    assert res["raw"] == "0.000"
    assert res["nilai"] == 0.0


def test_normalize_number_invalid_returns_none_not_guessed():
    res = normalize_number("ABC", {"desimal": "."})
    assert res["raw"] == "ABC"
    assert res["nilai"] is None
    assert res["koreksi"] is False


def test_normalize_number_id_id_comma_decimal():
    res = normalize_number("1.200,50", {"desimal": ","})
    assert res["nilai"] == 1200.50
    assert res["koreksi"] is True
    assert res["raw"] == "1.200,50"
