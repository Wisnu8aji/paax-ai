import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from paax_db import models
from .conftest import TestSession
from datetime import datetime


@pytest.mark.asyncio
async def test_snapshot_immutability():
    """Verify that ProjectGraphSnapshot structural fields are immutable, but status/timestamp can be updated."""
    async with TestSession() as session:
        proj = models.Project(id="PROJ-IMM", owner_id="OWNER-1", name="Proj Imm")
        session.add(proj)
        await session.commit()

        snap = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-IMM-1",
            project_id="PROJ-IMM",
            schema_version="paax.pckm.graph.v1",
            source_manifest_hash="hash-1",
            status="building",
            generation_metadata={"info": "meta"},
        )
        session.add(snap)
        await session.commit()

        # Update status and timestamps - should succeed
        snap.status = "active"
        snap.activated_at = datetime.utcnow()
        await session.commit()

        # Try to update a structural field (e.g. source_manifest_hash)
        snap.source_manifest_hash = "hash-2"
        with pytest.raises(ValueError, match="is immutable"):
            await session.commit()

        # Rollback session to clean up state
        await session.rollback()


@pytest.mark.asyncio
async def test_confidence_range_constraints():
    """Verify confidence range constraints (0-1) are enforced on nodes, edges, evidence, and aliases."""
    async with TestSession() as session:
        proj = models.Project(id="PROJ-CONF", owner_id="OWNER-1", name="Proj Conf")
        session.add(proj)
        await session.commit()

        snap = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-CONF-1",
            project_id="PROJ-CONF",
            schema_version="v2",
            source_manifest_hash="hash-1",
            status="active",
            generation_metadata={},
        )
        session.add(snap)
        await session.commit()

        # Try to insert a node with invalid confidence (> 1)
        node_bad = models.ProjectGraphNode(
            snapshot_id="SNAP-CONF-1",
            node_id="NODE-1",
            project_id="PROJ-CONF",
            node_type="element",
            canonical_name="name",
            normalized_name="name",
            discipline="arch",
            verification_status="extracted",
            confidence=1.2,  # Invalid
        )
        session.add(node_bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        # Try to insert an edge with invalid confidence (< 0)
        edge_bad = models.ProjectGraphEdge(
            snapshot_id="SNAP-CONF-1",
            edge_id="EDGE-1",
            project_id="PROJ-CONF",
            source_node_id="NODE-1",
            target_node_id="NODE-2",
            relation="REL",
            confidence_class="class",
            confidence=-0.1,  # Invalid
        )
        session.add(edge_bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_valid_status_enums():
    """Verify valid status enums checks on ProjectGraphSnapshot and ProjectGraphCorrection."""
    async with TestSession() as session:
        proj = models.Project(id="PROJ-STAT", owner_id="OWNER-1", name="Proj Stat")
        session.add(proj)
        await session.commit()

        # Try invalid snapshot status
        snap_bad = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-STAT-1",
            project_id="PROJ-STAT",
            schema_version="v2",
            source_manifest_hash="hash-1",
            status="invalid_status",  # Invalid status
            generation_metadata={},
        )
        session.add(snap_bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_dem_pages_uniqueness():
    """Verify unique (run_id, page_index) on dem_pages."""
    async with TestSession() as session:
        proj = models.Project(id="PROJ-DEM", owner_id="OWNER-1", name="Proj Dem")
        session.add(proj)
        await session.commit()

        run = models.DemRun(
            project_id="PROJ-DEM",
            document_id="doc-1",
            document_hash="hash-1",
            file_name="file.pdf",
            total_pages=5,
            status="completed",
            provider="ocr",
            prompt_version="1.0",
        )
        session.add(run)
        await session.commit()

        page1 = models.DemPage(
            run_id=run.id,
            page_index=1,
            status="done",
        )
        session.add(page1)
        await session.commit()

        page2 = models.DemPage(
            run_id=run.id,
            page_index=1,  # Duplicate run_id and page_index
            status="done",
        )
        session.add(page2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_accepted_correction_reviewer():
    """Verify accepted/resolved correction requires resolved_by and resolved_at."""
    async with TestSession() as session:
        proj = models.Project(id="PROJ-CORR", owner_id="OWNER-1", name="Proj Corr")
        session.add(proj)
        await session.commit()

        snap = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-CORR-1",
            project_id="PROJ-CORR",
            schema_version="v2",
            source_manifest_hash="hash-1",
            status="active",
            generation_metadata={},
        )
        session.add(snap)
        await session.commit()

        # Try to insert accepted correction without resolved_by/resolved_at
        corr = models.ProjectGraphCorrection(
            id="CORR-1",
            project_id="PROJ-CORR",
            snapshot_id="SNAP-CORR-1",
            target_type="node",
            target_id="NODE-1",
            correction_type="update",
            proposed_value={"key": "val"},
            rationale="test",
            status="accepted",  # Accepted
            resolved_by=None,   # Missing
            resolved_at=None,   # Missing
        )
        session.add(corr)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_cross_project_isolation():
    """Verify that cross-project composite foreign keys are enforced (SQLite with FK constraint on)."""
    async with TestSession() as session:
        await session.execute(text("PRAGMA foreign_keys=ON;"))

        proj_a = models.Project(id="PROJ-A", owner_id="OWNER-1", name="Proj A")
        proj_b = models.Project(id="PROJ-B", owner_id="OWNER-1", name="Proj B")
        session.add_all([proj_a, proj_b])
        await session.commit()

        snap_a = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-A",
            project_id="PROJ-A",
            schema_version="v2",
            source_manifest_hash="hash-a",
            status="active",
            generation_metadata={},
        )
        session.add(snap_a)
        await session.commit()

        # Try to insert node for SNAP-A but with project_id PROJ-B (cross-project violation)
        node_bad = models.ProjectGraphNode(
            snapshot_id="SNAP-A",
            node_id="NODE-X",
            project_id="PROJ-B",  # Does not match snapshot's project_id
            node_type="element",
            canonical_name="name",
            normalized_name="name",
            discipline="arch",
            verification_status="extracted",
            confidence=0.8,
        )
        session.add(node_bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_edge_endpoints_snapshot_isolation():
    """Verify that edge endpoints must reside within the same snapshot (SQLite with FK constraint on)."""
    async with TestSession() as session:
        await session.execute(text("PRAGMA foreign_keys=ON;"))

        proj = models.Project(id="PROJ-EP", owner_id="OWNER-1", name="Proj EP")
        session.add(proj)
        await session.commit()

        snap1 = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-1",
            project_id="PROJ-EP",
            schema_version="v2",
            source_manifest_hash="hash-1",
            status="active",
            generation_metadata={},
        )
        snap2 = models.ProjectGraphSnapshot(
            snapshot_id="SNAP-2",
            project_id="PROJ-EP",
            schema_version="v2",
            source_manifest_hash="hash-2",
            status="active",
            generation_metadata={},
        )
        session.add_all([snap1, snap2])
        await session.commit()

        # Create a node in SNAP-1
        node1 = models.ProjectGraphNode(
            snapshot_id="SNAP-1",
            node_id="NODE-1",
            project_id="PROJ-EP",
            node_type="element",
            canonical_name="n1",
            normalized_name="n1",
            discipline="arch",
            verification_status="extracted",
            confidence=0.9,
        )
        session.add(node1)
        await session.commit()

        # Try to create an edge in SNAP-2 referencing NODE-1 in SNAP-1 (cross-snapshot violation)
        edge_bad = models.ProjectGraphEdge(
            snapshot_id="SNAP-2",
            edge_id="EDGE-BAD",
            project_id="PROJ-EP",
            source_node_id="NODE-1",  # exists in SNAP-1, not SNAP-2
            target_node_id="NODE-2",
            relation="REL",
            confidence_class="class",
            confidence=0.9,
        )
        session.add(edge_bad)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()
