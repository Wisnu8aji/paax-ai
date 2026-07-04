"""Fase 2 P1 — anchor test merge-run (RULE-EXT-03). Nilai dihitung manual."""
from __future__ import annotations

from app.perception.models import TextSpan
from app.perception.vector.merge_run import merge_runs


def _span(span_id: str, text: str, bbox, origin, *, rotasi=0, method="vector", font_size=10.0, confidence=1.0):
    return TextSpan(
        span_id=span_id, page=0, text=text, bbox=bbox, rotasi=rotasi,
        font_size=font_size, origin=origin, method=method, confidence=confidence,
    )


def test_digit_fragments_merge_into_single_run():
    spans = [
        _span("s0", "5", (0, 90, 6, 100), (0, 100)),
        _span("s1", "0", (6, 90, 12, 100), (6, 100)),
        _span("s2", "0", (12, 90, 18, 100), (12, 100)),
        _span("s3", "0", (18, 90, 24, 100), (18, 100)),
    ]
    runs = merge_runs(spans)
    assert len(runs) == 1
    assert runs[0].text == "5000"
    assert len(runs[0].spans) == 4
    assert runs[0].ragu is False


def test_code_fragments_merge_12d16():
    spans = [
        _span("s0", "1", (0, 90, 6, 100), (0, 100)),
        _span("s1", "2", (6, 90, 12, 100), (6, 100)),
        _span("s2", "D", (12, 90, 19, 100), (12, 100)),
        _span("s3", "1", (19, 90, 25, 100), (19, 100)),
        _span("s4", "6", (25, 90, 31, 100), (25, 100)),
    ]
    runs = merge_runs(spans)
    assert len(runs) == 1
    assert runs[0].text == "12D16"


def test_large_gap_produces_two_runs():
    spans = [
        _span("a0", "4", (0, 90, 6, 100), (0, 100)),
        _span("a1", "0", (6, 90, 12, 100), (6, 100)),
        _span("a2", "0", (12, 90, 18, 100), (12, 100)),
        _span("a3", "0", (18, 90, 24, 100), (18, 100)),
        # gap dari akhir cluster A (x=24) ke awal cluster B (x=100) = 76 >> ragu_upper (12)
        _span("b0", "3", (100, 90, 106, 100), (100, 100)),
        _span("b1", "0", (106, 90, 112, 100), (106, 100)),
        _span("b2", "0", (112, 90, 118, 100), (112, 100)),
        _span("b3", "0", (118, 90, 124, 100), (118, 100)),
    ]
    runs = merge_runs(spans)
    texts = sorted(r.text for r in runs)
    assert texts == ["3000", "4000"]


def test_vertical_rotasi_90_merges_along_own_axis_not_mixed_with_horizontal():
    vertical_spans = [
        _span("v0", "A", (48, 0, 52, 6), (50, 6), rotasi=90),
        _span("v1", "S", (48, 6, 52, 12), (50, 12), rotasi=90),
        _span("v2", "2", (48, 12, 52, 18), (50, 18), rotasi=90),
    ]
    horizontal_span = _span("h0", "X", (48, 8, 54, 18), (48, 18), rotasi=0)
    runs = merge_runs(vertical_spans + [horizontal_span])

    vertical_run = next(r for r in runs if r.rotasi == 90)
    horizontal_run = next(r for r in runs if r.rotasi == 0)
    assert vertical_run.text == "AS2"
    assert len(vertical_run.spans) == 3
    assert horizontal_run.text == "X"
    assert len(runs) == 2


def test_ambiguous_gap_flagged_ragu():
    # font_size=10 -> merge_threshold=6, ragu_upper=12. gap=9 -> merge, ragu=True.
    spans = [
        _span("g0", "K1", (0, 90, 10, 100), (0, 100)),
        _span("g1", "A", (19, 90, 25, 100), (19, 100)),
    ]
    runs = merge_runs(spans)
    assert len(runs) == 1
    assert runs[0].ragu is True


def test_different_method_never_merged():
    vector_span = _span("m0", "K1", (0, 90, 10, 100), (0, 100), method="vector")
    ocr_span = _span("m1", "A", (10, 90, 16, 100), (10, 100), method="ocr", confidence=0.8)
    runs = merge_runs([vector_span, ocr_span])
    assert len(runs) == 2
    methods = {r.method for r in runs}
    assert methods == {"vector", "ocr"}
