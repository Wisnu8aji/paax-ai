"""Typed, auditable summary views for project graph snapshots.

This module only projects stored graph metadata. It never calculates RAB, BoQ,
HSP, duration, volume, or other project quantities.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode, ProjectGraphSnapshot


@dataclass(frozen=True)
class GraphSourceReference:
    document_id: str
    page_index: int
    sheet_id: str
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True)
class GraphEntityMetadata:
    node_id: str
    node_type: str
    canonical_name: str
    discipline: str
    verification_status: str
    confidence: float
    source_refs: tuple[GraphSourceReference, ...]


@dataclass(frozen=True)
class GraphRiskMetadata:
    artifact_kind: Literal["node", "edge"]
    artifact_id: str
    status: str
    confidence: float
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True)
class GraphConflictMetadata:
    node_id: str
    canonical_name: str
    related_node_ids: tuple[str, ...]
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True)
class ProjectGraphSummary:
    project_id: str
    snapshot_id: str
    entities: tuple[GraphEntityMetadata, ...]
    risks: tuple[GraphRiskMetadata, ...]
    conflicts: tuple[GraphConflictMetadata, ...]


def build_project_graph_summary(snapshot: ProjectGraphSnapshot) -> ProjectGraphSummary:
    """Return a stable metadata projection of a graph snapshot for audit surfaces."""
    ordered_nodes = tuple(sorted(snapshot.nodes, key=lambda node: node.node_id))
    ordered_edges = tuple(sorted(snapshot.edges, key=lambda edge: edge.edge_id))

    entities = tuple(_entity_metadata(node) for node in ordered_nodes)
    risks = tuple(
        sorted(
            [
                *(_node_risk(node) for node in ordered_nodes if node.verification_status in {"ambiguous", "conflicting"}),
                *(
                    _edge_risk(edge)
                    for edge in ordered_edges
                    if edge.confidence_class in {"AMBIGUOUS", "CONFLICTING"}
                ),
            ],
            key=lambda risk: (risk.artifact_kind, risk.artifact_id),
        )
    )
    conflict_edges = _conflict_edges_by_node(ordered_edges)
    conflicts = tuple(
        _conflict_metadata(node, conflict_edges.get(node.node_id, ()))
        for node in ordered_nodes
        if node.type == "conflict"
    )

    return ProjectGraphSummary(
        project_id=snapshot.project_id,
        snapshot_id=snapshot.snapshot_id,
        entities=entities,
        risks=risks,
        conflicts=conflicts,
    )


def _entity_metadata(node: ProjectGraphNode) -> GraphEntityMetadata:
    source_refs = tuple(
        GraphSourceReference(
            document_id=source_ref.document_id,
            page_index=source_ref.page_index,
            sheet_id=source_ref.sheet_id,
            evidence_refs=tuple(sorted(source_ref.evidence_refs)),
        )
        for source_ref in sorted(
            node.source_refs,
            key=lambda source_ref: (source_ref.document_id, source_ref.page_index, source_ref.sheet_id),
        )
    )
    return GraphEntityMetadata(
        node_id=node.node_id,
        node_type=node.type,
        canonical_name=node.canonical_name,
        discipline=node.discipline,
        verification_status=node.verification_status,
        confidence=node.confidence,
        source_refs=source_refs,
    )


def _node_risk(node: ProjectGraphNode) -> GraphRiskMetadata:
    return GraphRiskMetadata(
        artifact_kind="node",
        artifact_id=node.node_id,
        status=node.verification_status,
        confidence=node.confidence,
        evidence_refs=_node_evidence_refs(node),
    )


def _edge_risk(edge: ProjectGraphEdge) -> GraphRiskMetadata:
    return GraphRiskMetadata(
        artifact_kind="edge",
        artifact_id=edge.edge_id,
        status=edge.confidence_class,
        confidence=edge.confidence,
        evidence_refs=tuple(sorted(edge.evidence_refs)),
    )


def _conflict_edges_by_node(
    edges: tuple[ProjectGraphEdge, ...]
) -> dict[str, tuple[ProjectGraphEdge, ...]]:
    by_node: dict[str, list[ProjectGraphEdge]] = {}
    for edge in edges:
        if edge.relation != "CONFLICTS_WITH":
            continue
        by_node.setdefault(edge.source, []).append(edge)
        by_node.setdefault(edge.target, []).append(edge)
    return {
        node_id: tuple(sorted(node_edges, key=lambda edge: edge.edge_id))
        for node_id, node_edges in by_node.items()
    }


def _conflict_metadata(
    node: ProjectGraphNode, edges: tuple[ProjectGraphEdge, ...]
) -> GraphConflictMetadata:
    related_node_ids = tuple(
        sorted(
            {
                edge.target if edge.source == node.node_id else edge.source
                for edge in edges
            }
        )
    )
    evidence_refs = tuple(
        sorted(
            {
                *_node_evidence_refs(node),
                *(evidence_ref for edge in edges for evidence_ref in edge.evidence_refs),
            }
        )
    )
    return GraphConflictMetadata(
        node_id=node.node_id,
        canonical_name=node.canonical_name,
        related_node_ids=related_node_ids,
        evidence_refs=evidence_refs,
    )


def _node_evidence_refs(node: ProjectGraphNode) -> tuple[str, ...]:
    return tuple(sorted({evidence_ref for source_ref in node.source_refs for evidence_ref in source_ref.evidence_refs}))
