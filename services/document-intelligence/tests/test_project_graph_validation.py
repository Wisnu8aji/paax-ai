from __future__ import annotations

import pytest

from app.project_graph.community_builder import build_graph_communities
from app.project_graph.models import (
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
    ProjectGraphSnapshot,
)
from app.project_graph.summary_builder import build_project_graph_summary
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
