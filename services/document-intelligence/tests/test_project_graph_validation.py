from __future__ import annotations

import pytest

from app.project_graph.community_builder import build_graph_communities
from app.project_graph.models import (
    NodeProperty,
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
    ProjectGraphSnapshot,
)
from app.project_graph.summary_builder import build_project_graph_summary, compile_level_overview, compile_all_level_overviews
from app.project_graph.validator import (
    ProjectGraphValidationError,
    assert_valid_project_graph,
    validate_project_graph,
    validate_project_graph_snapshot,
)



def _node(node_id: str, node_type: str, name: str, *, status: str = "extracted") -> ProjectGraphNode:
    return ProjectGraphNode(
        node_id=node_id,
        type=node_type,
        canonical_name=name,
        discipline="structure",
        verification_status=status,
        confidence=0.9,
        source_refs=[
            NodeSourceRef(
                document_id="DOC-001",
                page_index=1,
                sheet_id="S-001",
                evidence_refs=[f"EV-{node_id}"],
            )
        ],
    )


def _edge(edge_id: str, source: str, target: str, relation: str = "INSTANCE_OF") -> ProjectGraphEdge:
    return ProjectGraphEdge(
        edge_id=edge_id,
        source=source,
        target=target,
        relation=relation,
        confidence_class="EXTRACTED",
        confidence=0.9,
        evidence_refs=[f"EV-{edge_id}"],
    )


def _valid_nodes() -> list[ProjectGraphNode]:
    return [
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1", "element_occurrence", "Column K1 at Level 1"),
        _node("LEVEL-01", "level", "Level 1"),
    ]


def _valid_edges() -> list[ProjectGraphEdge]:
    return [
        _edge("EDGE-INSTANCE", "ELOC-K1-L1", "ELTYPE-K1"),
        _edge("EDGE-LOCATION", "ELOC-K1-L1", "LEVEL-01", "LOCATED_ON"),
    ]


def _valid_snapshot() -> ProjectGraphSnapshot:
    return ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=_valid_nodes(),
        edges=_valid_edges(),
    )


def test_validator_accepts_a_well_formed_snapshot():
    snapshot = _valid_snapshot()

    report = validate_project_graph_snapshot(snapshot)

    assert report.is_valid is True
    assert report.issues == ()
    assert_valid_project_graph(snapshot.nodes, snapshot.edges)


def test_validator_rejects_duplicate_node_ids():
    nodes = _valid_nodes()
    nodes.append(_node("ELTYPE-K1", "element_type", "Duplicate Column K1"))

    report = validate_project_graph(nodes, _valid_edges())

    assert report.is_valid is False
    assert [issue.code for issue in report.issues] == ["duplicate_node_id"]
    with pytest.raises(ProjectGraphValidationError, match="duplicate_node_id"):
        assert_valid_project_graph(nodes, _valid_edges())


def test_validator_rejects_dangling_edge_endpoints():
    edges = _valid_edges() + [_edge("EDGE-DANGLING", "ELOC-K1-L1", "LEVEL-MISSING", "LOCATED_ON")]

    report = validate_project_graph(_valid_nodes(), edges)

    assert report.is_valid is False
    assert [issue.code for issue in report.issues] == ["dangling_edge_endpoint"]
    assert report.issues[0].edge_id == "EDGE-DANGLING"
    assert report.issues[0].node_id == "LEVEL-MISSING"


def test_validator_rejects_located_on_from_non_occurrence_source():
    edges = _valid_edges() + [_edge("EDGE-WRONG-SOURCE", "ELTYPE-K1", "LEVEL-01", "LOCATED_ON")]

    report = validate_project_graph(_valid_nodes(), edges)

    assert report.is_valid is False
    assert [issue.code for issue in report.issues] == ["invalid_located_on_source"]
    assert report.issues[0].edge_id == "EDGE-WRONG-SOURCE"
    with pytest.raises(ProjectGraphValidationError, match="invalid_located_on_source"):
        assert_valid_project_graph(_valid_nodes(), edges)


