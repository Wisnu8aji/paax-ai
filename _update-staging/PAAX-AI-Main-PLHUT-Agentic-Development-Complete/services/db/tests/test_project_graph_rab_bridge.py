from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.project_graph_rab_bridge import build_rab_bridge_proposal
from paax_db.project_graph_repository import build_and_activate_snapshot
from paax_db.main import app


@pytest.mark.asyncio
async def test_rab_bridge_only_returns_reviewable_evidence_backed_inputs_without_calculation():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[{"node_id": "TYPE-J2", "node_type": "element_type", "canonical_name": "Jendela J2", "normalized_name": "jendela j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9, "properties": {"specification": "aluminium"}}],
            edges=[], evidence=[{"evidence_id": "EV-J2", "document_id": "DOC-A", "page_index": 20, "sheet_id": "A-21", "kind": "text", "raw_text": "Jendela J2 aluminium"}],
            node_evidence=[{"node_id": "TYPE-J2", "evidence_id": "EV-J2", "role": "source"}], edge_evidence=[], aliases=[], communities=[],
        )
        proposal = await build_rab_bridge_proposal(session, project_id="PROJECT-A", node_ids=["TYPE-J2"])

    assert proposal.status == "requires_human_approval"
    assert proposal.snapshot_id == "SNAP-A"
    assert proposal.items == [{"node_id": "TYPE-J2", "name": "Jendela J2", "discipline": "architecture", "properties": {"specification": "aluminium"}, "evidence_ids": ["EV-J2"]}]
    assert not hasattr(proposal, "volume")
    assert not hasattr(proposal, "amount")


@pytest.mark.asyncio
async def test_rab_bridge_endpoint_success_for_lapangan():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        session.add(models.ProjectMember(project_id="PROJECT-A", user_id="USER-LAPANGAN", role="lapangan"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[
                {"node_id": "NODE-1", "node_type": "element_type", "canonical_name": "Pintu P1", "normalized_name": "pintu p1", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.95, "properties": {"material": "wood"}},
                {"node_id": "NODE-2", "node_type": "element_type", "canonical_name": "Kusen K1", "normalized_name": "kusen k1", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.88, "properties": {"material": "aluminum"}},
            ],
            edges=[],
            evidence=[
                {"evidence_id": "EV-1", "document_id": "DOC-XYZ", "page_index": 5, "sheet_id": "A-01", "kind": "text", "raw_text": "Pintu P1 bahan kayu"},
                {"evidence_id": "EV-2", "document_id": "DOC-XYZ", "page_index": 6, "sheet_id": "A-02", "kind": "text", "raw_text": "Kusen K1 aluminium"},
            ],
            node_evidence=[
                {"node_id": "NODE-1", "evidence_id": "EV-1", "role": "source"},
                {"node_id": "NODE-2", "evidence_id": "EV-2", "role": "source"},
            ],
            edge_evidence=[], aliases=[], communities=[],
        )

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-LAPANGAN"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJECT-A/project-graph/rab-bridge",
            json={"node_ids": ["NODE-1", "NODE-2"]},
            headers=headers,
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "requires_human_approval"
    assert data["snapshot_id"] == "SNAP-A"
    assert len(data["items"]) == 2
    assert data["items"][0] == {
        "node_id": "NODE-1",
        "name": "Pintu P1",
        "discipline": "architecture",
        "properties": {"material": "wood"},
        "evidence_ids": ["EV-1"],
    }
    assert data["items"][1] == {
        "node_id": "NODE-2",
        "name": "Kusen K1",
        "discipline": "architecture",
        "properties": {"material": "aluminum"},
        "evidence_ids": ["EV-2"],
    }
    # Pastikan tidak ada field kalkulasi (Aturan Emas)
    for item in data["items"]:
        assert "volume" not in item
        assert "amount" not in item
        assert "price" not in item


@pytest.mark.asyncio
async def test_rab_bridge_endpoint_graph_not_ready():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-B", owner_id="OWNER-A", name="Project B"))
        session.add(models.ProjectMember(project_id="PROJECT-B", user_id="USER-LAPANGAN", role="lapangan"))
        await session.commit()

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-LAPANGAN"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJECT-B/project-graph/rab-bridge",
            json={"node_ids": ["NODE-1"]},
            headers=headers,
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "graph_not_ready"
    assert data["snapshot_id"] is None
    assert data["items"] == []


@pytest.mark.asyncio
async def test_rab_bridge_endpoint_role_rejection():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-C", owner_id="OWNER-A", name="Project C"))
        session.add(models.ProjectMember(project_id="PROJECT-C", user_id="USER-GUEST", role="guest"))
        await session.commit()

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-GUEST"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJECT-C/project-graph/rab-bridge",
            json={"node_ids": ["NODE-1"]},
            headers=headers,
        )

    assert res.status_code == 403
    assert "Role guest not allowed" in res.json()["detail"]

