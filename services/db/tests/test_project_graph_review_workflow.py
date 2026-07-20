from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.main import app
from paax_db.project_graph_repository import build_and_activate_snapshot


def node(
    node_id: str,
    node_type: str,
    name: str,
    *,
    status: str = "confirmed",
    properties: dict | None = None,
) -> dict:
    return {
        "node_id": node_id,
        "node_type": node_type,
        "canonical_name": name,
        "normalized_name": name.lower(),
        "discipline": "structure",
        "verification_status": status,
        "confidence": 0.95,
        "properties": properties or {},
        "search_text": name,
    }


def edge(edge_id: str, source: str, target: str, relation: str, *, confidence_class: str = "EXTRACTED") -> dict:
    return {
        "edge_id": edge_id,
        "source_node_id": source,
        "target_node_id": target,
        "relation": relation,
        "confidence_class": confidence_class,
        "confidence": 0.95,
        "properties": {},
    }


async def persist_quantity_fixture(session, *, project_id: str = "PROJECT-C78", snapshot_id: str = "SNAP-C78"):
    session.add(models.Project(id=project_id, owner_id="OWNER-C78", name="C7/C8 fixture"))
    await session.commit()
    await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version="paax.pckm.graph.v1",
        source_manifest_hash=snapshot_id,
        generation_metadata={},
        nodes=[
            node("TYPE-K1", "element_type", "K1"),
            node("OCC-K1", "element_occurrence", "K1 occurrence"),
            node("DIM-K1", "dimension", "300 mm", properties={"value": "300", "unit": "mm"}),
            node("TYPE-K1A", "element_type", "K1A"),
            node("OCC-K1A", "element_occurrence", "K1A occurrence"),
            node("LEVEL-1", "level", "Lantai 1"),
        ],
        edges=[
            edge("I-K1", "OCC-K1", "TYPE-K1", "INSTANCE_OF"),
            edge("L-K1", "OCC-K1", "LEVEL-1", "LOCATED_ON"),
            edge("D-K1", "TYPE-K1", "DIM-K1", "HAS_DIMENSION"),
            edge("I-K1A", "OCC-K1A", "TYPE-K1A", "INSTANCE_OF"),
            edge("L-K1A", "OCC-K1A", "LEVEL-1", "LOCATED_ON"),
        ],
        evidence=[
            {"evidence_id": "EV-K1", "document_id": "DOC-C78", "page_index": 1, "sheet_id": "S-1", "kind": "text", "raw_text": "K1 300 mm"},
            {"evidence_id": "EV-K1A", "document_id": "DOC-C78", "page_index": 2, "sheet_id": "S-2", "kind": "text", "raw_text": "K1A"},
        ],
        node_evidence=[
            {"node_id": "TYPE-K1", "evidence_id": "EV-K1", "role": "source"},
            {"node_id": "OCC-K1", "evidence_id": "EV-K1", "role": "source"},
            {"node_id": "TYPE-K1A", "evidence_id": "EV-K1A", "role": "source"},
            {"node_id": "OCC-K1A", "evidence_id": "EV-K1A", "role": "source"},
        ],
        edge_evidence=[], aliases=[], communities=[],
    )


@pytest.mark.asyncio
async def test_review_queue_and_quantity_readiness_prioritize_k1a_missing_dimension():
    from .conftest import TestSession

    async with TestSession() as session:
        await persist_quantity_fixture(session)

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-C78"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        queue_response = await client.get(
            "/projects/PROJECT-C78/project-graph/review-queue", headers=headers
        )
        readiness_response = await client.get(
            "/projects/PROJECT-C78/project-graph/quantity-readiness", headers=headers
        )

    assert queue_response.status_code == 200
    queue = queue_response.json()
    missing = next(item for item in queue["items"] if item["target_id"] == "TYPE-K1A")
    assert missing["reason_codes"] == ["no_written_dimension"]
    assert missing["priority"] == 2.5
    assert missing["occurrence_count"] == 1
    assert missing["evidence_refs"] == ["EV-K1A"]

    assert readiness_response.status_code == 200
    readiness = {item["element_type_id"]: item for item in readiness_response.json()["items"]}
    assert readiness["TYPE-K1"]["readiness"] == "ready"
    assert readiness["TYPE-K1A"]["readiness"] == "blocked"
    assert readiness["TYPE-K1A"]["reason_codes"] == ["no_written_dimension"]
    assert readiness_response.json()["summary"] == {
        "total": 2,
        "ready": 1,
        "needs_review": 0,
        "blocked": 1,
    }


