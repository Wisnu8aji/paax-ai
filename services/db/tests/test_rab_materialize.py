from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.core_engine_client import CoreEngineClient
from paax_db.main import app, get_core_engine_client


class CompleteEngineTransport:
    def __init__(self):
        self.calls = []

    def post(self, path, *, json, headers, timeout):
        self.calls.append((path, json, headers, timeout))
        return type("Response", (), {"status_code": 200, "json": lambda self: {
            "calculation_id": "CALC-1", "status": "complete", "result": 12.5, "unit": "m3",
            "formula": "width x depth x height", "substituted_formula": "0.2 x 0.25 x 250 = 12.5",
            "input_sources": [{"measurement_id": "MF-W", "source_method": "written_dimension", "unit": "m"}],
            "engine_version": "0.6.0", "warnings": ["fixture warning"],
        }})()


async def _seed_materialization_fixture(*, mapping: bool):
    from .conftest import TestSession
    async with TestSession() as session:
        # Flush dependency layers explicitly. The production schema enforces
        # project/snapshot foreign keys and these models intentionally do not
        # expose ORM relationships, so relying on add-order is not portable.
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.flush()

        session.add(models.ProjectMember(project_id="PROJECT-A", user_id="OWNER-A", role="owner"))
        session.add(models.ProjectGraphSnapshot(snapshot_id="SNAP-A", project_id="PROJECT-A", schema_version="v1", source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[], status="active"))
        await session.flush()

        session.add(models.RabBridgeProposal(id="PROP-1", project_id="PROJECT-A", snapshot_id="SNAP-A", node_ids=["NODE-1"], status="approved", created_by="OWNER-A", payload={"items": [{"node_id": "NODE-1", "name": "Kolom beton", "discipline": "structure", "ahsp_code": "A.4.4.1.20", "evidence_ids": ["EV-1"], "properties": {}}]}))
        session.add(models.MeasurementFact(measurement_id="MF-W", project_id="PROJECT-A", snapshot_id="SNAP-A", measurement_type="length", value=Decimal("0.2"), unit="m", source_method="written_dimension", element_ids=["NODE-1"], evidence_refs=["EV-1"], formula_inputs=["width"], verification_status="human_verified", audit_metadata={}))
        await session.flush()

        if mapping:
            session.add(models.RabMaterializationMapping(id="MAP-1", project_id="PROJECT-A", snapshot_id="SNAP-A", work_item_node_id="NODE-1", measurement_fact_ids=["MF-W"], calculation_type="concrete_column_volume", evidence_refs=["EV-1"], approval_status="approved", created_by="OWNER-A"))
        await session.commit()


@pytest.mark.asyncio
async def test_materialization_persists_complete_engine_response_and_authenticated_transport_provenance():
    from sqlalchemy import select
    from .conftest import TestSession
    await _seed_materialization_fixture(mapping=True)
    transport = CompleteEngineTransport()
    app.dependency_overrides[get_core_engine_client] = lambda: CoreEngineClient(transport, internal_key="core-engine-test-key")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize", headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A", "Idempotency-Key": "MATERIALIZE-1"})
    finally:
        app.dependency_overrides.pop(get_core_engine_client, None)
    assert response.status_code == 200 and response.json()["materialized_count"] == 1
    assert transport.calls[0][0] == "/calculations"
    assert transport.calls[0][1]["project_id"] == "PROJECT-A"
    assert transport.calls[0][1]["snapshot_id"] == "SNAP-A"
    assert transport.calls[0][1]["measurement_fact_ids"] == ["MF-W"]
    assert transport.calls[0][1]["inputs"][0]["measurement_id"] == "MF-W"
    assert transport.calls[0][2]["X-Internal-Key"] == "core-engine-test-key"
    async with TestSession() as session:
        draft = (await session.execute(select(models.RabDraft).where(models.RabDraft.project_id == "PROJECT-A"))).scalar_one()
        line = draft.payload["lines"][0]
    assert {key: line[key] for key in ("calculation_id", "calculation_formula", "calculation_substituted_formula", "calculation_input_sources", "calculation_engine_version", "calculation_status", "calculation_warnings", "measurement_mapping_id", "ahsp_selection_approved", "snapshot_id", "proposal_revision", "created_by")} == {
        "calculation_id": "CALC-1", "calculation_formula": "width x depth x height", "calculation_substituted_formula": "0.2 x 0.25 x 250 = 12.5", "calculation_input_sources": [{"measurement_id": "MF-W", "source_method": "written_dimension", "unit": "m"}], "calculation_engine_version": "0.6.0", "calculation_status": "complete", "calculation_warnings": ["fixture warning"], "measurement_mapping_id": "MAP-1", "ahsp_selection_approved": True, "snapshot_id": "SNAP-A", "proposal_revision": 1, "created_by": "OWNER-A"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        replay = await client.post("/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize", headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A", "Idempotency-Key": "MATERIALIZE-1"})
    assert replay.status_code == 200 and replay.json() == response.json()
    async with TestSession() as session:
        immutable_line = (await session.execute(select(models.RabDraft).where(models.RabDraft.project_id == "PROJECT-A"))).scalar_one().payload["lines"][0]
    assert immutable_line["calculation_id"] == "CALC-1" and immutable_line["calculation_warnings"] == ["fixture warning"]


@pytest.mark.asyncio
async def test_materialization_fails_closed_with_structured_blocked_status_without_mapping_or_client():
    await _seed_materialization_fixture(mapping=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize", headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"})
    payload = response.json()
    assert response.status_code == 200 and payload["materialized_count"] == 0 and payload["rab_draft_updated"] is False
    assert payload["skipped_items"] == [{"node_id": "NODE-1", "reason": "blocked_missing_measurement_mapping", "status": "blocked"}]


@pytest.mark.asyncio
async def test_materialization_never_constructs_or_calls_a_client_when_the_composition_root_is_unconfigured():
    await _seed_materialization_fixture(mapping=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/projects/PROJECT-A/project-graph/rab-bridge/PROP-1/materialize", headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"})
    assert response.status_code == 200 and response.json()["materialized_count"] == 0
    assert response.json()["skipped_items"] == [{"node_id": "NODE-1", "reason": "blocked_core_engine_client_unconfigured", "status": "blocked"}]


