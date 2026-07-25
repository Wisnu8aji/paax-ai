from pathlib import Path

import fitz

from app.drawing_intelligence.advanced_zones import HierarchicalViewZone
from app.drawing_intelligence.definition_intelligence_v2 import (
    build_definition_candidates, extract_table_cells, resolve_definition,
)
from app.drawing_intelligence.models import BBox
from app.drawing_intelligence.physical_instances_v2 import InstanceCandidateV2, reconstruct_instances_v2

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"


def test_k2_definition_resolves_from_schedule_page():
    doc = fitz.open(PDF)
    try:
        cells = extract_table_cells(doc[49], 49)
        candidates = build_definition_candidates(cells)
        resolution = resolve_definition("K2", candidates)
        assert resolution.selected is not None, [c.model_dump() for c in candidates]
        assert (resolution.selected.width_mm, resolution.selected.depth_mm) == (250, 600)
        assert resolution.selected.cell_evidence_ids
    finally:
        doc.close()


def test_instance_reconstruction_excludes_legend_and_deduplicates_channels():
    zones = [
        HierarchicalViewZone(zone_id="drawing", page_index=42, type="drawing", bbox=BBox(x0=0,y0=0,x1=1,y1=1), confidence=1),
        HierarchicalViewZone(zone_id="legend", page_index=42, type="legend", bbox=BBox(x0=.8,y0=0,x1=1,y1=.3), confidence=1, exclusion_for_physical_count=True),
    ]
    candidates = [
        InstanceCandidateV2(candidate_id="a", page_index=42, code="K2", category="column", level="L2", bbox=BBox(x0=.1,y0=.1,x1=.13,y1=.14), confidence=.96, source_channel="native_pdf", evidence_refs=["e1"]),
        InstanceCandidateV2(candidate_id="b", page_index=42, code="K2", category="column", level="L2", bbox=BBox(x0=.101,y0=.101,x1=.131,y1=.141), confidence=.95, source_channel="dem", evidence_refs=["e2"]),
        InstanceCandidateV2(candidate_id="legend-k2", page_index=42, code="K2", category="column", level="L2", bbox=BBox(x0=.85,y0=.1,x1=.9,y1=.2), confidence=.99, source_channel="native_pdf", evidence_refs=["e3"]),
    ]
    result = reconstruct_instances_v2(candidates, zones)
    assert len(result.instances) == 1
    assert result.instances[0].authority == "engine_verified"
    assert result.counts == {"L2:K2": 1}
    assert set(result.duplicate_candidate_ids) == {"b"}
    assert set(result.rejected_candidate_ids) == {"legend-k2"}


def test_active_conflict_cancels_auto_confirmation():
    candidate = InstanceCandidateV2(candidate_id="a", page_index=42, code="K2", category="column", level="L2", bbox=BBox(x0=.1,y0=.1,x1=.13,y1=.14), confidence=.99, source_channel="native_pdf")
    result = reconstruct_instances_v2([candidate], [], active_conflicts=["count-conflict"])
    assert result.auto_confirmed is False
    assert result.instances[0].authority == "candidate"