@pytest.mark.asyncio
async def test_accepted_correction_is_read_overlay_and_new_snapshot_marks_missing_target_stale():
    from .conftest import TestSession

    async with TestSession() as session:
        await persist_quantity_fixture(session, project_id="PROJECT-CORR", snapshot_id="SNAP-CORR-1")

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-C78"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/projects/PROJECT-CORR/project-graph/corrections",
            json={
                "id": "CORR-C78",
                "snapshot_id": "SNAP-CORR-1",
                "target_type": "node",
                "target_id": "TYPE-K1",
                "correction_type": "rename",
                "proposed_value": {"canonical_name": "K1 corrected"},
                "rationale": "Human review",
            },
            headers=headers,
        )
        resolved = await client.post(
            "/projects/PROJECT-CORR/project-graph/corrections/CORR-C78/resolve",
            json={"status": "accepted", "resolution_note": "Approved"},
            headers=headers,
        )
        retrieved = await client.post(
            "/projects/PROJECT-CORR/project-graph/retrieve",
            json={"query": "K1", "use_intent": False},
            headers=headers,
        )

    assert created.status_code == 200
    assert resolved.status_code == 200
    corrected = next(item for item in retrieved.json()["nodes"] if item["node_id"] == "TYPE-K1")
    assert corrected["name"] == "K1 corrected"
    assert corrected["data_status"] == "corrected"
    assert retrieved.json()["data_status"] == "corrected"
    assert corrected["correction"]["rationale"] == "Human review"
    assert corrected["correction"]["created_by"] == "OWNER-C78"

    from .conftest import TestSession
    async with TestSession() as session:
        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-CORR",
            snapshot_id="SNAP-CORR-2",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="SNAP-CORR-2",
            generation_metadata={},
            nodes=[node("TYPE-K1", "element_type", "K1")],
            edges=[],
            evidence=[{"evidence_id": "EV-K1", "document_id": "DOC-C78", "page_index": 1, "sheet_id": "S-1", "kind": "text", "raw_text": "K1 300 mm"}],
            node_evidence=[{"node_id": "TYPE-K1", "evidence_id": "EV-K1", "role": "source"}],
            edge_evidence=[], aliases=[], communities=[],
        )
        carried = (
            await session.execute(
                select(models.ProjectGraphCorrection).where(
                    models.ProjectGraphCorrection.snapshot_id == "SNAP-CORR-2"
                )
            )
        ).scalars().all()

    assert len(carried) == 1
    assert carried[0].status == "accepted"
    assert carried[0].carried_from == "CORR-C78"
    async with TestSession() as session:
        audit = (await session.execute(select(models.ProjectGraphCorrectionAudit).where(
            models.ProjectGraphCorrectionAudit.target_snapshot_id == "SNAP-CORR-2"
        ))).scalars().one()
    assert audit.decision == "carried_forward"

    async with TestSession() as session:
        await persist_quantity_fixture(session, project_id="PROJECT-STALE", snapshot_id="SNAP-STALE-1")
        session.add(models.ProjectGraphCorrection(
            id="CORR-STALE", project_id="PROJECT-STALE", snapshot_id="SNAP-STALE-1",
            target_type="node", target_id="TYPE-K1", correction_type="rename",
            proposed_value={"canonical_name": "K1 corrected"}, rationale="Human review",
            status="accepted", created_by="OWNER-C78",
            resolved_by="OWNER-C78", resolved_at=datetime.now(timezone.utc),
        ))
        await session.commit()
        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-STALE",
            snapshot_id="SNAP-STALE-2",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="SNAP-STALE-2",
            generation_metadata={},
            nodes=[node("TYPE-K1A", "element_type", "K1A")],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )
        stale = (
            await session.execute(
                select(models.ProjectGraphCorrection).where(
                    models.ProjectGraphCorrection.snapshot_id == "SNAP-STALE-2"
                )
            )
        ).scalars().one()

    assert stale.status == "stale"
    assert stale.carried_from == "CORR-STALE"


@pytest.mark.asyncio
async def test_carry_forward_marks_evidence_revision_change_stale_with_audit():
    from .conftest import TestSession

    async with TestSession() as session:
        await persist_quantity_fixture(session, project_id="PROJECT-REV", snapshot_id="SNAP-REV-1")
        session.add(models.ProjectGraphCorrection(
            id="CORR-REV", project_id="PROJECT-REV", snapshot_id="SNAP-REV-1",
            target_type="node", target_id="TYPE-K1", correction_type="rename",
            proposed_value={"canonical_name": "K1 approved"}, rationale="reviewed",
            status="accepted", created_by="OWNER-C78",
            resolved_by="OWNER-C78", resolved_at=datetime.now(timezone.utc),
        ))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-REV", snapshot_id="SNAP-REV-2", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="rev-2", generation_metadata={}, nodes=[node("TYPE-K1", "element_type", "K1")], edges=[],
            evidence=[{"evidence_id": "EV-K1", "document_id": "DOC-C78", "page_index": 1, "sheet_id": "S-1", "kind": "text", "raw_text": "K1 revised", "revision_id": "REV-2"}],
            node_evidence=[{"node_id": "TYPE-K1", "evidence_id": "EV-K1", "role": "source"}], edge_evidence=[], aliases=[], communities=[],
        )
        stale = (await session.execute(select(models.ProjectGraphCorrection).where(
            models.ProjectGraphCorrection.snapshot_id == "SNAP-REV-2"
        ))).scalars().one()
        audit = (await session.execute(select(models.ProjectGraphCorrectionAudit).where(
            models.ProjectGraphCorrectionAudit.correction_id == stale.id
        ))).scalars().one()
    assert stale.status == "stale"
    assert "Evidence revision" in stale.resolution_note
    assert audit.decision == "stale"


