"""Deterministic lifting of explicit sheet conflicts into graph records."""
from __future__ import annotations

from hashlib import sha256
import re
from typing import Iterable, Sequence

from pydantic import BaseModel, Field

from app.project_graph.models import EdgeResolver, NodeProperty, NodeSourceRef, ProjectGraphEdge, ProjectGraphNode
from app.project_graph.synthesis_types import SheetKnowledgePatch


class ConflictResolution(BaseModel):
    """Conflict nodes and edges derived from explicitly extracted patch conflicts."""

    nodes: list[ProjectGraphNode] = Field(default_factory=list)
    edges: list[ProjectGraphEdge] = Field(default_factory=list)


def _stable_id(prefix: str, *parts: object) -> str:
    source = "|".join(str(part) for part in parts)
    return f"{prefix}-{sha256(source.encode('utf-8')).hexdigest()[:16].upper()}"


def _unique_sorted(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


def _node_evidence_refs(node: ProjectGraphNode) -> list[str]:
    return _unique_sorted(
        reference
        for property_value in node.properties.values()
        for reference in property_value.evidence_refs
    )


def _dimension_raw_values(node: ProjectGraphNode) -> list[str]:
    raw_property = node.properties.get("raw")
    values = [node.canonical_name]
    if raw_property is not None:
        values.append(str(raw_property.value))
    return _unique_sorted(values)


def _raw_observed_value(node: ProjectGraphNode) -> str:
    raw_property = node.properties.get("raw")
    if raw_property is not None:
        return str(raw_property.value)
    return node.canonical_name


def _statement_mentions(statement: str, value: str) -> bool:
    if not value:
        return False
    return re.search(
        rf"(?<![A-Za-z0-9]){re.escape(value)}(?:(?:\s*(?:mm|cm|m|ft|in))\b|(?![A-Za-z0-9]))",
        statement,
        flags=re.IGNORECASE,
    ) is not None


def _matching_dimension_nodes(
    patch: SheetKnowledgePatch,
    statement: str,
) -> list[ProjectGraphNode]:
    return sorted(
        (
            node
            for node in patch.nodes
            if node.type == "dimension"
            and any(_statement_mentions(statement, value) for value in _dimension_raw_values(node))
        ),
        key=lambda node: node.node_id,
    )


def _missing_evidence_refs(
    patch: SheetKnowledgePatch,
    statement: str,
) -> list[str]:
    matching_fact_refs = (
        reference
        for fact in patch.facts
        if fact.category == "dimensions" and _statement_mentions(statement, fact.raw)
        for reference in fact.missing_evidence_refs
    )
    return _unique_sorted(
        [
            *patch.missing_evidence_refs,
            *matching_fact_refs,
        ]
    )


def _conflict_node(
    patch: SheetKnowledgePatch,
    statement: str,
    dimensions: list[ProjectGraphNode],
) -> ProjectGraphNode:
    dimension_ids = [node.node_id for node in dimensions]
    node_id = _stable_id(
        "CONFLICT",
        patch.project_id,
        patch.document_id,
        patch.page_index,
        patch.sheet_id,
        statement,
        *dimension_ids,
    )
    evidence_refs = _unique_sorted(
        reference
        for node in dimensions
        for reference in _node_evidence_refs(node)
    )
    dangling_refs = _unique_sorted(patch.dangling_evidence_refs)
    missing_refs = _missing_evidence_refs(patch, statement)
    properties = {
        "conflict_statement": NodeProperty(value=statement, evidence_refs=evidence_refs),
        **{
            f"observed_value_{position:03d}": NodeProperty(
                value=_raw_observed_value(node),
                evidence_refs=_node_evidence_refs(node),
            )
            for position, node in enumerate(dimensions)
        },
    }
    if dangling_refs:
        properties["dangling_evidence_refs"] = NodeProperty(
            value="|".join(dangling_refs),
        )
    if missing_refs:
        properties["missing_evidence_refs"] = NodeProperty(
            value="|".join(missing_refs),
        )

    return ProjectGraphNode(
        node_id=node_id,
        type="conflict",
        canonical_name=f"Conflict: {statement}",
        aliases=[statement],
        properties=properties,
        discipline=patch.discipline,
        verification_status="conflicting",
        confidence=1.0,
        source_refs=[
            NodeSourceRef(
                document_id=patch.document_id,
                page_index=patch.page_index,
                sheet_id=patch.sheet_id,
                evidence_refs=evidence_refs,
            )
        ],
    )


def resolve_conflicts(patches: Sequence[SheetKnowledgePatch]) -> ConflictResolution:
    """Lift explicit patch conflicts without deriving or modifying observed values."""

    records = []
    for patch in patches:
        for statement in patch.conflicts:
            dimensions = _matching_dimension_nodes(patch, statement)
            node = _conflict_node(patch, statement, dimensions)
            records.append((node, dimensions))

    records.sort(key=lambda record: record[0].node_id)
    nodes = [node for node, _ in records]
    edges = [
        ProjectGraphEdge(
            edge_id=_stable_id("EDGE", node.node_id, dimension.node_id, "CONFLICTS_WITH"),
            source=node.node_id,
            target=dimension.node_id,
            relation="CONFLICTS_WITH",
            confidence_class="CONFLICTING",
            confidence=1.0,
            evidence_refs=_node_evidence_refs(dimension),
            resolver=EdgeResolver(method="deterministic_conflict_resolver"),
        )
        for node, dimensions in records
        for dimension in dimensions
    ]
    edges.sort(key=lambda edge: edge.edge_id)
    return ConflictResolution(nodes=nodes, edges=edges)