@pytest.mark.asyncio
async def test_mapping_workflow_derives_provenance_from_approved_scoped_facts_and_audits_resolution():
    from sqlalchemy import select
    from .conftest import TestSession
    await _seed_materialization_fixture(mapping=False)
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/projects/PROJECT-A/project-graph/rab-materialization-mappings", headers=headers, json={"work_item_node_id": "NODE-1", "measurement_fact_ids": ["MF-W"], "calculation_type": "concrete_column_volume"})
        mapping = created.json()
        assert created.status_code == 201 and mapping["approval_status"] == "pending_approval" and mapping["evidence_refs"] == ["EV-1"]
        updated = await client.put(f"/projects/PROJECT-A/project-graph/rab-materialization-mappings/{mapping['id']}", headers=headers, json={"work_item_node_id": "NODE-1", "measurement_fact_ids": ["MF-W"], "calculation_type": "length"})
        assert updated.status_code == 200 and updated.json()["calculation_type"] == "length"
        resolved = await client.post(f"/projects/PROJECT-A/project-graph/rab-materialization-mappings/{mapping['id']}/resolve", headers=headers, json={"status": "approved"})
    assert resolved.status_code == 200 and resolved.json()["approval_status"] == "approved"
    async with TestSession() as session:
        audits = (await session.execute(select(models.RabMaterializationMappingAudit))).scalars().all()
    assert [(row.action, row.actor) for row in audits] == [("created", "OWNER-A"), ("updated", "OWNER-A"), ("approved", "OWNER-A")]

@pytest.mark.asyncio
async def test_agentic_calculation_resolves_only_approved_mapping_and_returns_engine_response_unchanged(monkeypatch):
    from sqlalchemy import select
    from .conftest import TestSession

    await _seed_materialization_fixture(mapping=True)
    monkeypatch.setenv(
        "INTERNAL_SERVICE_SCOPES",
        "dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate",
    )
    transport = CompleteEngineTransport()
    app.dependency_overrides[get_core_engine_client] = lambda: CoreEngineClient(
        transport, internal_key="core-engine-test-key"
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/internal/projects/PROJECT-A/agentic/measurement-facts/calculate",
                headers={
                    "X-Internal-Key": "test-internal-key",
                    "X-User-Id": "ai-orchestrator-agentic",
                    "Idempotency-Key": "AGENT-CALC-1",
                },
                json={"measurement_fact_ids": ["MF-W"], "idempotency_key": "AGENT-CALC-1"},
            )
    finally:
        app.dependency_overrides.pop(get_core_engine_client, None)

    assert response.status_code == 200
    assert response.json() == {
        "calculation_id": "CALC-1",
        "status": "complete",
        "result": 12.5,
        "unit": "m3",
        "formula": "width x depth x height",
        "substituted_formula": "0.2 x 0.25 x 250 = 12.5",
        "input_sources": [{"measurement_id": "MF-W", "source_method": "written_dimension", "unit": "m"}],
        "engine_version": "0.6.0",
        "warnings": ["fixture warning"],
    }
    assert transport.calls[0][0] == "/calculations"
    request = transport.calls[0][1]
    assert request["project_id"] == "PROJECT-A"
    assert request["snapshot_id"] == "SNAP-A"
    assert request["measurement_fact_ids"] == ["MF-W"]
    assert request["calculation_type"] == "concrete_column_volume"
    assert request["requested_by"] == "ai-orchestrator-agentic"
    assert float(request["inputs"][0]["value"]) == 0.2
    async with TestSession() as session:
        audits = (await session.execute(select(models.ToolCallAudit).where(
            models.ToolCallAudit.tool_name == "agentic.core_engine.calculate.completed"
        ))).scalars().all()
    assert len(audits) == 1 and audits[0].project_id == "PROJECT-A"


@pytest.mark.asyncio
async def test_agentic_calculation_fails_closed_without_mapping_or_with_numeric_payload(monkeypatch):
    await _seed_materialization_fixture(mapping=False)
    monkeypatch.setenv(
        "INTERNAL_SERVICE_SCOPES",
        "dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate",
    )
    transport = CompleteEngineTransport()
    app.dependency_overrides[get_core_engine_client] = lambda: CoreEngineClient(
        transport, internal_key="core-engine-test-key"
    )
    headers = {
        "X-Internal-Key": "test-internal-key",
        "X-User-Id": "ai-orchestrator-agentic",
        "Idempotency-Key": "AGENT-CALC-2",
    }
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unmapped = await client.post(
                "/internal/projects/PROJECT-A/agentic/measurement-facts/calculate",
                headers=headers,
                json={"measurement_fact_ids": ["MF-W"], "idempotency_key": "AGENT-CALC-2"},
            )
            numeric = await client.post(
                "/internal/projects/PROJECT-A/agentic/measurement-facts/calculate",
                headers=headers,
                json={
                    "measurement_fact_ids": ["MF-W"],
                    "idempotency_key": "AGENT-CALC-2",
                    "quantity": 999,
                },
            )
    finally:
        app.dependency_overrides.pop(get_core_engine_client, None)

    assert unmapped.status_code == 422
    assert numeric.status_code == 422
    assert transport.calls == []
