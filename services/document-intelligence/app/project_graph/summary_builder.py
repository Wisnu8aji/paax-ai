"""Typed, auditable summary views for project graph snapshots.

This module only projects stored graph metadata. It never calculates RAB, BoQ,
HSP, duration, volume, or other project quantities.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.project_graph.models import (
    ProjectGraphEdge,
    ProjectGraphNode,
    ProjectGraphSnapshot,
    ProjectGraphSummaryView,
    SummaryViewGrain,
    ElementTypeIndexEntry,
    DisciplineCountEntry,
    StoredMeasurementFact,
    SummaryPayload,
    QualityPayload,
    ProvenancePayload,
)


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


def compile_level_overview(
    snapshot: ProjectGraphSnapshot, level_node_id: str
) -> ProjectGraphSummaryView:
    """Compile a deterministic level summary view from a synthesized snapshot.

    This function only aggregates occurrences, mapping facts, and tracking
    provenance and quality metrics. It never performs arithmetic calculations or
    quantity volume estimates (Golden Rule).
    """
    nodes_by_id = {node.node_id: node for node in snapshot.nodes}
    level_node = nodes_by_id.get(level_node_id)
    level_name = level_node.canonical_name if level_node else level_node_id

    # 1. Grain
    grain = SummaryViewGrain(
        building_id=None,
        level_id=level_node_id,
        discipline=None,
        zone_id=None,
    )

    # 2. Find occurrences located on this level
    occurrence_ids = {
        edge.source
        for edge in snapshot.edges
        if edge.relation == "LOCATED_ON" and edge.target == level_node_id
    }
    occurrences = [
        node
        for node in snapshot.nodes
        if node.node_id in occurrence_ids and node.type == "element_occurrence"
    ]
    physical_nodes = [
        node
        for node in snapshot.nodes
        if node.type in {"physical_element_candidate", "physical_element"}
        and node.node_id in occurrence_ids
    ]
    verified_physical_nodes = [
        node for node in physical_nodes
        if node.type == "physical_element"
        and node.properties.get("physical_count_eligible") is not None
        and node.properties["physical_count_eligible"].value is True
    ]

    # 3. Group by Element Type (via INSTANCE_OF edges)
    occurrence_to_type: dict[str, str] = {}
    for edge in snapshot.edges:
        if edge.relation == "INSTANCE_OF" and edge.source in occurrence_ids:
            occurrence_to_type[edge.source] = edge.target

    type_counts: dict[str, int] = {}
    for occ in occurrences:
        t_id = occurrence_to_type.get(occ.node_id)
        if t_id:
            type_counts[t_id] = type_counts.get(t_id, 0) + 1

    element_type_index = []
    for t_id, count in sorted(type_counts.items()):
        t_node = nodes_by_id.get(t_id)
        t_name = t_node.canonical_name if t_node else t_id
        element_type_index.append(
            ElementTypeIndexEntry(
                element_type_id=t_id,
                name=t_name,
                occurrence_count=count,
            )
        )

    # 4. Discipline Counts
    discipline_counts_map: dict[str, int] = {}
    for occ in occurrences:
        disp = occ.discipline
        if disp:
            discipline_counts_map[disp] = discipline_counts_map.get(disp, 0) + 1

    discipline_counts = []
    for disp, count in sorted(discipline_counts_map.items()):
        discipline_counts.append(
            DisciplineCountEntry(
                discipline=disp,
                occurrence_count=count,
            )
        )

    # 5. Stored Measurement Facts (Dimension nodes linked via HAS_DIMENSION)
    # Find relevant sources: occurrences on this level, and drawing_references related to them
    r_node_ids = set()
    for occ in occurrences:
        occ_refs = {(ref.document_id, ref.page_index, ref.sheet_id) for ref in occ.source_refs}
        for node in snapshot.nodes:
            if node.type == "drawing_reference" and node.source_refs:
                r_ref = node.source_refs[0]
                if (r_ref.document_id, r_ref.page_index, r_ref.sheet_id) in occ_refs:
                    r_node_ids.add(node.node_id)

    relevant_sources = occurrence_ids | r_node_ids
    dimension_node_ids = set()
    for edge in snapshot.edges:
        if edge.relation == "HAS_DIMENSION" and edge.source in relevant_sources:
            dimension_node_ids.add(edge.target)

    dimension_nodes = [
        node
        for node in snapshot.nodes
        if node.node_id in dimension_node_ids and node.type == "dimension"
    ]

    stored_measurement_facts = []
    for dim_node in sorted(dimension_nodes, key=lambda n: n.node_id):
        unit_prop = dim_node.properties.get("unit")
        unit = str(unit_prop.value).strip() if unit_prop and unit_prop.value else ""
        ev_refs = sorted(list(_node_evidence_refs(dim_node)))
        if not unit or not ev_refs:
            continue

        val = None
        if "numeric_value" in dim_node.properties and dim_node.properties["numeric_value"].value is not None:
            val = dim_node.properties["numeric_value"].value
        elif "normalized" in dim_node.properties and dim_node.properties["normalized"].value is not None:
            val = dim_node.properties["normalized"].value
        elif "raw" in dim_node.properties and dim_node.properties["raw"].value is not None:
            val = dim_node.properties["raw"].value

        if val is None:
            continue

        stored_measurement_facts.append(
            StoredMeasurementFact(
                name=dim_node.canonical_name,
                value=val,
                unit=unit,
                evidence_refs=ev_refs,
            )
        )

    # 6. Quality Metrics
    # ambiguous_binding_ids: POSSIBLY_SAME_AS edges touching occurrences on this level
    ambiguous_binding_edges = [
        edge
        for edge in snapshot.edges
        if edge.relation == "POSSIBLY_SAME_AS"
        and (edge.source in occurrence_ids or edge.target in occurrence_ids)
    ]
    ambiguous_binding_ids = sorted(list({e.edge_id for e in ambiguous_binding_edges}))

    # ambiguous occurrences themselves
    ambiguous_nodes = {
        occ_id
        for occ_id in occurrence_ids
        if any(
            edge.relation == "POSSIBLY_SAME_AS"
            and (edge.source == occ_id or edge.target == occ_id)
            for edge in snapshot.edges
        )
    }

    # conflict_ids: conflict nodes overlapping in evidence_refs with occurrences on this level
    conflict_nodes = [node for node in snapshot.nodes if node.type == "conflict"]
    conflict_ids = set()
    conflicting_occurrence_ids = set()
    for c_node in conflict_nodes:
        c_evidences = {ref for s_ref in c_node.source_refs for ref in s_ref.evidence_refs}
        for occ in occurrences:
            occ_evidences = {ref for s_ref in occ.source_refs for ref in s_ref.evidence_refs}
            if occ_evidences & c_evidences:
                conflict_ids.add(c_node.node_id)
                conflicting_occurrence_ids.add(occ.node_id)

    sorted_conflict_ids = sorted(list(conflict_ids))

    confirmed_count = len(
        [
            occ
            for occ in occurrences
            if occ.node_id not in ambiguous_nodes
            and occ.node_id not in conflicting_occurrence_ids
        ]
    )

    quality = QualityPayload(
        confirmed_count=confirmed_count,
        ambiguous_binding_count=len(ambiguous_nodes),
        conflict_count=len(sorted_conflict_ids),
        ambiguous_binding_ids=ambiguous_binding_ids,
        conflict_ids=sorted_conflict_ids,
    )

    # 7. Provenance
    source_doc_ids = set()
    for occ in occurrences:
        for ref in occ.source_refs:
            source_doc_ids.add(ref.document_id)
    if level_node:
        for ref in level_node.source_refs:
            source_doc_ids.add(ref.document_id)

    evidence_ids_set = set()
    for occ in occurrences:
        for ref in occ.source_refs:
            evidence_ids_set.update(ref.evidence_refs)
    if level_node:
        for ref in level_node.source_refs:
            evidence_ids_set.update(ref.evidence_refs)
    for fact in stored_measurement_facts:
        evidence_ids_set.update(fact.evidence_refs)

    provenance = ProvenancePayload(
        source_document_ids=sorted(list(source_doc_ids)),
        evidence_ids=sorted(list(evidence_ids_set)),
        summary_builder_version="paax.pckm.summary-builder.v1",
    )

    return ProjectGraphSummaryView(
        schema_version="paax.pckm.summary-view.v1",
        project_id=snapshot.project_id,
        snapshot_id=snapshot.snapshot_id,
        view_kind="LEVEL_OVERVIEW",
        grain=grain,
        summary=SummaryPayload(
            level_name=level_name,
            element_type_index=element_type_index,
            discipline_counts=discipline_counts,
            stored_measurement_facts=stored_measurement_facts,
            label_observation_count=sum(
                int(node.properties["label_count"].value)
                for node in occurrences
                if "label_count" in node.properties
                and isinstance(node.properties["label_count"].value, int)
            ),
            context_group_count=len(occurrences),
            physical_candidate_count=len(physical_nodes),
            verified_physical_count=len(verified_physical_nodes),
        ),
        quality=quality,
        provenance=provenance,
    )


def compile_all_level_overviews(snapshot: ProjectGraphSnapshot) -> list[ProjectGraphSummaryView]:
    """Compile all level summary views for the given snapshot."""
    views = []
    for node in snapshot.nodes:
        if node.type == "level":
            views.append(compile_level_overview(snapshot, node.node_id))
    return views

