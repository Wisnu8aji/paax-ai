"""Fase 2 P4 — anchor test agregasi metrics + gerbang."""
from __future__ import annotations

from app.perception.validate import aggregate_metrics, build_gerbang


def test_aggregate_metrics_sums_across_sheets():
    per_sheet = [
        {"run_total": 10, "run_terklasifikasi": 9, "n_unclassified": 1, "cakupan": 0.9},
        {"run_total": 20, "run_terklasifikasi": 10, "n_unclassified": 10, "cakupan": 0.5},
    ]
    m = aggregate_metrics(per_sheet)
    assert m["span_total"] == 30
    assert m["span_terklasifikasi"] == 19
    assert m["n_unclassified"] == 11
    assert m["cakupan"] == 19 / 30


def test_gerbang_lolos_when_high_coverage():
    metrics = {"span_total": 100, "span_terklasifikasi": 95, "cakupan": 0.95, "grammar_pass_rate": 0.95, "n_unclassified": 5, "n_warning": 0}
    gerbang = build_gerbang(metrics, n_sheets=1)
    # V-07/09/10 belum dievaluasi -> selalu draft di iterasi ini (jujur, bukan lolos palsu)
    assert gerbang["status"] == "draft"
    v06 = next(c for c in gerbang["checks"] if c["code"] == "V-06")
    assert v06["passed"] is True


def test_gerbang_draft_when_low_coverage():
    metrics = {"span_total": 100, "span_terklasifikasi": 10, "cakupan": 0.10, "grammar_pass_rate": 0.10, "n_unclassified": 90, "n_warning": 0}
    gerbang = build_gerbang(metrics, n_sheets=1)
    assert gerbang["status"] == "draft"
    v06 = next(c for c in gerbang["checks"] if c["code"] == "V-06")
    assert v06["passed"] is False


def test_v07_v09_v10_marked_not_evaluated_not_fabricated():
    metrics = {"span_total": 10, "span_terklasifikasi": 10, "cakupan": 1.0, "grammar_pass_rate": 1.0, "n_unclassified": 0, "n_warning": 0}
    gerbang = build_gerbang(metrics, n_sheets=1)
    combined_check = next(c for c in gerbang["checks"] if c["code"] == "V-07/V-09/V-10")
    assert combined_check["passed"] is False
    assert "BELUM DIEVALUASI" in combined_check["detail"]
