from __future__ import annotations

import pytest
from fastapi import HTTPException
from paax_db.project_graph_sheet_context import get_active_sheet_context


def test_get_active_sheet_context_filters_page_nodes():
    sample_snapshot = {
        "snapshot_id": "snap-001",
        "nodes": [
            {
                "id": "node-p0-col",
                "name": "K1",
                "type": "column",
                "properties": {"page_index": 0},
                "evidence_refs": ["page-0-box-1"],
            },
            {
                "id": "node-p1-beam",
                "name": "B1",
                "type": "beam",
                "properties": {"page_index": 1},
                "evidence_refs": ["page-1-box-1"],
            },
        ],
        "edges": [
            {
                "source": "node-p0-col",
                "target": "node-p1-beam",
                "relation": "CONNECTED_TO",
                "evidence_refs": ["page-0-link"],
            }
        ],
        "review_queue": [
            {
                "id": "rev-p0-1",
                "page_index": 0,
                "category": "conflict",
                "evidence_refs": ["page-0-box-1"],
            },
            {
                "id": "rev-p1-1",
                "page_index": 1,
                "category": "missing_dimension",
                "evidence_refs": ["page-1-box-1"],
            },
        ],
    }

    # Fetch context for page_index = 0
    ctx_p0 = get_active_sheet_context(sample_snapshot, 0, project_id="proj-101")

    assert ctx_p0["project_id"] == "proj-101"
    assert ctx_p0["page_index"] == 0
    assert ctx_p0["snapshot_id"] == "snap-001"

    node_ids_p0 = [n["id"] for n in ctx_p0["nodes"]]
    assert node_ids_p0 == ["node-p0-col"]

    edge_sources_p0 = [e["source"] for e in ctx_p0["edges"]]
    assert "node-p0-col" in edge_sources_p0

    rev_ids_p0 = [r["id"] for r in ctx_p0["review_queue"]]
    assert rev_ids_p0 == ["rev-p0-1"]

    assert ctx_p0["metadata"]["is_active_sheet_only"] is True
    assert ctx_p0["metadata"]["node_count"] == 1


def test_get_active_sheet_context_empty_snapshot():
    empty_snapshot = {"snapshot_id": "empty", "nodes": [], "edges": [], "review_queue": []}
    ctx = get_active_sheet_context(empty_snapshot, 5, project_id="proj-empty")

    assert ctx["project_id"] == "proj-empty"
    assert ctx["page_index"] == 5
    assert ctx["nodes"] == []
    assert ctx["edges"] == []
    assert ctx["review_queue"] == []
    assert ctx["metadata"]["node_count"] == 0
    assert ctx["metadata"]["is_active_sheet_only"] is True


def test_get_active_sheet_context_missing_snapshot_raises_404():
    with pytest.raises(HTTPException) as exc_info:
        get_active_sheet_context({}, 0, project_id="proj-missing")

    assert exc_info.value.status_code == 404
    assert "Project graph snapshot not found" in exc_info.value.detail
