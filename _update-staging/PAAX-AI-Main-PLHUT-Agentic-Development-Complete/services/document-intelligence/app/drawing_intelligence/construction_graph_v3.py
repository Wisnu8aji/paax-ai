from __future__ import annotations

"""Typed Construction Intelligence Graph projection.

This is the project-data graph inspired by graph navigation principles.  It is
separate from graphify-out, which maps source code.  Every non-container edge
is evidence-backed and every confirmed fact remains attributable to a sheet.
"""

from collections import defaultdict
import hashlib
from typing import Any

from .models import DrawingPackageAnalysis


def _id(kind: str, raw: str) -> str:
    return f"{kind}-{hashlib.sha256(raw.encode()).hexdigest()[:18]}"


def build_construction_graph(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    page_node = {}
    level_node = {}
    for page in analysis.pages:
        idx = page.profile.page_index
        sid = _id("sheet", f"{analysis.document_sha256}:{idx}")
        page_node[idx] = sid
        nodes.append({
            "node_id": sid, "node_type": "Sheet", "label": page.semantics.title if page.semantics else f"Page {idx+1}",
            "properties": {"page_index": idx, "page_number": idx+1, "drawing_type": page.semantics.drawing_type if page.semantics else "unknown", "discipline": page.semantics.discipline if page.semantics else "unknown"},
            "evidence_refs": page.semantics.evidence_refs if page.semantics else [],
        })
        level = page.semantics.level if page.semantics else None
        if level:
            lid = level_node.setdefault(level, _id("level", level))
            if not any(n["node_id"] == lid for n in nodes):
                nodes.append({"node_id": lid, "node_type": "SpatialLevel", "label": level, "properties": {}, "evidence_refs": []})
            edges.append({"edge_id": _id("edge", f"{sid}:LOCATED_ON:{lid}"), "source": sid, "relation": "LOCATED_ON", "target": lid, "evidence_refs": page.semantics.evidence_refs})

    conflict_by_item = defaultdict(list)
    for conflict in analysis.conflicts:
        conflict_by_item[conflict.work_item_id].append(conflict)
        cid = conflict.conflict_id
        nodes.append({"node_id": cid, "node_type": "Conflict", "label": conflict.title, "properties": conflict.model_dump(mode="json"), "evidence_refs": sorted({ref for value in conflict.source_values for ref in value.evidence_refs})})

    instance_lookup = {instance.instance_id: instance for instance in analysis.physical_instances}
    for item in analysis.work_items:
        wid = item.work_item_id
        nodes.append({
            "node_id": wid, "node_type": "CivilWorkItem", "label": item.label,
            "properties": {"category": item.category, "code": item.code, "maturity": item.maturity, "count_authority": item.count_authority, "calculation_readiness": item.calculation_readiness},
            "evidence_refs": item.evidence_refs,
        })
        for page_index in sorted({*item.page_indices, *item.definition_source_page_indices, *item.count_source_page_indices}):
            if page_index in page_node:
                refs = [ref for ref in item.evidence_refs]
                edges.append({"edge_id": _id("edge", f"{wid}:SUPPORTED_BY:{page_node[page_index]}"), "source": wid, "relation": "SUPPORTED_BY", "target": page_node[page_index], "evidence_refs": refs})
        for instance_id in item.physical_instance_ids:
            instance = instance_lookup.get(instance_id)
            if not instance:
                continue
            nodes.append({"node_id": instance_id, "node_type": "PhysicalElement", "label": f"{item.code} instance", "properties": instance.model_dump(mode="json"), "evidence_refs": instance.evidence_refs})
            edges.append({"edge_id": _id("edge", f"{wid}:HAS_INSTANCE:{instance_id}"), "source": wid, "relation": "HAS_INSTANCE", "target": instance_id, "evidence_refs": instance.evidence_refs})
        for fact in item.measurement_facts:
            nodes.append({"node_id": fact.measurement_id, "node_type": "MeasurementFact", "label": f"{item.code} {fact.field}", "properties": fact.model_dump(mode="json"), "evidence_refs": fact.evidence_refs})
            edges.append({"edge_id": _id("edge", f"{wid}:HAS_MEASUREMENT:{fact.measurement_id}"), "source": wid, "relation": "HAS_MEASUREMENT", "target": fact.measurement_id, "evidence_refs": fact.evidence_refs})
        for conflict in conflict_by_item.get(wid, []):
            edges.append({"edge_id": _id("edge", f"{wid}:CONFLICTS_WITH:{conflict.conflict_id}"), "source": wid, "relation": "CONFLICTS_WITH", "target": conflict.conflict_id, "evidence_refs": sorted({ref for value in conflict.source_values for ref in value.evidence_refs})})

    # Validate no dangling edges and confirmed facts have provenance.
    node_ids = {node["node_id"] for node in nodes}
    dangling = [edge for edge in edges if edge["source"] not in node_ids or edge["target"] not in node_ids]
    if dangling:
        raise ValueError(f"construction graph has {len(dangling)} dangling edges")
    invalid_confirmed = [
        node for node in nodes if node["node_type"] == "MeasurementFact"
        and node["properties"].get("verification_status") in {"engine_verified", "human_verified"}
        and not node.get("evidence_refs")
    ]
    if invalid_confirmed:
        raise ValueError("confirmed measurement facts require evidence")
    communities = defaultdict(list)
    for item in analysis.work_items:
        communities[str(item.attributes.get("level") or "unknown")].append(item.work_item_id)
    return {
        "schema_version": "paax.construction-intelligence-graph.v3",
        "package_id": analysis.package_id,
        "nodes": nodes,
        "edges": edges,
        "communities": [{"community_id": f"level:{level}", "level": level, "node_ids": ids} for level, ids in sorted(communities.items())],
        "metrics": {"nodes": len(nodes), "edges": len(edges), "conflicts": len(analysis.conflicts)},
    }