def test_validator_rejects_occurrence_with_multiple_located_on_targets():
    nodes = _valid_nodes() + [_node("LEVEL-02", "level", "Level 2")]
    edges = _valid_edges() + [_edge("EDGE-SECOND-LOCATION", "ELOC-K1-L1", "LEVEL-02", "LOCATED_ON")]

    report = validate_project_graph(nodes, edges)

    assert report.is_valid is False
    assert [issue.code for issue in report.issues] == ["multiple_located_on_targets"]
    assert report.issues[0].node_id == "ELOC-K1-L1"
    with pytest.raises(ProjectGraphValidationError, match="multiple_located_on_targets"):
        assert_valid_project_graph(nodes, edges)


def test_validator_rejects_duplicate_located_on_edges_to_the_same_target():
    edges = _valid_edges() + [
        _edge("EDGE-DUPLICATE-LOCATION", "ELOC-K1-L1", "LEVEL-01", "LOCATED_ON")
    ]

    report = validate_project_graph(_valid_nodes(), edges)

    assert [issue.code for issue in report.issues] == ["multiple_located_on_targets"]
    assert report.issues[0].node_id == "ELOC-K1-L1"


def test_validator_rejects_located_on_target_that_is_not_a_level():
    edges = [
        _edge("EDGE-WRONG-TARGET", "ELOC-K1-L1", "ELTYPE-K1", "LOCATED_ON")
    ]

    report = validate_project_graph(_valid_nodes(), edges)

    assert [issue.code for issue in report.issues] == ["invalid_located_on_target"]
    assert report.issues[0].edge_id == "EDGE-WRONG-TARGET"


def test_community_builder_is_stable_for_reordered_inputs():
    forward = build_graph_communities(_valid_nodes(), _valid_edges())
    reverse = build_graph_communities(list(reversed(_valid_nodes())), list(reversed(_valid_edges())))

    assert forward == reverse
    assert len(forward) == 1
    assert forward[0].node_ids == ("ELOC-K1-L1", "ELTYPE-K1", "LEVEL-01")
    assert forward[0].edge_ids == ("EDGE-INSTANCE", "EDGE-LOCATION")
    assert forward[0].label == "element_occurrence: Column K1 at Level 1"


def test_summary_builder_exposes_sorted_auditable_entity_risk_and_conflict_metadata():
    snapshot = _valid_snapshot().model_copy(
        update={
            "nodes": _valid_nodes()
            + [_node("CONFLICT-01", "conflict", "Conflicting column location", status="conflicting")],
            "edges": _valid_edges()
            + [_edge("EDGE-CONFLICT", "CONFLICT-01", "ELOC-K1-L1", "CONFLICTS_WITH")],
        }
    )

    summary = build_project_graph_summary(snapshot)

    assert [entity.node_id for entity in summary.entities] == [
        "CONFLICT-01",
        "ELOC-K1-L1",
        "ELTYPE-K1",
        "LEVEL-01",
    ]
    assert [(risk.artifact_kind, risk.artifact_id, risk.status) for risk in summary.risks] == [
        ("node", "CONFLICT-01", "conflicting"),
    ]
    assert [(conflict.node_id, conflict.related_node_ids) for conflict in summary.conflicts] == [
        ("CONFLICT-01", ("ELOC-K1-L1",)),
    ]


