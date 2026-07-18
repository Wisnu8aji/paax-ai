from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.project_graph_repository import (
    activate_snapshot,
    build_and_activate_snapshot,
    get_active_snapshot,
    persist_snapshot_graph,
)
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
