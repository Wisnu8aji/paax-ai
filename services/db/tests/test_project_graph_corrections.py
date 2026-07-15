from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db.main import app


@pytest.mark.asyncio
async def test_human_correction_requires_active_snapshot_and_never_mutates_graph_records():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    snapshot = {"snapshot_id": "SNAP-A", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "a", "generation_metadata": {}, "nodes": [{"node_id": "J2", "node_type": "element_type", "canonical_name": "J2", "normalized_name": "j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 1}], "edges": [], "evidence": [], "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": []}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        await client.post("/projects/PROJECT-A/project-graph/snapshots", json=snapshot, headers=headers)
        created = await client.post("/projects/PROJECT-A/project-graph/corrections", json={"id": "CORR-1", "snapshot_id": "SNAP-A", "target_type": "node", "target_id": "J2", "correction_type": "rename", "proposed_value": {"canonical_name": "Jendela J2"}, "rationale": "Sheet label"}, headers=headers)
        resolved = await client.post("/projects/PROJECT-A/project-graph/corrections/CORR-1/resolve", json={"status": "resolved", "resolution_note": "Approved for next rebuild"}, headers=headers)
        graph = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)

    assert created.status_code == 200
    assert created.json()["status"] == "pending"
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert graph.json()["nodes"][0]["name"] == "J2"
