from __future__ import annotations

import pytest
from app.drawing_intelligence.candidate_inventory import (
    CandidateInventoryRow,
    build_candidate_inventory,
)
from app.drawing_intelligence.models import (
    BBox,
    DetectionCandidate,
    DrawingPackageAnalysis,
    PageIntelligence,
    PageProfile,
    WorkItemCandidate,
)


def test_build_candidate_inventory_lossless_id_matching():
    detection1 = DetectionCandidate(
        candidate_id="cand-001",
        page_index=0,
        category="column",
        status="accepted",
        evidence_refs=["ev-1"],
        bbox=BBox(x0=0, y0=0, x1=1, y1=1),
        confidence=0.9,
        method="dem",
    )
    detection2 = DetectionCandidate(
        candidate_id="cand-002",
        page_index=0,
        category="beam",
        status="needs_review",
        evidence_refs=["ev-2"],
        bbox=BBox(x0=0, y0=0, x1=1, y1=1),
        confidence=0.8,
        method="dem",
    )
    work_item = WorkItemCandidate(
        work_item_id="item-001",
        category="column",
        code="K1",
        label="Kolom K1",
        page_indices=[0],
        maturity="observed",
        calculation_readiness="ready",
        evidence_refs=["ev-1"],
    )

    page = PageIntelligence(
        profile=PageProfile(
            page_index=0,
            width_pt=595.0,
            height_pt=842.0,
            rotation=0,
            modality="vector",
            vector_text_spans=0,
            vector_paths=0,
            raster_images=0,
            confidence=1.0,
        ),
        detections=[detection1, detection2],
    )
    analysis = DrawingPackageAnalysis(
        package_id="pkg-001",
        document_name="test.pdf",
        document_sha256="abc",
        page_count=1,
        pages=[page],
        work_items=[work_item],
    )

    inventory = build_candidate_inventory(analysis)

    # Assert lossless: all candidate IDs present
    inventory_ids = {row.candidate_id for row in inventory}
    assert "cand-001" in inventory_ids
    assert "cand-002" in inventory_ids
    assert "item-001" in inventory_ids

    # Assert coverage status mapping
    row_map = {row.candidate_id: row for row in inventory}
    assert row_map["cand-001"].coverage_status == "ready"
    assert row_map["cand-002"].coverage_status == "needs_review"
    assert row_map["cand-002"].reason == "detection_needs_review"
    assert row_map["item-001"].coverage_status == "ready"


def test_build_candidate_inventory_unsupported_as_blocked():
    unsupported_item = WorkItemCandidate(
        work_item_id="item-unsupported-01",
        category="unknown_exotic",
        code="EX1",
        label="Exotic Item",
        page_indices=[0],
        maturity="observed",
        calculation_readiness="blocked",
        evidence_refs=["ev-99"],
    )

    analysis = DrawingPackageAnalysis(
        package_id="pkg-002",
        document_name="test.pdf",
        document_sha256="abc",
        page_count=1,
        pages=[],
        work_items=[unsupported_item],
    )

    inventory = build_candidate_inventory(analysis)
    assert len(inventory) == 1
    row = inventory[0]
    assert row.candidate_id == "item-unsupported-01"
    assert row.coverage_status == "blocked"
    assert row.reason == "unsupported_or_incomplete_engine_contract"
