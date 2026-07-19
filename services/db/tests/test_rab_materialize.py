from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.main import app, get_core_engine_client


class CompleteEngine:
    def __init__(self):
        self.requests = []

    def calculate(self, request):
        self.requests.append(request)
        return {
            "calculation_id": "CALC-1", "status": "complete", "result": 12.5,
            "unit": "m3", "formula": "width × depth × height",
            "input_sources": [{"measurement_id": "MF-W", "source_method": "written_dimension", "unit": "m"}],
        }


async def _seed_materialization_fixture(*, mapping: bool):
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        session.add(models.ProjectMember(project_id="PROJECT-A", user_id="OWNER-A", role="owner"))
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="SNAP-A", project_id="PROJECT-A", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[], status="active",
        ))
        session.add(models.RabBridgeProposal(
            id="PROP-1", project_id="PROJECT-A", snapshot_id="SNAP-A", node_ids=["NODE-1"],
            status="approved", created_by="OWNER-A", payload={"items": [{
                "node_id": "NODE-1", "name": "Kolom beton", "discipline": "structure",
                "ahsp_code": "A.4.4.1.20", "evidence_ids": ["EV-1"], "properties": {},
            }]},
        ))
        session.add(models.MeasurementFact(
            measurement_id="MF-W", project_id="PROJECT-A", snapshot_id="SNAP-A",
            measurement_type="length", value=Decimal("0.2"), unit="m", source_method="written_dimension",
            element_ids=["NODE-1"], evidence_refs=["EV-1"], formula_inputs=["width"],
            verification_status="human_verified", audit_metadata={},
        ))
        if mapping:
            session.add(models.RabMaterializationMapping(
                id="MAP-1", project_id="PROJECT-A", snapshot_id="SNAP-A", work_item_node_id="NODE-1",
                measurement_fact_ids=["MF-W"], calculation_type="concrete_column_volume", evidence_refs=["EV-1"],
                approval_status="approved", created_by="OWNER-A",
            ))
        await session.commit()


@pytest.mark.asyncio
async def test_materialization_uses_only_an_approved_scoped_mapping_and_injected_engine():
    await _seed_materialization_fixture(mapping=True)
    engine = CompleteEngine()
    app.dependency_overrides[get_core_engine_client] = lambda: engine
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize",
                headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"},
            )
    finally:
        app.dependency_overrides.pop(get_core_engine_client, None)

    assert response.status_code == 200
    assert response.json()["materialized_count"] == 1
    assert engine.requests[0]["project_id"] == "PROJECT-A"
    assert engine.requests[0]["snapshot_id"] == "SNAP-A"
    assert engine.requests[0]["measurement_fact_ids"] == ["MF-W"]
    assert engine.requests[0]["inputs"][0]["measurement_id"] == "MF-W"


@pytest.mark.asyncio
async def test_materialization_fails_closed_with_structured_blocked_status_without_mapping_or_client():
    await _seed_materialization_fixture(mapping=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize",
            headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["materialized_count"] == 0
    assert payload["rab_draft_updated"] is False
    assert payload["skipped_items"] == [{"node_id": "NODE-1", "reason": "blocked_missing_measurement_mapping", "status": "blocked"}]


@pytest.mark.asyncio
async def test_materialization_never_constructs_or_calls_a_client_when_the_composition_root_is_unconfigured():
    await _seed_materialization_fixture(mapping=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize",
            headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"},
        )

    assert response.status_code == 200
    assert response.json()["materialized_count"] == 0
    assert response.json()["skipped_items"] == [{
        "node_id": "NODE-1", "reason": "blocked_core_engine_client_unconfigured", "status": "blocked",
    }]


@pytest.mark.asyncio
async def test_mapping_workflow_derives_provenance_from_approved_scoped_facts_and_audits_resolution():
    from sqlalchemy import select
    from .conftest import TestSession

    await _seed_materialization_fixture(mapping=False)
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/projects/PROJECT-A/project-graph/rab-materialization-mappings",
            headers=headers,
            json={"work_item_node_id": "NODE-1", "measurement_fact_ids": ["MF-W"], "calculation_type": "concrete_column_volume"},
        )
        assert created.status_code == 201
        mapping = created.json()
        assert mapping["approval_status"] == "pending_approval"
        assert mapping["evidence_refs"] == ["EV-1"]
        updated = await client.put(
            f"/projects/PROJECT-A/project-graph/rab-materialization-mappings/{mapping['id']}",
            headers=headers,
            json={"work_item_node_id": "NODE-1", "measurement_fact_ids": ["MF-W"], "calculation_type": "length"},
        )
        assert updated.status_code == 200
        assert updated.json()["calculation_type"] == "length"
        resolved = await client.post(
            f"/projects/PROJECT-A/project-graph/rab-materialization-mappings/{mapping['id']}/resolve",
            headers=headers, json={"status": "approved"},
        )
    assert resolved.status_code == 200
    assert resolved.json()["approval_status"] == "approved"

    async with TestSession() as session:
        audits = (await session.execute(select(models.RabMaterializationMappingAudit))).scalars().all()
    assert [(row.action, row.actor) for row in audits] == [("created", "OWNER-A"), ("updated", "OWNER-A"), ("approved", "OWNER-A")]
