import pytest

from app.brain.models import (
    BrainAssumption, BrainBoe, BrainParamSnapshot, BrainWarning, ProjectContext,
)
from app.eval.models import EvalCase, EvalRunRequest
from app.eval.runner import run_eval
from app.export.boe_exporter import export_bbs_payload, export_boe_payload
from app.review.corrections import log_correction
from app.review.models import CorrectionLogRequest, ReviewCandidate, ReviewTriageRequest
from app.review.triage import triage_review_tasks
from app.tkg.takeoff import BbsDiameterSummary, BbsMark, BbsResult


def test_review_triage_uses_pareto_low_confidence_and_numeric_priority():
    req = ReviewTriageRequest(
        project_id="PRJ-REV",
        ambang_conf=0.7,
        candidates=[
            ReviewCandidate(
                target_ref="WI-STR-K1",
                target_type="work_item",
                impact_score=0.9,
                uncertainty_score=0.5,
                confidence=0.55,
                cost_rank_pct=0.85,
                p_pareto=0.8,
            )
        ],
    )

    result = triage_review_tasks(req)

    assert len(result.tasks) == 1
    task = result.tasks[0]
    assert task.priority == pytest.approx(0.45)
    assert "RULE-TRI-01:PARETO" in task.reasons
    assert "RULE-TRI-01:LOW_CONFIDENCE" in task.reasons


def test_correction_log_is_deterministic_and_preserves_values():
    req = CorrectionLogRequest(
        project_id="PRJ-REV",
        target_ref="WI-STR-K1.volume",
        field="volume",
        old=100.0,
        new=102.5,
        reason="manual ukur ulang",
        user="wisnu",
        timestamp="2026-07-02T10:00:00+07:00",
    )

    first = log_correction(req)
    second = log_correction(req)

    assert first.id == second.id
    assert first.target_ref == "WI-STR-K1.volume"
    assert first.old == 100.0
    assert first.new == 102.5
    assert first.reason == "manual ukur ulang"


def test_eval_tolerance_pass_fail_anchor():
    req = EvalRunRequest(cases=[
        EvalCase(id="pass", actual=100.02, expected=100.0, tolerance=0.05),
        EvalCase(id="fail", actual=100.2, expected=100.0, tolerance=0.05),
    ])

    result = run_eval(req)

    assert result.summary.total == 2
    assert result.summary.passed == 1
    assert result.results[0].passed is True
    assert result.results[1].passed is False
    assert result.results[1].delta == pytest.approx(0.2)


def test_export_boe_preserves_assumptions_missing_warnings_exactly():
    boe = BrainBoe(
        project_context=ProjectContext(
            prj_id="PRJ-BOE",
            mode="estimate",
            tipe_bangunan="rumah",
            wilayah="jateng",
        ),
        assumptions=[
            BrainAssumption(id="A1", kategori="metode", deskripsi="tinggi lantai dari user"),
            BrainAssumption(id="A2", kategori="data", deskripsi="harga belum lengkap"),
        ],
        missing=["HSD besi D16"],
        warnings=[BrainWarning(kode="W1", pesan="coverage rendah")],
        param_snapshot=BrainParamSnapshot(values={"waste_besi": 0}, sources={"waste_besi": "user"}),
    )

    payload = export_boe_payload(boe)

    assert payload["format"] == "json"
    assert len(payload["boe"]["assumptions"]) == 2
    assert payload["boe"]["missing"] == ["HSD besi D16"]
    assert payload["boe"]["warnings"][0]["pesan"] == "coverage rendah"
    assert payload["boe"]["param_snapshot"]["values"] == {"waste_besi": 0}


def test_export_bbs_preserves_marks_per_diameter_and_total_waste():
    bbs = BbsResult(
        l_stock_m=12.0,
        marks=[
            BbsMark(mark="M001", kode="K1", posisi="tul_utama", d_mm=16, panjang_m=3.5, jumlah=8, berat_kg=44.1934),
        ],
        per_diameter=[
            BbsDiameterSummary(d_mm=16, n_potong=8, total_panjang_m=28.0, kebutuhan_stok_batang=3, waste_kg=12.6267),
        ],
        total_waste_kg=12.6267,
    )

    payload = export_bbs_payload(bbs)

    assert payload["format"] == "json"
    assert payload["bbs"]["marks"][0]["mark"] == "M001"
    assert payload["bbs"]["per_diameter"][0]["kebutuhan_stok_batang"] == 3
    assert payload["bbs"]["total_waste_kg"] == pytest.approx(12.6267)
