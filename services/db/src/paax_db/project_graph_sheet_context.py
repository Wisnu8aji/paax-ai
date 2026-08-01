from __future__ import annotations

from typing import Any
from fastapi import HTTPException


def get_active_sheet_context(
    snapshot: Any,
    page_index: int,
    *,
    project_id: str,
) -> dict[str, Any]:
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"Project graph snapshot not found for project: {project_id}")

    if hasattr(snapshot, "snapshot_json") and isinstance(getattr(snapshot, "snapshot_json"), dict):
        snapshot = getattr(snapshot, "snapshot_json")

    if isinstance(snapshot, dict):
        nodes = snapshot.get("nodes", [])
        edges = snapshot.get("edges", [])
        review_queue = snapshot.get("review_queue", [])
        snapshot_id = snapshot.get("snapshot_id", "active-snapshot")
    else:
        nodes = getattr(snapshot, "nodes", []) or []
        edges = getattr(snapshot, "edges", []) or []
        review_queue = getattr(snapshot, "review_queue", []) or []
        snapshot_id = getattr(snapshot, "snapshot_id", "active-snapshot")

    # Filter nodes for page_index
    matched_nodes = []
    matched_node_ids = set()

    for node in nodes:
        node_id = str(node.get("id") or node.get("node_id") or "")
        props = node.get("properties", {}) or node.get("properties_json", {}) or {}
        n_page = props.get("page_index")
        
        # Check source_pages or evidence_refs
        source_pages = node.get("source_pages") or props.get("source_pages") or []
        evidence_refs = node.get("evidence_refs") or []

        belongs = False
        if n_page is not None and int(n_page) == page_index:
            belongs = True
        elif isinstance(source_pages, list) and page_index in source_pages:
            belongs = True
        elif any(f"page-{page_index}" in str(ref) or f"page_{page_index}" in str(ref) or f"p.{page_index + 1}" in str(ref) for ref in evidence_refs):
            belongs = True

        if belongs:
            matched_nodes.append(node)
            if node_id:
                matched_node_ids.add(node_id)

    # Filter edges connected to matched nodes or mentioning page_index
    matched_edges = []
    for edge in edges:
        source_id = str(edge.get("source") or edge.get("source_id") or "")
        target_id = str(edge.get("target") or edge.get("target_id") or "")
        edge_refs = edge.get("evidence_refs") or []

        if (
            source_id in matched_node_ids
            or target_id in matched_node_ids
            or any(f"page-{page_index}" in str(ref) or f"page_{page_index}" in str(ref) or f"p.{page_index + 1}" in str(ref) for ref in edge_refs)
        ):
            matched_edges.append(edge)

    # Filter review queue rows for page_index
    matched_review_rows = []
    for row in review_queue:
        if isinstance(row, str):
            try:
                row = json.loads(row)
            except Exception:
                continue
        if not isinstance(row, dict):
            continue
        r_page = row.get("page_index")
        r_refs = row.get("evidence_refs") or []
        if (r_page is not None and int(r_page) == page_index) or any(
            f"page-{page_index}" in str(ref) or f"page_{page_index}" in str(ref) or f"p.{page_index + 1}" in str(ref) for ref in r_refs
        ):
            matched_review_rows.append(row)

    # Extract all evidence refs for matched elements
    all_evidence_refs = sorted(
        {
            str(ref)
            for item in matched_nodes + matched_edges + matched_review_rows
            if isinstance(item, dict)
            for ref in item.get("evidence_refs", [])
            if str(ref).strip()
        }
    )

    return {
        "project_id": project_id,
        "page_index": page_index,
        "snapshot_id": snapshot_id,
        "nodes": matched_nodes,
        "edges": matched_edges,
        "review_queue": matched_review_rows,
        "evidence_refs": all_evidence_refs,
        "metadata": {
            "node_count": len(matched_nodes),
            "edge_count": len(matched_edges),
            "review_count": len(matched_review_rows),
            "evidence_count": len(all_evidence_refs),
            "is_active_sheet_only": True,
        },
    }
