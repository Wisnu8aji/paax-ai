from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.project_graph_repository import (
    activate_snapshot,
    activate_document_revision,
    activate_sheet_revision,
    build_and_activate_snapshot,
    get_active_snapshot,
    plan_incremental_resynthesis,
    persist_snapshot_graph,
)
from paax_db.project_graph_retrieval import retrieve_project_graph
from paax_db.main import app


def test_project_graph_storage_migration_declares_all_immutable_snapshot_tables():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0009_project_graph_storage.py"
    )

    migration = migration_path.read_text(encoding="utf-8")

    for table_name in (
        "project_graph_snapshots",
        "project_graph_nodes",
        "project_graph_edges",
        "project_graph_evidence",
        "project_graph_node_evidence",
        "project_graph_edge_evidence",
        "project_graph_aliases",
        "project_graph_communities",
        "project_graph_query_logs",
    ):
        assert table_name in migration


@pytest.mark.asyncio
async def test_activate_snapshot_supersedes_only_the_project_current_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add_all(
            [
                models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"),
                models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"),
            ]
        )
        await session.commit()

        await activate_snapshot(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-a1",
            generation_metadata={"run_id": "RUN-A1"},
        )
        await activate_snapshot(
            session,
            project_id="PROJECT-B",
            snapshot_id="SNAPSHOT-B1",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-b1",
            generation_metadata={"run_id": "RUN-B1"},
        )
        await activate_snapshot(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A2",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-a2",
            generation_metadata={"run_id": "RUN-A2"},
        )

        active_a = await get_active_snapshot(session, "PROJECT-A")
        active_b = await get_active_snapshot(session, "PROJECT-B")
        snapshots = (
            await session.execute(
                select(models.ProjectGraphSnapshot).order_by(
                    models.ProjectGraphSnapshot.snapshot_id
                )
            )
        ).scalars().all()

    assert active_a.snapshot_id == "SNAPSHOT-A2"
    assert active_b.snapshot_id == "SNAPSHOT-B1"
    assert [(item.snapshot_id, item.status, item.superseded_at is not None) for item in snapshots] == [
        ("SNAPSHOT-A1", "superseded", True),
        ("SNAPSHOT-A2", "active", False),
        ("SNAPSHOT-B1", "active", False),
    ]


