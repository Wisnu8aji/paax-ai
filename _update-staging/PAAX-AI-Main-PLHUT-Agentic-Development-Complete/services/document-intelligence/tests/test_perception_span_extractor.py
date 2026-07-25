"""Fase 2 P1 — anchor test ekstraksi span vektor (PDF sintetis non-PLHUT, §0.1)."""
from __future__ import annotations

import json
import re
from pathlib import Path

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "perception" / "synthetic_denah_spans.json"
_SPAN_ID_PATTERN = re.compile(r"^p\d+-\d{4}$")


def _load_spans() -> list[dict]:
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    return data["spans"]


def test_synthetic_fixture_has_spans():
    spans = _load_spans()
    assert len(spans) > 0


def test_spans_have_valid_bbox_and_rotasi():
    spans = _load_spans()
    for sp in spans:
        assert len(sp["bbox"]) == 4
        x0, y0, x1, y1 = sp["bbox"]
        assert x1 >= x0 and y1 >= y0
        assert sp["rotasi"] in (0, 90, 180, 270)


def test_spans_are_vector_method_full_confidence():
    spans = _load_spans()
    for sp in spans:
        assert sp["method"] == "vector"
        assert sp["confidence"] == 1.0


def test_span_id_deterministic_pattern():
    spans = _load_spans()
    for sp in spans:
        assert _SPAN_ID_PATTERN.match(sp["span_id"]), sp["span_id"]


def test_synthetic_pdf_contains_expected_texts():
    spans = _load_spans()
    joined = " ".join(sp["text"] for sp in spans)
    assert "6000" in joined
    assert "B1" in joined
