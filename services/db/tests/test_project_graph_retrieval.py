from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.project_graph_repository import build_and_activate_snapshot
from paax_db.project_graph_retrieval import retrieve_project_graph
from paax_db.main import app


@pytest.mark.asyncio
async def test_retrieval_scopes_alias_bfs_evidence_budget_and_audit_to_active_project_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add_all([
            models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"),
            models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"),
        ])
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[
                {"node_id": "J2", "node_type": "element_type", "canonical_name": "Jendela J2", "normalized_name": "jendela j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9, "search_text": "jendela j2 aluminium"},
                {"node_id": "L1", "node_type": "level", "canonical_name": "Lantai 1", "normalized_name": "lantai 1", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[{"edge_id": "J2-L1", "source_node_id": "J2", "target_node_id": "L1", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 0.9}],
            evidence=[{"evidence_id": "EV-J2", "document_id": "DOC-A", "page_index": 20, "sheet_id": "A-21", "kind": "text", "raw_text": "Jendela J2 pada lantai 1"}],
            node_evidence=[{"node_id": "J2", "evidence_id": "EV-J2", "role": "source"}], edge_evidence=[],
            aliases=[{"alias_normalized": "j2", "alias_raw": "J2", "node_id": "J2", "alias_type": "drawing_mark", "confidence": 0.9}], communities=[],
        )
        await build_and_activate_snapshot(
            session, project_id="PROJECT-B", snapshot_id="SNAP-B", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="b", generation_metadata={},
            nodes=[{"node_id": "J2", "node_type": "element_type", "canonical_name": "Wrong Project", "normalized_name": "wrong project", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9}],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="J2", depth=1, budget_tokens=30)
        logs = (await session.execute(select(models.ProjectGraphQueryLog))).scalars().all()

    assert result.snapshot_id == "SNAP-A"
    assert [node.node_id for node in result.nodes] == ["J2", "L1"]
    assert [edge.edge_id for edge in result.edges] == ["J2-L1"]
    assert [(item.evidence_id, item.sheet_id, item.page_index) for item in result.evidence] == [("EV-J2", "A-21", 20)]
    assert result.context_token_estimate <= 30
    assert len(logs) == 1
    assert (logs[0].project_id, logs[0].snapshot_id, logs[0].outcome) == ("PROJECT-A", "SNAP-A", "success")


@pytest.mark.asyncio
async def test_retrieval_returns_not_ready_without_reading_another_project_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add_all([
            models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"),
            models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"),
        ])
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-B", snapshot_id="SNAP-B", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="b", generation_metadata={}, nodes=[], edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="anything")

    assert result.status == "not_ready"
    assert result.nodes == []


@pytest.mark.asyncio
async def test_retrieval_api_returns_scoped_context_and_not_ready_status():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        response = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)

    assert response.status_code == 200
    assert response.json() == {"status": "not_ready", "snapshot_id": None, "nodes": [], "edges": [], "evidence": [], "context_token_estimate": 0}