@pytest.mark.asyncio
async def test_persist_snapshot_graph_keeps_node_edge_alias_and_evidence_scoped_to_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await activate_snapshot(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-a1",
            generation_metadata={},
        )

        await persist_snapshot_graph(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            nodes=[
                {
                    "node_id": "NODE-J2",
                    "node_type": "element_type",
                    "canonical_name": "J2",
                    "normalized_name": "j2",
                    "discipline": "architecture",
                    "verification_status": "extracted",
                    "confidence": 0.93,
                    "properties": {"raw": "J2"},
                    "search_text": "J2 jendela",
                }
            ],
            edges=[
                {
                    "edge_id": "EDGE-J2-SHEET",
                    "source_node_id": "NODE-J2",
                    "target_node_id": "SHEET-21",
                    "relation": "DEPICTED_IN",
                    "confidence_class": "EXTRACTED",
                    "confidence": 0.93,
                    "properties": {},
                }
            ],
            evidence=[
                {
                    "evidence_id": "EV-21-J2",
                    "document_id": "DOC-1",
                    "page_index": 20,
                    "sheet_id": "S-21",
                    "kind": "text",
                    "raw_text": "J2",
                    "revision_id": "REV-1",
                    "run_id": "RUN-1",
                    "dem_page_id": "PAGE-1",
                    "view_id": "VIEW-1",
                    "zone_id": "ZONE-1",
                    "modality": "vector",
                    "raw_content": "J2",
                    "normalized_content": "j2",
                    "bbox_source": [0, 0, 10, 10],
                    "bbox_normalized": [0, 0, 10, 10],
                    "polygon_source": [1, 2, 3],
                    "polygon_normalized": [1, 2, 3],
                    "confidence": 0.95,
                    "extractor": {"model": "gpt-4"},
                    "artifact_hash": "hash-123"
                }
            ],
            node_evidence=[{"node_id": "NODE-J2", "evidence_id": "EV-21-J2", "role": "source"}],
            edge_evidence=[],
            aliases=[
                {
                    "alias_normalized": "j2",
                    "alias_raw": "JENDELA (J2)",
                    "node_id": "NODE-J2",
                    "alias_type": "normalized",
                    "confidence": 0.93,
                }
            ],
            communities=[
                {
                    "community_id": "COMMUNITY-1",
                    "community_type": "connected_component",
                    "name": "J2 group",
                    "summary": "Element J2 and source sheet",
                    "member_count": 2,
                }
            ],
        )

        node = (
            await session.execute(
                select(models.ProjectGraphNode).where(
                    models.ProjectGraphNode.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()
        edge = (
            await session.execute(
                select(models.ProjectGraphEdge).where(
                    models.ProjectGraphEdge.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()
        alias = (
            await session.execute(
                select(models.ProjectGraphAlias).where(
                    models.ProjectGraphAlias.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()
        node_evidence = (
            await session.execute(select(models.ProjectGraphNodeEvidence))
        ).scalars().one()
        evidence_rec = (
            await session.execute(
                select(models.ProjectGraphEvidence).where(
                    models.ProjectGraphEvidence.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()

    assert (node.project_id, node.node_id, node.properties_json) == (
        "PROJECT-A",
        "NODE-J2",
        {"raw": "J2"},
    )
    assert (edge.source_node_id, edge.target_node_id, edge.relation) == (
        "NODE-J2",
        "SHEET-21",
        "DEPICTED_IN",
    )
    assert (alias.alias_normalized, alias.node_id) == ("j2", "NODE-J2")
    assert (node_evidence.node_id, node_evidence.evidence_id, node_evidence.role) == (
        "NODE-J2",
        "EV-21-J2",
        "source",
    )
    assert (evidence_rec.revision_id, evidence_rec.run_id, evidence_rec.dem_page_id) == ("REV-1", "RUN-1", "PAGE-1")
    assert (evidence_rec.view_id, evidence_rec.zone_id, evidence_rec.modality) == ("VIEW-1", "ZONE-1", "vector")
    assert (evidence_rec.raw_content, evidence_rec.normalized_content) == ("J2", "j2")
    assert (evidence_rec.bbox_source, evidence_rec.bbox_normalized) == ([0, 0, 10, 10], [0, 0, 10, 10])
    assert (evidence_rec.polygon_source, evidence_rec.polygon_normalized) == ([1, 2, 3], [1, 2, 3])
    assert float(evidence_rec.confidence) == 0.95
    assert evidence_rec.extractor == {"model": "gpt-4"}
    assert evidence_rec.artifact_hash == "hash-123"


@pytest.mark.asyncio
async def test_build_and_activate_snapshot_writes_graph_before_it_becomes_current():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()

        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-a1",
            generation_metadata={},
            nodes=[
                {
                    "node_id": "NODE-J2",
                    "node_type": "element_type",
                    "canonical_name": "J2",
                    "normalized_name": "j2",
                    "discipline": "architecture",
                    "verification_status": "extracted",
                    "confidence": 0.93,
                }
            ],
            edges=[],
            evidence=[],
            node_evidence=[],
            edge_evidence=[],
            aliases=[],
            communities=[],
        )

        active_snapshot = await get_active_snapshot(session, "PROJECT-A")
        stored_node = (
            await session.execute(
                select(models.ProjectGraphNode).where(
                    models.ProjectGraphNode.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()

    assert active_snapshot.snapshot_id == "SNAPSHOT-A1"
    assert stored_node.node_id == "NODE-J2"


@pytest.mark.asyncio
async def test_snapshot_telemetry_is_bounded_and_cannot_break_activation():
    from .conftest import TestSession

    events = []
    async def failing_logger(event):
        events.append(event)
        raise RuntimeError("telemetry unavailable")

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-TELEMETRY", owner_id="OWNER-A", name="Telemetry"))
        await session.commit()
        snapshot = await build_and_activate_snapshot(
            session, project_id="PROJECT-TELEMETRY", snapshot_id="SNAP-TELEMETRY",
            schema_version="paax.pckm.graph.v1", source_manifest_hash="manifest", generation_metadata={"run_id": "RUN-1"},
            nodes=[{"node_id": "N-1", "node_type": "measurement_fact", "canonical_name": "Q", "normalized_name": "q", "discipline": "architecture", "verification_status": "conflict", "confidence": 0.5}],
            edges=[], evidence=[{"evidence_id": "E-1", "document_id": "D", "sheet_id": "S", "page_index": 0, "kind": "text", "raw_text": "x", "raw_content": "x", "normalized_content": "x", "source_type": "text"}],
            node_evidence=[], edge_evidence=[], aliases=[], communities=[], telemetry=failing_logger, correlation_id="trace-snapshot",
        )
    assert snapshot.status == "active"
    assert events[0]["operation"] == "pckm.snapshot.activated"
    assert events[0]["run_id"] == "RUN-1"
    assert events[0]["project_id"] == "PROJECT-TELEMETRY" and events[0]["snapshot_id"] == "SNAP-TELEMETRY"
    assert events[0]["correlation_id"] == "trace-snapshot"
    assert events[0]["metadata"] == {"node_count": 1, "reference_count": 1, "physical_count": 1, "conflict_count": 1, "missing_count": 0}


@pytest.mark.asyncio
async def test_project_graph_snapshot_api_is_project_scoped_and_returns_only_active_snapshot():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    payload = {
        "snapshot_id": "SNAPSHOT-A1",
        "schema_version": "paax.pckm.graph.v1",
        "source_manifest_hash": "manifest-a1",
        "generation_metadata": {"run_id": "RUN-A1"},
        "nodes": [
            {
                "node_id": "NODE-J2",
                "node_type": "element_type",
                "canonical_name": "J2",
                "normalized_name": "j2",
                "discipline": "architecture",
                "verification_status": "extracted",
                "confidence": 0.93,
            }
        ],
        "edges": [],
        "evidence": [],
        "node_evidence": [],
        "edge_evidence": [],
        "aliases": [],
        "communities": [],
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_project = await client.post(
            "/projects",
            json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"},
            headers=headers,
        )
        created_snapshot = await client.post(
            "/projects/PROJECT-A/project-graph/snapshots",
            json=payload,
            headers=headers,
        )
        active_snapshot = await client.get(
            "/projects/PROJECT-A/project-graph/snapshot",
            headers=headers,
        )

    assert create_project.status_code == 200
    assert created_snapshot.status_code == 200
    assert active_snapshot.status_code == 200
    assert active_snapshot.json()["snapshot_id"] == "SNAPSHOT-A1"


@pytest.mark.asyncio
async def test_project_graph_evidence_immutability():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await activate_snapshot(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="manifest-a1",
            generation_metadata={},
        )

        await persist_snapshot_graph(
            session,
            project_id="PROJECT-A",
            snapshot_id="SNAPSHOT-A1",
            nodes=[],
            edges=[],
            evidence=[
                {
                    "evidence_id": "EV-1",
                    "document_id": "DOC-1",
                    "page_index": 0,
                    "sheet_id": "S-1",
                    "kind": "text",
                    "raw_text": "Original text",
                }
            ],
            node_evidence=[],
            edge_evidence=[],
            aliases=[],
            communities=[],
        )

        # Retrieve the evidence record
        evidence_rec = (
            await session.execute(
                select(models.ProjectGraphEvidence).where(
                    models.ProjectGraphEvidence.snapshot_id == "SNAPSHOT-A1"
                )
            )
        ).scalars().one()

        # Try to modify raw_text
        evidence_rec.raw_text = "Modified text"
        
        # Verify that session.commit() raises ValueError due to our event listener
        with pytest.raises(ValueError, match="immutable"):
            await session.commit()


@pytest.mark.asyncio
async def test_effective_sheet_revision_supersedes_old_truth_and_default_retrieval_excludes_it():
    """Only the snapshot scoped to effective sheet revisions is retrievable by default."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-REV", owner_id="OWNER-REV", name="Revision project"))
        session.add_all([
            models.DocumentRevision(
                revision_id="DOC-REV-1", project_id="PROJECT-REV", document_id="DOC-1",
                issue_purpose="Tender", status="issued",
            ),
            models.DocumentRevision(
                revision_id="DOC-REV-2", project_id="PROJECT-REV", document_id="DOC-1",
                issue_purpose="Construction", status="issued", supersedes_revision_id="DOC-REV-1",
            ),
            models.SheetRevision(
                revision_id="SHEET-REV-1", project_id="PROJECT-REV", document_id="DOC-1",
                document_revision_id="DOC-REV-1", sheet_id="A-101", issue_purpose="Tender", status="issued",
            ),
            models.SheetRevision(
                revision_id="SHEET-REV-2", project_id="PROJECT-REV", document_id="DOC-1",
                document_revision_id="DOC-REV-2", sheet_id="A-101", issue_purpose="Construction",
                status="issued", supersedes_revision_id="SHEET-REV-1",
                revision_cloud_regions=[{"bbox": [1, 2, 3, 4]}],
            ),
        ])
        await session.commit()

        await activate_document_revision(session, project_id="PROJECT-REV", revision_id="DOC-REV-1")
        await activate_sheet_revision(session, project_id="PROJECT-REV", revision_id="SHEET-REV-1")
        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-REV", snapshot_id="SNAP-REV-1", schema_version="paax.pckm.graph.v2",
            source_manifest_hash="old", generation_metadata={}, effective_sheet_revision_ids=["SHEET-REV-1"],
            nodes=[{
                "node_id": "NODE-OLD", "node_type": "element_type", "canonical_name": "Kusen lama",
                "normalized_name": "kusen lama", "discipline": "architecture", "verification_status": "extracted",
                "confidence": 1.0,
            }],
            edges=[],
            evidence=[{
                "evidence_id": "EV-OLD", "document_id": "DOC-1", "page_index": 0, "sheet_id": "A-101",
                "kind": "text", "raw_text": "Kusen lama", "revision_id": "SHEET-REV-1",
            }],
            node_evidence=[{"node_id": "NODE-OLD", "evidence_id": "EV-OLD", "role": "source"}],
            edge_evidence=[], aliases=[], communities=[],
        )

        await activate_document_revision(session, project_id="PROJECT-REV", revision_id="DOC-REV-2")
        await activate_sheet_revision(session, project_id="PROJECT-REV", revision_id="SHEET-REV-2")
        assert await get_active_snapshot(session, "PROJECT-REV") is None

        await build_and_activate_snapshot(
            session,
            project_id="PROJECT-REV", snapshot_id="SNAP-REV-2", schema_version="paax.pckm.graph.v2",
            source_manifest_hash="new", generation_metadata={}, effective_sheet_revision_ids=["SHEET-REV-2"],
            nodes=[{
                "node_id": "NODE-NEW", "node_type": "element_type", "canonical_name": "Kusen baru",
                "normalized_name": "kusen baru", "discipline": "architecture", "verification_status": "extracted",
                "confidence": 1.0,
            }],
            edges=[],
            evidence=[{
                "evidence_id": "EV-NEW", "document_id": "DOC-1", "page_index": 0, "sheet_id": "A-101",
                "kind": "text", "raw_text": "Kusen baru", "revision_id": "SHEET-REV-2",
            }],
            node_evidence=[{"node_id": "NODE-NEW", "evidence_id": "EV-NEW", "role": "source"}],
            edge_evidence=[], aliases=[], communities=[],
        )

        old_document = await session.get(models.DocumentRevision, "DOC-REV-1")
        old_sheet = await session.get(models.SheetRevision, "SHEET-REV-1")
        result = await retrieve_project_graph(
            session, project_id="PROJECT-REV", query="kusen", depth=0, use_intent=False,
        )

    assert old_document.status == "superseded"
    assert old_document.superseded_by_revision_id == "DOC-REV-2"
    assert old_sheet.status == "superseded"
    assert old_sheet.superseded_by_revision_id == "SHEET-REV-2"
    assert result.snapshot_id == "SNAP-REV-2"
    assert [node.node_id for node in result.nodes] == ["NODE-NEW"]
    assert [item.evidence_id for item in result.evidence] == ["EV-NEW"]


@pytest.mark.asyncio
async def test_incremental_resynthesis_plan_is_limited_to_changed_page_and_invalidates_its_cache():
    """A revision change identifies only directly affected graph records and cache entries."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-INCR", owner_id="OWNER-INCR", name="Incremental project"))
        await session.commit()
        await activate_snapshot(
            session, project_id="PROJECT-INCR", snapshot_id="SNAP-INCR", schema_version="paax.pckm.graph.v2",
            source_manifest_hash="manifest", generation_metadata={},
        )
        await persist_snapshot_graph(
            session,
            project_id="PROJECT-INCR", snapshot_id="SNAP-INCR",
            nodes=[
                {"node_id": "NODE-CHANGED", "node_type": "note", "canonical_name": "changed", "normalized_name": "changed", "discipline": "architecture", "verification_status": "extracted", "confidence": 1.0, "level_id": "L1"},
                {"node_id": "NODE-UNCHANGED", "node_type": "note", "canonical_name": "unchanged", "normalized_name": "unchanged", "discipline": "architecture", "verification_status": "extracted", "confidence": 1.0, "level_id": "L2"},
            ],
            edges=[
                {"edge_id": "EDGE-CHANGED", "source_node_id": "NODE-CHANGED", "target_node_id": "NODE-UNCHANGED", "relation": "REFERENCES", "confidence_class": "EXTRACTED", "confidence": 1.0},
            ],
            evidence=[
                {"evidence_id": "EV-CHANGED", "document_id": "DOC-1", "page_index": 0, "sheet_id": "A-101", "kind": "text", "raw_text": "changed", "revision_id": "SHEET-REV-2"},
                {"evidence_id": "EV-UNCHANGED", "document_id": "DOC-1", "page_index": 1, "sheet_id": "A-102", "kind": "text", "raw_text": "unchanged", "revision_id": "SHEET-REV-OTHER"},
            ],
            node_evidence=[
                {"node_id": "NODE-CHANGED", "evidence_id": "EV-CHANGED", "role": "source"},
                {"node_id": "NODE-UNCHANGED", "evidence_id": "EV-UNCHANGED", "role": "source"},
            ],
            edge_evidence=[{"edge_id": "EDGE-CHANGED", "evidence_id": "EV-CHANGED", "role": "source"}],
            aliases=[], communities=[],
        )
        session.add_all([
            models.ProjectGraphRetrievalCache(cache_key="CACHE-CHANGED", project_id="PROJECT-INCR", snapshot_id="SNAP-INCR", payload={}, expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)),
            models.ProjectGraphRetrievalCache(cache_key="CACHE-OTHER", project_id="PROJECT-INCR", snapshot_id="OTHER-SNAPSHOT", payload={}, expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)),
        ])
        await session.commit()

        plan = await plan_incremental_resynthesis(
            session, project_id="PROJECT-INCR", snapshot_id="SNAP-INCR", document_id="DOC-1",
            sheet_id="A-101", page_index=0, revision_id="SHEET-REV-2",
        )
        cache_keys = (await session.execute(select(models.ProjectGraphRetrievalCache.cache_key))).scalars().all()

    assert plan.evidence_ids == ("EV-CHANGED",)
    assert plan.node_ids == ("NODE-CHANGED",)
    assert plan.edge_ids == ("EDGE-CHANGED",)
    assert plan.summary_level_ids == ("L1",)
    assert plan.invalidated_cache_entries == 1
    assert cache_keys == ["CACHE-OTHER"]