def test_compile_level_overview_multiple_occurrences():
    # (a) 2 occurrence element_type sama di 1 level -> occurrence_count=2
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1-A", "element_occurrence", "Column K1 at Level 1 A"),
        _node("ELOC-K1-L1-B", "element_occurrence", "Column K1 at Level 1 B"),
    ]
    edges = [
        _edge("EDGE-LOC-A", "ELOC-K1-L1-A", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-LOC-B", "ELOC-K1-L1-B", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-TYPE-A", "ELOC-K1-L1-A", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-TYPE-B", "ELOC-K1-L1-B", "ELTYPE-K1", "INSTANCE_OF"),
    ]
    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=edges,
    )

    view = compile_level_overview(snapshot, "LEVEL-01")

    assert view.schema_version == "paax.pckm.summary-view.v1"
    assert view.project_id == "PROJECT-001"
    assert view.snapshot_id == "SNAPSHOT-001"
    assert view.view_kind == "LEVEL_OVERVIEW"
    assert view.grain.level_id == "LEVEL-01"

    assert view.summary.level_name == "Level 1"
    assert len(view.summary.element_type_index) == 1
    assert view.summary.element_type_index[0].element_type_id == "ELTYPE-K1"
    assert view.summary.element_type_index[0].name == "Column K1"
    assert view.summary.element_type_index[0].occurrence_count == 2

    assert len(view.summary.discipline_counts) == 1
    assert view.summary.discipline_counts[0].discipline == "structure"
    assert view.summary.discipline_counts[0].occurrence_count == 2

    assert view.quality.confirmed_count == 2
    assert view.quality.ambiguous_binding_count == 0
    assert view.quality.conflict_count == 0


def test_compile_level_overview_ambiguous_binding():
    # (b) occurrence dengan POSSIBLY_SAME_AS edge -> masuk ambiguous_binding_ids, TIDAK masuk confirmed_count
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1-A", "element_occurrence", "Column K1 at Level 1 A"),
        _node("ELOC-K1-L1-B", "element_occurrence", "Column K1 at Level 1 B"),
    ]
    edges = [
        _edge("EDGE-LOC-A", "ELOC-K1-L1-A", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-LOC-B", "ELOC-K1-L1-B", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-TYPE-A", "ELOC-K1-L1-A", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-TYPE-B", "ELOC-K1-L1-B", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-POSS-SAME", "ELOC-K1-L1-A", "ELOC-K1-L1-B", "POSSIBLY_SAME_AS"),
    ]
    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=edges,
    )

    view = compile_level_overview(snapshot, "LEVEL-01")

    assert view.quality.ambiguous_binding_ids == ["EDGE-POSS-SAME"]
    assert view.quality.ambiguous_binding_count == 2
    assert view.quality.confirmed_count == 0
    assert view.quality.conflict_count == 0


def test_compile_level_overview_empty_level():
    # (c) level tanpa occurrence sama sekali -> summary kosong tapi tidak error
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
    ]
    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=[],
    )

    view = compile_level_overview(snapshot, "LEVEL-01")

    assert view.summary.level_name == "Level 1"
    assert view.summary.element_type_index == []
    assert view.summary.discipline_counts == []
    assert view.summary.stored_measurement_facts == []
    assert view.quality.confirmed_count == 0
    assert view.quality.ambiguous_binding_count == 0
    assert view.quality.conflict_count == 0


