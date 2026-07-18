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
    # A4 quarantines 55 element-label observations whose refs are entirely
    # dangling across the affected pages; only evidence-backed labels remain.
    assert result.audit.element_type_count == 185
    assert result.audit.merged_type_count == 34
    # SPEC A3 keeps the A2 occurrence contexts while re-keying level evidence
    # before occurrence binding. This count is a graph-context anchor, never a
    # takeoff quantity.
    assert result.audit.occurrence_count == 75
    assert result.audit.merged_occurrence_count == 0
    assert result.audit.possibly_same_count == 7
    assert result.audit.escalation_count == 37
    assert result.audit.conflict_count == 1
    # Raw per-page level observations stay excluded. A3 adds five canonical
    # level records (L1, L2, Atap, Substruktur, qualified roof) and reuses the
    # pre-existing unmapped review placeholder only where A2 already needed it.
    # 774 observation nodes are quarantined directly. The net snapshot delta
    # also reflects downstream canonical/alias materialization after those
    # source facts disappear.
    assert len(snapshot.nodes) == 3407
    level_nodes = [node for node in snapshot.nodes if node.type == "level"]
    canonical_levels = [
        node for node in level_nodes if not node.canonical_name.startswith("Lantai Tidak Terpetakan")
    ]
    assert {node.canonical_name for node in canonical_levels} == {
        "Lantai 1", "Lantai 2", "Atap", "Substruktur", "Lantai-Atap P +16.20"
    }
    levels_by_name = {node.canonical_name: node for node in canonical_levels}
    assert levels_by_name["Lantai 1"].properties["elevation"].value == f"{chr(177)}0.000"
    assert levels_by_name["Lantai 2"].properties["elevation"].value == "+4.400"
    assert levels_by_name["Atap"].properties["elevation"].value == "+8.300"
    assert "-1.300" in levels_by_name["Substruktur"].properties["elevation"].value
    assert levels_by_name["Lantai-Atap P +16.20"].verification_status == "ambiguous"
    assert any(
        edge.relation == "POSSIBLY_SAME_AS"
        and edge.resolver is not None
        and edge.resolver.method == "deterministic_level_review"
        for edge in snapshot.edges
    )
    # Each excluded level node also drops its one CONTAINS edge from its sheet.
    assert len(snapshot.edges) == 3720
    has_dimension_edges = [edge for edge in snapshot.edges if edge.relation == "HAS_DIMENSION"]
    assert len(has_dimension_edges) == 153
    # Deterministic anchor: 774 quarantine records are retained one-for-one
    # in missing information and 240 surviving entries are A2/A3 review
    # findings (1014 total). The prior 1016 full-suite result was two live
    # semantic-provider review entries caused by an implicit env activation;
    # they are deliberately excluded from this deterministic fixture anchor.
    assert len(snapshot.missing_information) == 1014

    # Hal. 43 (index 42) "DENAH KOLOM LANTAI 2" has no architectural spaces.
    # Its 12 K1A, 3 K2, and 2 K3 labels therefore use the nearest grid fact;
    # each code has one distinct Lantai 2/grid context and label_count records
    # the extracted label sources in that context.
    for code, label_count in {"KOLOM K1A": 12, "KOLOM K2": 3, "KOLOM K3": 2}.items():
        occurrences = [
            node
            for node in snapshot.nodes
            if node.type == "element_occurrence"
            and node.canonical_name.startswith(f"{code} @ Lantai 2 / Grid Line")
            and any(source_ref.page_index == 42 for source_ref in node.source_refs)
        ]
        assert len(occurrences) == 1
        assert occurrences[0].properties["grid"].value == "Grid Line 4"
        assert occurrences[0].properties["label_count"].value == label_count

    # Schedules are definitional and sections span floors: neither page may
    # add a located occurrence, even when its label matches a plan type.
    assert not [
        node for node in snapshot.nodes
        if node.type == "element_occurrence"
        and any(source_ref.page_index in {50, 53} for source_ref in node.source_refs)
    ]

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
