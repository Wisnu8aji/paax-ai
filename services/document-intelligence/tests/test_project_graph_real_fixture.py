from __future__ import annotations

from pathlib import Path

from app.transcription.models import DrawingEvidenceSheet


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = (
    REPO_ROOT
    / "report"
    / "report_drawing_intelligence"
    / "dem_extraction_88pages"
    / "pages"
)


def _sheets() -> list[DrawingEvidenceSheet]:
    paths = sorted(FIXTURE_DIR.glob("page-*.json"))
    page_indices = [int(path.stem.removeprefix("page-")) for path in paths]
    assert page_indices == list(range(88))
    return [
        DrawingEvidenceSheet.model_validate_json(path.read_text(encoding="utf-8"))
        for path in paths
    ]


def _type_node(snapshot, code: str):
    nodes = [
        node
        for node in snapshot.nodes
        if node.type == "element_type" and node.canonical_name == code
    ]
    assert len(nodes) == 1
    return nodes[0]


def test_synthesis_consumes_all_stored_pages_and_preserves_real_fixture_anchors():
    from app.project_graph.synthesis import synthesize_project_graph

    result = synthesize_project_graph(_sheets())
    snapshot = result.snapshot

    assert result.audit.page_count == 88
    assert result.audit.element_type_count == 222
    assert result.audit.merged_type_count == 41
    assert result.audit.occurrence_count == 87
    assert result.audit.merged_occurrence_count == 0
    assert result.audit.possibly_same_count == 14
    assert result.audit.escalation_count == 78
    assert result.audit.conflict_count == 1
    # -156 vs the post-dimension-linking baseline (4374): raw per-page "level"
    # observation nodes (id prefix NODE-, one per sheet mentioning a levels
    # fact) are now excluded from synthesis output, same as element_type
    # already was -- they were pure noise (156 nodes for a project with only
    # 12 genuinely distinct levels, since the "levels" category also captures
    # ramp/roof/elevation markers). The deduplicated replacement
    # (cross_sheet_resolver._level_node(), id prefix LEVEL-) is unaffected.
    assert len(snapshot.nodes) == 4218
    level_nodes = [node for node in snapshot.nodes if node.type == "level"]
    assert len(level_nodes) == 12
    # Each excluded level node also drops its one CONTAINS edge from its sheet.
    assert len(snapshot.edges) == 4583
    has_dimension_edges = [edge for edge in snapshot.edges if edge.relation == "HAS_DIMENSION"]
    assert len(has_dimension_edges) == 168
    assert len(snapshot.missing_information) == 323

    expected_pages = {
        "J2": {20, 21, 26},
        "BV1": {20, 21, 22},
        "RB3": {43, 53, 54, 55},
    }
    for code, page_indices in expected_pages.items():
        node = _type_node(snapshot, code)
        assert {source_ref.page_index for source_ref in node.source_refs} == page_indices

    conflict_nodes = [node for node in snapshot.nodes if node.type == "conflict"]
    page_81_conflict = next(
        node
        for node in conflict_nodes
        if any(source_ref.page_index == 80 for source_ref in node.source_refs)
    )
    conflict_targets = {
        edge.target
        for edge in snapshot.edges
        if edge.source == page_81_conflict.node_id and edge.relation == "CONFLICTS_WITH"
    }
    dimension_nodes = {node.node_id: node for node in snapshot.nodes if node.type == "dimension"}
    assert len(conflict_targets) >= 2
    assert {
        str(dimension_nodes[target].properties["raw"].value)
        for target in conflict_targets
        if target in dimension_nodes
    } >= {"20250", "20000"}