def test_compile_level_overview_scope_leak():
    # (d) occurrence di level LAIN tidak ikut kehitung (scope leak check)
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
        _node("LEVEL-02", "level", "Level 2"),
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1", "element_occurrence", "Column K1 at Level 1"),
        _node("ELOC-K1-L2", "element_occurrence", "Column K1 at Level 2"),
    ]
    edges = [
        _edge("EDGE-LOC-1", "ELOC-K1-L1", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-LOC-2", "ELOC-K1-L2", "LEVEL-02", "LOCATED_ON"),
        _edge("EDGE-TYPE-1", "ELOC-K1-L1", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-TYPE-2", "ELOC-K1-L2", "ELTYPE-K1", "INSTANCE_OF"),
    ]
    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=edges,
    )

    view = compile_level_overview(snapshot, "LEVEL-01")

    assert len(view.summary.element_type_index) == 1
    assert view.summary.element_type_index[0].element_type_id == "ELTYPE-K1"
    assert view.summary.element_type_index[0].occurrence_count == 1

    assert view.quality.confirmed_count == 1


def test_compile_level_overview_measurement_facts():
    # Extra test: stored_measurement_facts are populated when valid dimension nodes exist
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1", "element_occurrence", "Column K1 at Level 1"),
        _node("ELEMREF-K1", "drawing_reference", "Column K1 on Sheet 1"),
        ProjectGraphNode(
            node_id="DIM-1500",
            type="dimension",
            canonical_name="1500",
            properties={
                "unit": NodeProperty(value="mm", evidence_refs=["EV-DIM"]),
                "numeric_value": NodeProperty(value=1500, evidence_refs=["EV-DIM"]),
            },
            discipline="structure",
            verification_status="extracted",
            confidence=0.9,
            source_refs=[
                NodeSourceRef(
                    document_id="DOC-001",
                    page_index=1,
                    sheet_id="S-001",
                    evidence_refs=["EV-DIM"],
                )
            ],
        ),
    ]

    # Explicitly set the same source refs on ELEMREF so it maps to ELOC
    nodes[3].source_refs = [
        NodeSourceRef(
            document_id="DOC-001",
            page_index=1,
            sheet_id="S-001",
            evidence_refs=["EV-ELEMREF"],
        )
    ]
    # And make sure ELOC has matching source refs so they are linked
    nodes[2].source_refs = [
        NodeSourceRef(
            document_id="DOC-001",
            page_index=1,
            sheet_id="S-001",
            evidence_refs=["EV-ELEMREF"],
        )
    ]

    edges = [
        _edge("EDGE-LOC", "ELOC-K1-L1", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-TYPE", "ELOC-K1-L1", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-SAME", "ELEMREF-K1", "ELTYPE-K1", "SAME_AS"),
        _edge("EDGE-DIM", "ELEMREF-K1", "DIM-1500", "HAS_DIMENSION"),
    ]

    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=edges,
    )

    view = compile_level_overview(snapshot, "LEVEL-01")

    assert len(view.summary.stored_measurement_facts) == 1
    assert view.summary.stored_measurement_facts[0].name == "1500"
    assert view.summary.stored_measurement_facts[0].value == 1500
    assert view.summary.stored_measurement_facts[0].unit == "mm"
    assert view.summary.stored_measurement_facts[0].evidence_refs == ["EV-DIM"]


def test_compile_all_level_overviews():
    nodes = [
        _node("LEVEL-01", "level", "Level 1"),
        _node("LEVEL-02", "level", "Level 2"),
        _node("ELTYPE-K1", "element_type", "Column K1"),
        _node("ELOC-K1-L1", "element_occurrence", "Column 1"),
        _node("ELOC-K1-L2", "element_occurrence", "Column 2"),
    ]
    edges = [
        _edge("EDGE-TYPE-1", "ELOC-K1-L1", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-TYPE-2", "ELOC-K1-L2", "ELTYPE-K1", "INSTANCE_OF"),
        _edge("EDGE-LOC-1", "ELOC-K1-L1", "LEVEL-01", "LOCATED_ON"),
        _edge("EDGE-LOC-2", "ELOC-K1-L2", "LEVEL-02", "LOCATED_ON"),
    ]
    snapshot = ProjectGraphSnapshot(
        project_id="PROJECT-001",
        snapshot_id="SNAPSHOT-001",
        nodes=nodes,
        edges=edges,
    )

    views = compile_all_level_overviews(snapshot)
    assert len(views) == 2

    # Map views by level_id
    views_by_level = {v.grain.level_id: v for v in views}
    assert "LEVEL-01" in views_by_level
    assert "LEVEL-02" in views_by_level

    v1 = views_by_level["LEVEL-01"]
    assert v1.summary.level_name == "Level 1"
    assert len(v1.summary.element_type_index) == 1
    assert v1.summary.element_type_index[0].element_type_id == "ELTYPE-K1"
    assert v1.summary.element_type_index[0].occurrence_count == 1

    v2 = views_by_level["LEVEL-02"]
    assert v2.summary.level_name == "Level 2"
    assert len(v2.summary.element_type_index) == 1
    assert v2.summary.element_type_index[0].element_type_id == "ELTYPE-K1"
    assert v2.summary.element_type_index[0].occurrence_count == 1

