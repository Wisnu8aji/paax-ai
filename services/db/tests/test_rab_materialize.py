from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.main import app

@pytest.mark.asyncio
async def test_materialize_rab_bridge():
    from .conftest import TestSession

    async with TestSession() as session:
        # Setup
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        session.add(models.ProjectMember(project_id="PROJECT-A", user_id="OWNER-A", role="owner"))
        await session.commit()
        
        payload = {
            "items": [
                {
                    "node_id": "NODE-1",
                    "name": "Plesteran bata merah",
                    "discipline": "architecture",
                    "evidence_ids": ["EV-1"],
                    "properties": {
                        "element_type_id": "ET-1",
                        "stored_measurement_facts": [
                            {"name": "luas", "value": 50, "unit": "m2"}
                        ]
                    }
                },
                {
                    "node_id": "NODE-2",
                    "name": "Dinding bata ringan",
                    "discipline": "architecture",
                    "evidence_ids": ["EV-2"],
                    "properties": {
                        "element_type_id": "ET-2"
                    }
                },
                {
                    "node_id": "NODE-3",
                    "name": "Unknown thing",
                    "discipline": "architecture",
                    "evidence_ids": ["EV-3"],
                    "properties": {
                        "element_type_id": "ET-3"
                    }
                }
            ]
        }
        
        assumption = models.QuantityAssumption(
            id="ASS-1",
            project_id="PROJECT-A",
            element_type_id="ET-2",
            text="volume 25",
            source_role="human",
            status="accepted"
        )
        session.add(assumption)
        
        session.add(models.ProjectGraphEvidence(
            snapshot_id="SNAP-A",
            evidence_id="EV-1",
            project_id="PROJECT-A",
            document_id="DOC-1",
            page_index=46,
            sheet_id="A-46",
            kind="DRAWING_REGION",
            raw_text="luas 50"
        ))
        session.add(models.ProjectGraphEvidence(
            snapshot_id="SNAP-A",
            evidence_id="EV-2",
            project_id="PROJECT-A",
            document_id="DOC-1",
            page_index=47,
            sheet_id="A-47",
            kind="DRAWING_REGION",
            raw_text="volume 25"
        ))
        
        proposal = models.RabBridgeProposal(
            id="PROP-1",
            project_id="PROJECT-A",
            snapshot_id="SNAP-A",
            node_ids=["NODE-1", "NODE-2", "NODE-3"],
            status="approved",
            payload=payload,
            created_by="OWNER-A"
        )
        session.add(proposal)
        await session.commit()

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    
    import unittest.mock
    def mock_suggest(name, discipline):
        if "Plesteran" in name: return "A.4.4.1.20", 0.9
        if "Dinding" in name: return "A.4.4.1.1", 0.8
        return None, 0.25
        
    with unittest.mock.patch("paax_db.main.suggest_ahsp_for_node", side_effect=mock_suggest):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
            "/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize",
            headers=headers,
        )

    assert res.status_code == 200
    data = res.json()
    print("DATA", data)
    assert data["materialized_count"] == 1
    assert {item["node_id"] for item in data["skipped_items"]} == {"NODE-2", "NODE-3"}
    assert data["rab_draft_updated"] is True

    async with TestSession() as session:
        from sqlalchemy import select
        draft = (await session.execute(select(models.RabDraft).where(models.RabDraft.project_id == "PROJECT-A"))).scalars().first()
        assert draft is not None
        lines = draft.payload.get("lines", [])
        assert len(lines) == 1
        
        l1 = [l for l in lines if l["volume"] == 50][0]
        assert l1["volume_source"] == "written_dimension"
        assert l1["ahsp_suggested"] is True
        assert l1["sheet_id"] == "A-46"
        assert l1["page_index"] == 46
        
@pytest.mark.asyncio
async def test_materialize_rejected_proposal():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"))
        session.add(models.ProjectMember(project_id="PROJECT-B", user_id="OWNER-B", role="owner"))
        proposal = models.RabBridgeProposal(
            id="PROP-REJ",
            project_id="PROJECT-B",
            snapshot_id="SNAP-B",
            node_ids=[],
            status="rejected",
            payload={"items": []},
            created_by="OWNER-B"
        )
        session.add(proposal)
        await session.commit()

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-B"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJECT-B/project-graph/rab-bridge/PROP-REJ/materialize",
            headers=headers,
        )

    assert res.status_code == 400