@pytest.mark.asyncio
async def test_rab_bridge_persists_pending_proposal_without_calculated_fields():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-PROP", owner_id="OWNER-C78", name="Proposal"))
        await session.commit()
        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-PROP", snapshot_id="SNAP-PROP", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="proposal", generation_metadata={},
            nodes=[node("TYPE-K1", "element_type", "K1")],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-C78"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/PROJECT-PROP/project-graph/rab-bridge",
            json={"node_ids": ["TYPE-K1"]}, headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "requires_human_approval"
    assert payload["proposal_id"]
    assert "volume" not in payload and "amount" not in payload

    from .conftest import TestSession
    async with TestSession() as session:
        proposal = await session.get(models.RabBridgeProposal, payload["proposal_id"])
    assert proposal.status == "candidate_ready"
    assert proposal.node_ids == ["TYPE-K1"]


@pytest.mark.asyncio
async def test_accepted_correction_is_attached_to_summary_view_overlay():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-VIEW", owner_id="OWNER-C78", name="View"))
        await session.commit()
        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-VIEW", snapshot_id="SNAP-VIEW", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="view", generation_metadata={},
            nodes=[node("TYPE-K1", "element_type", "K1")],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
            summary_views=[{
                "schema_version": "paax.pckm.summary-view.v1", "project_id": "PROJECT-VIEW",
                "snapshot_id": "SNAP-VIEW", "view_kind": "LEVEL_OVERVIEW", "grain": {"level_id": "LEVEL-1"},
                "summary": {
                    "level_name": "Lantai 1",
                    "element_type_index": [{"element_type_id": "TYPE-K1", "name": "K1", "occurrence_count": 1}],
                    "discipline_counts": [], "stored_measurement_facts": [],
                },
                "quality": {"confirmed_count": 1, "ambiguous_binding_count": 0, "conflict_count": 0},
                "provenance": {"summary_builder_version": "test"},
            }],
        )

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-C78"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/projects/PROJECT-VIEW/project-graph/corrections",
            json={
                "id": "CORR-VIEW", "snapshot_id": "SNAP-VIEW", "target_type": "node",
                "target_id": "TYPE-K1", "correction_type": "rename",
                "proposed_value": {"canonical_name": "K1 corrected"}, "rationale": "Human review",
            }, headers=headers,
        )
        await client.post(
            "/projects/PROJECT-VIEW/project-graph/corrections/CORR-VIEW/resolve",
            json={"status": "accepted", "resolution_note": "Approved"}, headers=headers,
        )
        response = await client.get(
            "/projects/PROJECT-VIEW/project-graph/summary-views", headers=headers
        )

    assert response.status_code == 200
    payload = response.json()[0]["payload"]
    assert payload["data_status"] == "corrected"
    assert payload["summary"]["element_type_index"][0]["name"] == "K1 corrected"
    assert payload["summary"]["element_type_index"][0]["data_status"] == "corrected"


