"""Deterministic C7 review queue and C8 quantity-readiness evaluation."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    ProjectGraphCorrection,
    ProjectGraphEdge,
    ProjectGraphEdgeEvidence,
    ProjectGraphNode,
    ProjectGraphNodeEvidence,
)


REVIEW_WEIGHTS = {
    "conflict": 3.0,
    "missing_dimension": 2.5,
    "ambiguous_level": 2.0,
    "possibly_same": 1.5,
    "needs_review": 1.0,
}
OPEN_STATUSES = {"ambiguous", "conflicting", "conflict", "needs_review"}


def _status(value: Any) -> str:
    return str(value or "").strip().lower()


def _relation(value: Any) -> str:
    return str(value or "").strip().upper()


def _evidence_map(
    node_evidence: list[ProjectGraphNodeEvidence], edge_evidence: list[ProjectGraphEdgeEvidence]
) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    nodes: dict[str, set[str]] = defaultdict(set)
    edges: dict[str, set[str]] = defaultdict(set)
    for row in node_evidence:
        nodes[row.node_id].add(row.evidence_id)
    for row in edge_evidence:
        edges[row.edge_id].add(row.evidence_id)
    return nodes, edges


def _unit_dimension(node: ProjectGraphNode) -> bool:
    properties = node.properties_json or {}
    unit = properties.get("unit") or properties.get("units")
    return isinstance(unit, str) and bool(unit.strip())


def _dimension_for_edge(edge: ProjectGraphEdge, by_id: dict[str, ProjectGraphNode]) -> ProjectGraphNode | None:
    for endpoint in (edge.source_node_id, edge.target_node_id):
        node = by_id.get(endpoint)
        if node is not None and node.node_type == "dimension":
            return node
    return None


def _connected(edge: ProjectGraphEdge, ids: set[str]) -> bool:
    return edge.source_node_id in ids or edge.target_node_id in ids


def _endpoint_node(edge: ProjectGraphEdge, by_id: dict[str, ProjectGraphNode]) -> ProjectGraphNode | None:
    return by_id.get(edge.source_node_id) or by_id.get(edge.target_node_id)


def _missing_information(node: ProjectGraphNode) -> list[str]:
    values = (node.properties_json or {}).get("missing_information", [])
    if isinstance(values, str):
        values = [values]
    return [str(value) for value in values if str(value).lower().startswith(("requires ", "integrity:"))]


async def _snapshot_rows(session: AsyncSession, *, project_id: str, snapshot_id: str):
    nodes = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id, ProjectGraphNode.snapshot_id == snapshot_id,
    ))).scalars().all()
    edges = (await session.execute(select(ProjectGraphEdge).where(
        ProjectGraphEdge.project_id == project_id, ProjectGraphEdge.snapshot_id == snapshot_id,
    ))).scalars().all()
    node_evidence = (await session.execute(select(ProjectGraphNodeEvidence).where(
        ProjectGraphNodeEvidence.snapshot_id == snapshot_id,
    ))).scalars().all()
    edge_evidence = (await session.execute(select(ProjectGraphEdgeEvidence).where(
        ProjectGraphEdgeEvidence.snapshot_id == snapshot_id,
    ))).scalars().all()
    return nodes, edges, *_evidence_map(node_evidence, edge_evidence)


def _reason(code: str, target_type: str, target_id: str, evidence_refs: set[str], message: str) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "target_type": target_type,
        "target_id": target_id,
        "evidence_refs": sorted(evidence_refs),
    }


def _append_queue_item(items: dict[str, dict[str, Any]], *, category: str, target_type: str,
                       target_id: str, evidence_refs: set[str], reason: dict[str, Any],
                       occurrence_count: int = 0) -> None:
    key = f"{category}:{target_type}:{target_id}"
    multiplier = occurrence_count if category == "missing_dimension" else 1
    item = items.setdefault(key, {
        "id": key,
        "category": category,
        "target_type": target_type,
        "target_id": target_id,
        "node_id": target_id if target_type == "node" else None,
        "edge_id": target_id if target_type == "edge" else None,
        "reason_codes": [],
        "reasons": [],
        "priority": REVIEW_WEIGHTS[category] * multiplier,
        "weight": REVIEW_WEIGHTS[category],
        "occurrence_count": occurrence_count,
        "evidence_refs": [],
    })
    if reason["code"] not in item["reason_codes"]:
        item["reason_codes"].append(reason["code"])
        item["reasons"].append(reason)
    item["evidence_refs"] = sorted(set(item["evidence_refs"]) | evidence_refs | set(reason["evidence_refs"]))


async def build_review_queue(session: AsyncSession, *, project_id: str, snapshot_id: str) -> dict[str, Any]:
    nodes, edges, node_evidence, edge_evidence = await _snapshot_rows(
        session, project_id=project_id, snapshot_id=snapshot_id
    )
    by_id = {node.node_id: node for node in nodes}
    items: dict[str, dict[str, Any]] = {}

    for node in nodes:
        state = _status(node.verification_status)
        refs = node_evidence.get(node.node_id, set())
        if node.node_type == "conflict" or state in {"conflicting", "conflict"}:
            _append_queue_item(items, category="conflict", target_type="node", target_id=node.node_id,
                               evidence_refs=refs, reason=_reason("conflict", "node", node.node_id, refs, "Node atau status node berkonflik."))
        elif node.node_type == "level" and (state in {"ambiguous", "possibly_same"} or (node.properties_json or {}).get("possibly_same")):
            _append_queue_item(items, category="ambiguous_level", target_type="node", target_id=node.node_id,
                               evidence_refs=refs, reason=_reason("ambiguous_level", "node", node.node_id, refs, "Binding level kanonis masih ambigu."))
        elif node.node_type == "element_occurrence" and state in {"needs_review", "ambiguous"}:
            _append_queue_item(items, category="needs_review", target_type="node", target_id=node.node_id,
                               evidence_refs=refs, reason=_reason("needs_review", "node", node.node_id, refs, "Occurrence memerlukan review manusia."))
        elif state == "ambiguous":
            _append_queue_item(items, category="needs_review", target_type="node", target_id=node.node_id,
                               evidence_refs=refs, reason=_reason("needs_review", "node", node.node_id, refs, "Node masih ambigu dan memerlukan review manusia."))
        missing = _missing_information(node)
        if missing:
            _append_queue_item(items, category="needs_review", target_type="node", target_id=node.node_id,
                               evidence_refs=refs, reason=_reason("missing_information", "node", node.node_id, refs, "; ".join(missing)))

    for edge in edges:
        refs = edge_evidence.get(edge.edge_id, set())
        relation = _relation(edge.relation)
        state = _status(edge.confidence_class)
        if relation == "POSSIBLY_SAME_AS":
            _append_queue_item(items, category="possibly_same", target_type="edge", target_id=edge.edge_id,
                               evidence_refs=refs, reason=_reason("possibly_same", "edge", edge.edge_id, refs, "Binding POSSIBLY_SAME_AS masih terbuka."))
        elif state in {"conflicting", "conflict"}:
            _append_queue_item(items, category="conflict", target_type="edge", target_id=edge.edge_id,
                               evidence_refs=refs, reason=_reason("conflict", "edge", edge.edge_id, refs, "Confidence edge berkonflik."))
        elif state == "ambiguous":
            endpoint = _endpoint_node(edge, by_id)
            category = "ambiguous_level" if relation == "LOCATED_ON" and endpoint is not None and endpoint.node_type == "level" else "needs_review"
            _append_queue_item(items, category=category, target_type="edge", target_id=edge.edge_id,
                               evidence_refs=refs, reason=_reason(category, "edge", edge.edge_id, refs, "Binding edge masih ambigu."))

    instance_edges = [edge for edge in edges if _relation(edge.relation) == "INSTANCE_OF"]
    dimensions = [edge for edge in edges if _relation(edge.relation) in {"HAS_DIMENSION", "DEFINED_BY"}]
    for element_type in [node for node in nodes if node.node_type == "element_type"]:
        occurrence_ids = {
            edge.source_node_id if by_id.get(edge.source_node_id, None) and by_id[edge.source_node_id].node_type == "element_occurrence" else edge.target_node_id
            for edge in instance_edges
            if element_type.node_id in {edge.source_node_id, edge.target_node_id}
        }
        occurrence_count = len(occurrence_ids)
        has_dimension = any(
            element_type.node_id in {edge.source_node_id, edge.target_node_id}
            and _unit_dimension(_dimension_for_edge(edge, by_id))
            for edge in dimensions
            if _dimension_for_edge(edge, by_id) is not None
        )
        if occurrence_count and not has_dimension:
            refs = node_evidence.get(element_type.node_id, set()) | {
                ref for occurrence_id in occurrence_ids for ref in node_evidence.get(occurrence_id, set())
            }
            _append_queue_item(
                items, category="missing_dimension", target_type="node", target_id=element_type.node_id,
                evidence_refs=refs, occurrence_count=occurrence_count,
                reason=_reason("no_written_dimension", "node", element_type.node_id, refs, "Element type terpakai belum memiliki dimensi tertulis ber-unit."),
            )

    ordered = sorted(items.values(), key=lambda item: (-item["priority"], item["id"]))
    counts = Counter(code for item in ordered for code in item["reason_codes"])
    return {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "items": ordered,
        "summary": {"total": len(ordered), "by_reason": dict(sorted(counts.items()))},
    }


async def build_quantity_readiness(session: AsyncSession, *, project_id: str, snapshot_id: str) -> dict[str, Any]:
    nodes, edges, node_evidence, edge_evidence = await _snapshot_rows(
        session, project_id=project_id, snapshot_id=snapshot_id
    )
    by_id = {node.node_id: node for node in nodes}
    type_nodes = [node for node in nodes if node.node_type == "element_type"]
    instance_edges = [edge for edge in edges if _relation(edge.relation) == "INSTANCE_OF"]
    dimension_edges = [edge for edge in edges if _relation(edge.relation) in {"HAS_DIMENSION", "DEFINED_BY"}]
    located_edges = [edge for edge in edges if _relation(edge.relation) == "LOCATED_ON"]

    distinct_levels_in_project = len({node.node_id for node in nodes if node.node_type == "level"})
    import re

    items = []
    for element_type in sorted(type_nodes, key=lambda node: node.node_id):
        occurrences = []
        for instance in instance_edges:
            occurrence_id = instance.source_node_id if by_id.get(instance.source_node_id, None) and by_id[instance.source_node_id].node_type == "element_occurrence" else instance.target_node_id
            if element_type.node_id in {instance.source_node_id, instance.target_node_id} and by_id.get(occurrence_id) is not None:
                occurrences.append(by_id[occurrence_id])
        confirmed_occurrences = [node for node in occurrences if _status(node.verification_status) == "confirmed"]
        has_dimension = any(
            element_type.node_id in {edge.source_node_id, edge.target_node_id}
            and _unit_dimension(_dimension_for_edge(edge, by_id))
            for edge in dimension_edges
            if _dimension_for_edge(edge, by_id) is not None
        )
        touched_ids = {element_type.node_id, *(node.node_id for node in occurrences)}
        touched_edges = [edge for edge in edges if _connected(edge, touched_ids)]
        open_conflict = any(
            _relation(edge.relation) == "POSSIBLY_SAME_AS"
            or _status(edge.confidence_class) in OPEN_STATUSES
            or (_endpoint_node(edge, by_id) is not None and _endpoint_node(edge, by_id).node_type == "conflict")
            for edge in touched_edges
        ) or any(_status(node.verification_status) in {"ambiguous", "conflicting", "conflict"} for node in [element_type, *occurrences])
        level_ok = True
        if occurrences:
            for occurrence in occurrences:
                bindings = [edge for edge in located_edges if occurrence.node_id in {edge.source_node_id, edge.target_node_id}]
                if not bindings or any(
                    _status(edge.confidence_class) in OPEN_STATUSES
                    or not any(by_id.get(endpoint) is not None and by_id[endpoint].node_type == "level" and _status(by_id[endpoint].verification_status) not in {"ambiguous", "conflicting", "conflict"} for endpoint in (edge.source_node_id, edge.target_node_id))
                    for edge in bindings
                ):
                    level_ok = False
        else:
            level_ok = False

        reasons = []
        if not confirmed_occurrences:
            refs = node_evidence.get(element_type.node_id, set()) | {ref for node in occurrences for ref in node_evidence.get(node.node_id, set())}
            reasons.append(_reason("no_confirmed_occurrence", "node", element_type.node_id, refs, "Belum ada occurrence confirmed."))
        if not has_dimension:
            reasons.append(_reason("no_written_dimension", "node", element_type.node_id, node_evidence.get(element_type.node_id, set()), "Belum ada dimensi tertulis ber-unit."))
        if open_conflict:
            refs = node_evidence.get(element_type.node_id, set()) | {ref for edge in touched_edges for ref in edge_evidence.get(edge.edge_id, set())}
            reasons.append(_reason("open_conflict", "node", element_type.node_id, refs, "Element type atau occurrence tersentuh conflict/POSSIBLY_SAME_AS terbuka."))
        if not level_ok:
            refs = node_evidence.get(element_type.node_id, set()) | {ref for edge in located_edges for ref in edge_evidence.get(edge.edge_id, set()) if _connected(edge, {node.node_id for node in occurrences})}
            reasons.append(_reason("level_binding_unconfirmed", "node", element_type.node_id, refs, "Semua occurrence belum terikat ke level kanonis non-ambigu."))
        codes = [reason["code"] for reason in reasons]
        hard_block = {"no_canonical_type", "no_confirmed_occurrence", "no_written_dimension"}
        readiness = "blocked" if hard_block.intersection(codes) else ("needs_review" if codes else "ready")

        if readiness != "blocked":
            levels_for_element = set()
            for occ in confirmed_occurrences:
                for edge in located_edges:
                    if occ.node_id in {edge.source_node_id, edge.target_node_id}:
                        endpoint = edge.target_node_id if edge.source_node_id == occ.node_id else edge.source_node_id
                        if by_id.get(endpoint) and by_id[endpoint].node_type == "level":
                            levels_for_element.add(endpoint)
            
            distinct_levels_for_this_element_type = len(levels_for_element)
            
            if (
                distinct_levels_in_project >= 3
                and distinct_levels_for_this_element_type == 1
                and element_type.discipline == "structure"
                and re.match(r"^[A-Z]{1,3}\d", str(element_type.canonical_name))
            ):
                reason_code = "sparse_occurrence_vs_levels"
                msg = f"Elemen struktur ini hanya tercatat di 1 dari {distinct_levels_in_project} lantai proyek -- periksa apakah data lantai lain belum terekstrak, atau memang elemen ini unik/khusus (mis. hanya di lantai atap)."
                refs = node_evidence.get(element_type.node_id, set()) | {ref for node in confirmed_occurrences for ref in node_evidence.get(node.node_id, set())}
                reasons.append(_reason(reason_code, "node", element_type.node_id, refs, msg))
                codes.append(reason_code)

        items.append({
            "element_type_id": element_type.node_id,
            "name": element_type.canonical_name,
            "readiness": readiness,
            "has_canonical_type": True,
            "has_occurrence": bool(confirmed_occurrences),
            "has_written_dimension": has_dimension,
            "no_open_conflict": not open_conflict,
            "level_binding_confirmed": level_ok,
            "occurrence_count": len(confirmed_occurrences),
            "reason_codes": codes,
            "reasons": reasons,
        })
    summary = {
        "total": len(items),
        "ready": sum(item["readiness"] == "ready" for item in items),
        "needs_review": sum(item["readiness"] == "needs_review" for item in items),
        "blocked": sum(item["readiness"] == "blocked" for item in items),
    }
    return {"project_id": project_id, "snapshot_id": snapshot_id, "items": items, "summary": summary}


async def active_correction_overlays(session: AsyncSession, *, project_id: str, snapshot_id: str) -> dict[str, dict[str, Any]]:
    rows = (await session.execute(select(ProjectGraphCorrection).where(
        ProjectGraphCorrection.project_id == project_id,
        ProjectGraphCorrection.snapshot_id == snapshot_id,
        ProjectGraphCorrection.status == "accepted",
    ))).scalars().all()
    return {
        row.target_id: {
            "correction_id": row.id,
            "correction_type": row.correction_type,
            "proposed_value": row.proposed_value,
            "rationale": row.rationale,
            "created_by": row.created_by,
            "resolved_by": row.resolved_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
            "carried_from": row.carried_from,
        }
        for row in rows
    }
