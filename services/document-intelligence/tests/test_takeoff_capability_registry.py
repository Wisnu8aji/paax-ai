from __future__ import annotations

import pytest
from app.drawing_intelligence.candidate_inventory import CandidateInventoryRow
from app.perception.takeoff_capability_registry import (
    CoverageRow,
    TakeoffCapability,
    build_coverage_report,
    resolve_takeoff_capability,
)


def test_resolve_takeoff_capability_known_categories():
    # TKG Beton, Bekisting, Besi
    cap_beton = resolve_takeoff_capability("beton")
    assert cap_beton is not None
    assert cap_beton.endpoint == "/tkg/takeoff"
    assert cap_beton.source_authority == "none"
    assert cap_beton.status == "ready"
    assert "panjang_m" in cap_beton.required_fields

    cap_bekisting = resolve_takeoff_capability("bekisting")
    assert cap_bekisting is not None
    assert cap_bekisting.endpoint == "/tkg/takeoff"

    cap_besi = resolve_takeoff_capability("besi")
    assert cap_besi is not None
    assert cap_besi.endpoint == "/tkg/takeoff"

    # Core Engine Takeoff Modules: tanah, dinding, arsitektur, baja, atap, kusen, mep, mep-advanced, smkk
    for cat in ["tanah", "dinding", "arsitektur", "baja", "atap", "kusen", "mep", "mep-advanced", "smkk"]:
        cap = resolve_takeoff_capability(cat)
        assert cap is not None
        assert cap.endpoint == f"/takeoff/{cat}"
        assert cap.source_authority == "none"
        assert len(cap.required_fields) > 0


def test_resolve_takeoff_capability_unknown_category():
    cap = resolve_takeoff_capability("unknown_exotic")
    assert cap is None


def test_build_coverage_report_lossless_matching_and_no_premature_authority():
    inventory = [
        CandidateInventoryRow(
            candidate_id="cand-beton-01",
            origin="dem",
            page_index=0,
            evidence_refs=["ev-1"],
            category="beton",
            coverage_status="ready",
        ),
        CandidateInventoryRow(
            candidate_id="cand-unknown-02",
            origin="pckm",
            page_index=1,
            evidence_refs=["ev-2"],
            category="magic_item",
            coverage_status="blocked",
            reason="unsupported_category",
        ),
        CandidateInventoryRow(
            candidate_id="cand-dinding-03",
            origin="consolidated_registry",
            page_index=0,
            evidence_refs=["ev-3"],
            category="dinding",
            coverage_status="needs_review",
            reason="unresolved_conflict",
        ),
    ]

    report = build_coverage_report(
        inventory,
        provided_evidence_fields={
            "cand-beton-01": ["panjang_m", "lebar_m", "tinggi_m"],
            "cand-dinding-03": ["panjang_m"],  # missing tinggi_m
        },
    )

    # 1. Lossless: input ID set equals output work_id set exactly
    input_ids = {row.candidate_id for row in inventory}
    output_ids = {row.work_id for row in report}
    assert input_ids == output_ids
    assert len(report) == 3

    # 2. Source authority must NEVER be core_engine before Engine calculation
    for row in report:
        assert row.source_authority in ("none", "review")
        assert row.source_authority != "core_engine"

    report_map = {row.work_id: row for row in report}

    # Ready candidate with all required fields
    beton_row = report_map["cand-beton-01"]
    assert beton_row.endpoint == "/tkg/takeoff"
    assert beton_row.readiness == "ready"
    assert beton_row.missing_fields == []

    # Unknown category -> absent endpoint -> explicit blocked
    unknown_row = report_map["cand-unknown-02"]
    assert unknown_row.endpoint is None
    assert unknown_row.readiness == "blocked"

    # Dinding candidate with missing field -> missing_fields populated, readiness needs_review/blocked
    dinding_row = report_map["cand-dinding-03"]
    assert dinding_row.endpoint == "/takeoff/dinding"
    assert "tinggi_m" in dinding_row.missing_fields
    assert dinding_row.readiness in ("needs_review", "blocked")
