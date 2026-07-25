import pytest
from app.project_graph.constraint_resolver import (
    resolve_candidates,
    calculate_distance,
    check_boundary_crossing,
    check_same_view,
    check_table_row_alignment,
)
from app.project_graph.cross_sheet_resolver import resolve_cross_sheet
from app.project_graph.alias_resolver import AliasResolution
from app.project_graph.models import ProjectGraphNode, ProjectGraphEdge
from app.project_graph.synthesis_types import SheetKnowledgePatch, SheetFact, SheetCompletionState

def test_two_candidates_same_score_ties_become_ambiguous():
    # Two candidates at the exact same position (same distance)
    source_bbox = (10.0, 10.0, 20.0, 20.0)
    candidates = [
        {"node_id": "cand_1", "bbox": (30.0, 10.0, 40.0, 20.0), "confidence": 0.9, "status": "extracted"},
        {"node_id": "cand_2", "bbox": (30.0, 10.0, 40.0, 20.0), "confidence": 0.9, "status": "extracted"}
    ]
    
    best_cand, state, scored = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="label_to_dimension",
        max_distance=100.0,
    )
    
    assert best_cand is not None
    assert state == "ambiguous"
    assert len(scored) == 2
    assert scored[0].score == scored[1].score

def test_far_candidate_rejected():
    # Candidate exceeds max_distance threshold (100.0)
    source_bbox = (10.0, 10.0, 20.0, 20.0)
    candidates = [
        {"node_id": "cand_1", "bbox": (200.0, 10.0, 210.0, 20.0), "confidence": 0.9, "status": "extracted"}
    ]
    
    best_cand, state, scored = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="label_to_dimension",
        max_distance=100.0,
    )
    
    assert best_cand is None
    assert state == "rejected"
    assert scored[0].score == 0.0

def test_cross_viewport_binding_rejected_no_boundary_crossing():
    # Candidates in different viewports
    source_bbox = (10.0, 10.0, 20.0, 20.0) # Resides in view_1
    candidates = [
        {"node_id": "cand_in_view_2", "bbox": (450.0, 10.0, 460.0, 20.0), "confidence": 0.9, "status": "extracted"}
    ]
    
    views = [
        {"bbox": (0.0, 0.0, 400.0, 400.0), "view_id": "view_1"},
        {"bbox": (405.0, 0.0, 800.0, 400.0), "view_id": "view_2"}
    ]
    
    # Resolving with views defined: cross-viewport binding should yield a boundary crossing constraint failure
    best_cand, state, scored = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="label_to_dimension",
        views=views,
        max_distance=500.0, # distance allows it, but view border rejects it
    )
    
    assert best_cand is None
    assert state == "rejected"
    assert "no_boundary_crossing" in scored[0].failed_constraints
    assert scored[0].score == 0.0

def test_schedule_row_alignment():
    # Target schedule row aligns with label y-center vs another target that is misaligned
    source_bbox = (100.0, 150.0, 120.0, 160.0) # y-center = 155.0
    
    candidates = [
        {"node_id": "aligned_row", "bbox": (300.0, 152.0, 400.0, 158.0), "confidence": 0.9, "status": "extracted"}, # y-center = 155.0
        {"node_id": "misaligned_row", "bbox": (300.0, 250.0, 400.0, 260.0), "confidence": 0.9, "status": "extracted"} # y-center = 255.0
    ]
    
    best_cand, state, scored = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="type_to_schedule_row",
        max_distance=500.0,
    )
    
    assert best_cand is not None
    assert best_cand["node_id"] == "aligned_row"
    assert state in {"accepted", "validated"}
    
    # Check that aligned_row passed table_row_alignment, and misaligned_row failed it
    aligned_score_meta = next(c for c in scored if c.target_node_id == "aligned_row")
    misaligned_score_meta = next(c for c in scored if c.target_node_id == "misaligned_row")
    
    assert "table_row_alignment" in aligned_score_meta.passed_constraints
    assert "table_row_alignment" in misaligned_score_meta.failed_constraints

def test_leader_line_constraint():
    source_bbox = (10.0, 10.0, 20.0, 20.0)
    candidates = [
        {"node_id": "cand_1", "bbox": (30.0, 10.0, 40.0, 20.0), "confidence": 0.9, "status": "extracted"}
    ]
    
    # Resolve with leader line present
    best_cand_ll, _, scored_ll = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="label_to_dimension",
        leader_line_func=lambda c: True,
    )
    
    # Resolve without leader line
    best_cand_no_ll, _, scored_no_ll = resolve_candidates(
        source_bbox=source_bbox,
        candidates=candidates,
        relation_type="label_to_dimension",
        leader_line_func=lambda c: False,
    )
    
    # Score with leader line should be higher
    assert scored_ll[0].score > scored_no_ll[0].score
    assert scored_ll[0].score_breakdown["leader_line"] == 1.0
    assert scored_no_ll[0].score_breakdown["leader_line"] == 0.5

def test_conflict_preserved_and_audited():
    # Verify that resolve_cross_sheet includes resolution metadata on edges
    # Construct a simple SheetKnowledgePatch
    patch = SheetKnowledgePatch(
        sheet_id="S-1",
        document_id="D-1",
        project_id="P-1",
        run_id="R-1",
        page_index=0,
        discipline="architecture",
        completion=SheetCompletionState(sections_expected=1, sections_completed=1, is_complete=True),
        facts=[
            # A dimension fact
            SheetFact(
                fact_id="F-DIM-1",
                category="dimensions",
                raw="800mm",
                normalized="800mm",
                bbox=(30.0, 10.0, 40.0, 20.0),
                confidence=0.9,
                status="extracted",
                attributes={"node_id": "DIM-NODE-1"}
            ),
            # An element label fact
            SheetFact(
                fact_id="F-LABEL-1",
                category="element_labels",
                raw="K1",
                normalized="K1",
                bbox=(10.0, 10.0, 20.0, 20.0),
                confidence=0.95,
                status="extracted"
            )
        ],
        nodes=[
            ProjectGraphNode(
                node_id="SHEET-1",
                type="sheet",
                canonical_name="Denah Lantai 1",
                properties={"title": {"value": "Denah Lantai 1"}},
                discipline="architecture",
                verification_status="extracted",
                confidence=1.0,
            ),
            ProjectGraphNode(
                node_id="DIM-NODE-1",
                type="dimension",
                canonical_name="800mm",
                discipline="architecture",
                verification_status="extracted",
                confidence=0.9,
            )
        ]
    )
    
    aliases = AliasResolution(
        project_id="P-1",
        nodes=[
            ProjectGraphNode(
                node_id="TYPE-K1",
                type="element_type",
                canonical_name="K1",
                discipline="architecture",
                verification_status="extracted",
                confidence=0.95,
            )
        ]
    )
    
    res = resolve_cross_sheet([patch], aliases)
    
    # We should have a HAS_DIMENSION edge between the reference node and the dimension node
    dim_edge = next((edge for edge in res.edges if edge.relation == "HAS_DIMENSION"), None)
    assert dim_edge is not None
    assert dim_edge.resolver is not None
    assert dim_edge.resolver.method == "constraint_scored_binding_v2"
    assert dim_edge.resolver.candidates_considered == 1
    assert dim_edge.resolver.score_breakdown is not None
    assert "distance" in dim_edge.resolver.score_breakdown
    assert dim_edge.resolution_state is not None
    assert dim_edge.resolution_state in {"accepted", "validated", "proposed"}
