from __future__ import annotations

from app.drawing_intelligence.candidate_inventory import build_candidate_inventory
from app.drawing_intelligence.models import (
    BBox, DetectionCandidate, DrawingPackageAnalysis, PageIntelligence, PageProfile, WorkItemCandidate,
)
from app.drawing_intelligence.human_delivery import build_human_delivery


def analysis() -> DrawingPackageAnalysis:
    page = PageIntelligence(
        profile=PageProfile(page_index=0, width_pt=100, height_pt=100, rotation=0, modality="vector", vector_text_spans=1, vector_paths=1, raster_images=0, confidence=1.0),
        detections=[
            DetectionCandidate(candidate_id="DEM-1", page_index=0, category="column", bbox=BBox(x0=0, y0=0, x1=1, y1=1), confidence=0.9, method="dem", status="accepted", evidence_refs=["EV-1"]),
            DetectionCandidate(candidate_id="DEM-2", page_index=0, category="unknown", bbox=BBox(x0=0.5, y0=0.5, x1=0.9, y1=0.9), confidence=0.5, method="dem", status="needs_review", evidence_refs=["EV-2"]),
        ],
    )
    return DrawingPackageAnalysis(
        package_id="PKG", document_name="x.pdf", document_sha256="abc", page_count=1,
        pages=[page],
        construction_graph={"pckm_candidates": [
            {"candidate_id": "PCKM-1", "page_index": 0, "category": "beam", "evidence_refs": ["EV-3"], "status": "verified"},
            {"candidate_id": "PCKM-2", "page_index": 0, "category": "mep", "evidence_refs": ["EV-4"], "status": "candidate"},
        ]},
        work_items=[
            WorkItemCandidate(work_item_id="WI-1", category="column", label="K1", page_indices=[0], maturity="review_ready", calculation_readiness="ready", evidence_refs=["EV-1"]),
            WorkItemCandidate(work_item_id="WI-2", category="unknown", label="Unknown", page_indices=[0], maturity="blocked", calculation_readiness="blocked", evidence_refs=["EV-2"]),
        ],
    )


def test_inventory_preserves_every_source_candidate_exactly_once():
    rows = build_candidate_inventory(analysis())
    assert {(row.origin, row.candidate_id) for row in rows} == {
        ("dem", "DEM-1"), ("dem", "DEM-2"),
        ("pckm", "PCKM-1"), ("pckm", "PCKM-2"),
        ("consolidated_registry", "WI-1"), ("consolidated_registry", "WI-2"),
    }
    assert len(rows) == 6
    assert next(row for row in rows if row.candidate_id == "WI-2").coverage_status == "blocked"
    assert next(row for row in rows if row.candidate_id == "DEM-2").coverage_status == "needs_review"


def test_human_delivery_exposes_lossless_inventory_separate_from_presentation_filtering():
    payload = build_human_delivery(analysis())
    assert len(payload["candidate_inventory"]) == 6
    assert {row["candidate_id"] for row in payload["candidate_inventory"]} == {"DEM-1", "DEM-2", "PCKM-1", "PCKM-2", "WI-1", "WI-2"}