async def persist_quantity_fixture_6_levels(session, project_id, snapshot_id):
    session.add(models.Project(id=project_id, owner_id="OWNER", name="6 levels"))
    await session.commit()
    
    arch_type = node("TYPE-ARCH", "element_type", "A1")
    arch_type["discipline"] = "architecture"
    
    await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version="paax.pckm.graph.v1",
        source_manifest_hash=snapshot_id,
        generation_metadata={},
        nodes=[
            node("LEVEL-1", "level", "L1"), node("LEVEL-2", "level", "L2"),
            node("LEVEL-3", "level", "L3"), node("LEVEL-4", "level", "L4"),
            node("LEVEL-5", "level", "L5"), node("LEVEL-6", "level", "L6"),
            
            node("TYPE-K1", "element_type", "K1"),
            node("OCC-K1", "element_occurrence", "K1 occ"),
            node("DIM-K1", "dimension", "300 mm", properties={"value": "300", "unit": "mm"}),
            
            node("TYPE-K2", "element_type", "K2"),
            *[node(f"OCC-K2-{i}", "element_occurrence", f"K2 occ {i}") for i in range(1, 7)],
            node("DIM-K2", "dimension", "400 mm", properties={"value": "400", "unit": "mm"}),
            
            arch_type,
            node("OCC-ARCH", "element_occurrence", "A1 occ"),
            node("DIM-ARCH", "dimension", "100 mm", properties={"value": "100", "unit": "mm"}),
            
            node("TYPE-K3", "element_type", "K3"),
            node("OCC-K3", "element_occurrence", "K3 occ"),
        ],
        edges=[
            edge("I-K1", "OCC-K1", "TYPE-K1", "INSTANCE_OF"),
            edge("L-K1", "OCC-K1", "LEVEL-1", "LOCATED_ON"),
            edge("D-K1", "TYPE-K1", "DIM-K1", "HAS_DIMENSION"),
            
            *[edge(f"I-K2-{i}", f"OCC-K2-{i}", "TYPE-K2", "INSTANCE_OF") for i in range(1, 7)],
            *[edge(f"L-K2-{i}", f"OCC-K2-{i}", f"LEVEL-{i}", "LOCATED_ON") for i in range(1, 7)],
            edge("D-K2", "TYPE-K2", "DIM-K2", "HAS_DIMENSION"),
            
            edge("I-ARCH", "OCC-ARCH", "TYPE-ARCH", "INSTANCE_OF"),
            edge("L-ARCH", "OCC-ARCH", "LEVEL-1", "LOCATED_ON"),
            edge("D-ARCH", "TYPE-ARCH", "DIM-ARCH", "HAS_DIMENSION"),
            
            edge("I-K3", "OCC-K3", "TYPE-K3", "INSTANCE_OF"),
            edge("L-K3", "OCC-K3", "LEVEL-1", "LOCATED_ON"),
        ],
        evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[]
    )

async def persist_quantity_fixture_2_levels(session, project_id, snapshot_id):
    session.add(models.Project(id=project_id, owner_id="OWNER", name="2 levels"))
    await session.commit()
    await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version="paax.pckm.graph.v1",
        source_manifest_hash=snapshot_id,
        generation_metadata={},
        nodes=[
            node("LEVEL-1", "level", "L1"), node("LEVEL-2", "level", "L2"),
            
            node("TYPE-K1", "element_type", "K1"),
            node("OCC-K1", "element_occurrence", "K1 occ"),
            node("DIM-K1", "dimension", "300 mm", properties={"value": "300", "unit": "mm"}),
        ],
        edges=[
            edge("I-K1", "OCC-K1", "TYPE-K1", "INSTANCE_OF"),
            edge("L-K1", "OCC-K1", "LEVEL-1", "LOCATED_ON"),
            edge("D-K1", "TYPE-K1", "DIM-K1", "HAS_DIMENSION"),
        ],
        evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[]
    )

@pytest.mark.asyncio
async def test_sparse_occurrence_flag_on_6_levels():
    from .conftest import TestSession

    async with TestSession() as session:
        await persist_quantity_fixture_6_levels(session, "PROJ-6", "SNAP-6")

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        readiness_response = await client.get(
            "/projects/PROJ-6/project-graph/quantity-readiness", headers=headers
        )

    assert readiness_response.status_code == 200
    readiness = {item["element_type_id"]: item for item in readiness_response.json()["items"]}
    
    assert readiness["TYPE-K1"]["readiness"] == "ready"
    assert "sparse_occurrence_vs_levels" in readiness["TYPE-K1"]["reason_codes"]
    
    assert readiness["TYPE-K2"]["readiness"] == "ready"
    assert "sparse_occurrence_vs_levels" not in readiness["TYPE-K2"]["reason_codes"]
    
    assert readiness["TYPE-ARCH"]["readiness"] == "ready"
    assert "sparse_occurrence_vs_levels" not in readiness["TYPE-ARCH"]["reason_codes"]
    
    assert readiness["TYPE-K3"]["readiness"] == "blocked"
    assert "sparse_occurrence_vs_levels" not in readiness["TYPE-K3"]["reason_codes"]

@pytest.mark.asyncio
async def test_sparse_occurrence_flag_on_2_levels():
    from .conftest import TestSession

    async with TestSession() as session:
        await persist_quantity_fixture_2_levels(session, "PROJ-2", "SNAP-2")

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        readiness_response = await client.get(
            "/projects/PROJ-2/project-graph/quantity-readiness", headers=headers
        )

    assert readiness_response.status_code == 200
    readiness = {item["element_type_id"]: item for item in readiness_response.json()["items"]}
    
    assert readiness["TYPE-K1"]["readiness"] == "ready"
    assert "sparse_occurrence_vs_levels" not in readiness["TYPE-K1"]["reason_codes"]
