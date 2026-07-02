from __future__ import annotations

from app.brain.boe import build_boe
from app.brain.confidence import score_confidence
from app.brain.models import (
    BrainAssumption,
    BrainBoeRequest,
    BrainParamSnapshot,
    BrainWarning,
    ProjectContext,
    QaRequest,
)
from app.brain.qa import run_qa
from app.data_audit.coverage import audit_data_coverage
from app.rab.models import AHSPItem, Component, ResourcePrice


def _ahsp_fixture():
    return {
        "A": AHSPItem(
            code="A",
            name="Pekerjaan A",
            unit="m2",
            components=[
                Component(resource_code="R1", category="bahan", coefficient=1),
                Component(resource_code="R2", category="upah", coefficient=2),
            ],
        ),
        "B": AHSPItem(
            code="B",
            name="Pekerjaan B",
            unit="m3",
            components=[
                Component(resource_code="R2", category="upah", coefficient=1),
                Component(resource_code="R3", category="alat", coefficient=0.5),
            ],
        ),
    }


def _price(code: str) -> ResourcePrice:
    return ResourcePrice(code=code, name=f"Resource {code}", category="bahan", unit="unit", price=1000)


def test_data_coverage_missing_resource_anchor():
    """Manual: AHSP uses R1,R2,R3; price book has R1,R2 -> coverage 2/3."""
    result = audit_data_coverage(_ahsp_fixture(), {"R1": _price("R1"), "R2": _price("R2")}, "jateng")

    assert result.region_code == "jateng"
    assert result.ahsp_total == 2
    assert result.ahsp_fully_priced == 1
    assert result.resource_used_total == 3
    assert result.resource_priced_total == 2
    assert result.coverage_ratio == 0.6667
    assert result.missing_resources[0].resource_code == "R3"


def test_data_coverage_complete_anchor():
    """Manual: AHSP uses R1,R2,R3; price book has all three -> coverage 1.0."""
    result = audit_data_coverage(
        _ahsp_fixture(),
        {"R1": _price("R1"), "R2": _price("R2"), "R3": _price("R3")},
        "jateng",
    )

    assert result.ahsp_fully_priced == 2
    assert result.resource_priced_total == 3
    assert result.coverage_ratio == 1.0
    assert result.missing_resources == []


def test_confidence_anchor_deterministik():
    """Manual: 0.5*0.9 + 0.3*1.0 + 0.2*0.8 = 0.91."""
    result = score_confidence(
        method="read_from_grid",
        quality_score=0.8,
        corroborations=1,
        conflicts=0,
        critical=False,
        weights={"source": 0.5, "corroboration": 0.3, "quality": 0.2},
        ambang_conf=0.7,
    )

    assert result.confidence == 0.91
    assert result.needs_review is False


def test_confidence_conflict_menjadi_review():
    result = score_confidence(
        method="ocr_local",
        quality_score=0.45,
        corroborations=0,
        conflicts=1,
        critical=True,
        weights={"source": 0.5, "corroboration": 0.3, "quality": 0.2},
        ambang_conf=0.7,
    )

    assert result.confidence < 0.7
    assert result.needs_review is True
    assert "critical_without_corroboration" in result.reasons


def test_qa_bobot_dan_sanity_anchor():
    ok = run_qa(QaRequest(weights_pct=[30, 30, 40], tol_bobot=0.1))
    bad_weight = run_qa(QaRequest(weights_pct=[30, 30, 39], tol_bobot=0.1))
    bad_net = run_qa(QaRequest(sanity_checks=[{"a_kotor": 10, "a_neto": 11, "objek_ref": "D1"}]))

    assert ok.passed is True
    assert bad_weight.passed is False
    assert bad_weight.issues[0].code == "F-K01"
    assert bad_net.passed is False
    assert bad_net.issues[0].code == "F-K07"


def test_boe_mempertahankan_assumption_missing_warning():
    ctx = ProjectContext(
        prj_id="PRJ",
        mode="RAB",
        tipe_bangunan="gedung",
        wilayah="Jawa Tengah",
        periode_harga="2026-07",
        ahsp_edisi="sample",
        precedence_order=["schedule", "grid"],
        param_snapshot={"h_upstand": {"value": 0.2, "source": "PARAM"}},
    )
    request = BrainBoeRequest(
        project_context=ctx,
        param_snapshot=BrainParamSnapshot(
            values={"h_upstand": 0.2},
            sources={"h_upstand": "PARAM.h_upstand"},
        ),
        assumptions=[
            BrainAssumption(
                id="ASM-1",
                kategori="parameter",
                deskripsi="h_upstand default dipakai",
                param_ref="h_upstand",
                sumber="PARAM",
                dampak="waterproofing",
                objek_ref="WP1",
            )
        ],
        missing=["harga R3"],
        warnings=[BrainWarning(kode="W-PRC-01", pesan="Harga kosong", objek_ref="R3")],
    )

    boe = build_boe(request)

    assert boe.project_context.prj_id == "PRJ"
    assert boe.assumptions[0].param_ref == "h_upstand"
    assert boe.missing == ["harga R3"]
    assert boe.warnings[0].kode == "W-PRC-01"
