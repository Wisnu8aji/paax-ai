"""Immutable, project-scoped persistence for PCKM graph snapshots."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    ProjectGraphAlias,
    ProjectGraphCommunity,
    ProjectGraphEdge,
    ProjectGraphEdgeEvidence,
    ProjectGraphEvidence,
    ProjectGraphNode,
    ProjectGraphNodeEvidence,
    ProjectGraphSnapshot,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@asynccontextmanager
async def _transaction(session: AsyncSession, enabled: bool):
    if enabled:
        async with session.begin():
            yield
    else:
        yield


def _add_graph_records(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    evidence: Sequence[Mapping[str, Any]],
    node_evidence: Sequence[Mapping[str, Any]],
    edge_evidence: Sequence[Mapping[str, Any]],
    aliases: Sequence[Mapping[str, Any]],
    communities: Sequence[Mapping[str, Any]],
) -> None:
    session.add_all([
        ProjectGraphNode(
            snapshot_id=snapshot_id, project_id=project_id, node_id=item["node_id"],
            node_type=item["node_type"], canonical_name=item["canonical_name"],
            normalized_name=item["normalized_name"], discipline=item["discipline"],
            level_id=item.get("level_id"), verification_status=item["verification_status"],
            confidence=item["confidence"], properties_json=dict(item.get("properties", {})),
            search_text=item.get("search_text", ""),
        )
        for item in nodes
    ])
    session.add_all([
        ProjectGraphEdge(
            snapshot_id=snapshot_id, project_id=project_id, edge_id=item["edge_id"],
            source_node_id=item["source_node_id"], target_node_id=item["target_node_id"],
            relation=item["relation"], confidence_class=item["confidence_class"],
            confidence=item["confidence"], properties_json=dict(item.get("properties", {})),
        )
        for item in edges
    ])
    session.add_all([
        ProjectGraphEvidence(
            snapshot_id=snapshot_id, project_id=project_id, evidence_id=item["evidence_id"],
            document_id=item["document_id"], page_index=item["page_index"],
            sheet_id=item["sheet_id"], kind=item["kind"], raw_text=item["raw_text"],
            bbox_json=item.get("bbox"), source_dem_id=item.get("source_dem_id"),
        )
        for item in evidence
    ])
    session.add_all([
        ProjectGraphNodeEvidence(
            snapshot_id=snapshot_id, node_id=item["node_id"],
            evidence_id=item["evidence_id"], role=item["role"],
        )
        for item in node_evidence
    ])
    session.add_all([
        ProjectGraphEdgeEvidence(
            snapshot_id=snapshot_id, edge_id=item["edge_id"],
            evidence_id=item["evidence_id"], role=item["role"],
        )
        for item in edge_evidence
    ])
    session.add_all([
        ProjectGraphAlias(
            snapshot_id=snapshot_id, project_id=project_id,
            alias_normalized=item["alias_normalized"], alias_raw=item["alias_raw"],
            node_id=item["node_id"], alias_type=item["alias_type"], confidence=item["confidence"],
        )
        for item in aliases
    ])
    session.add_all([
        ProjectGraphCommunity(
            snapshot_id=snapshot_id, community_id=item["community_id"],
            community_type=item["community_type"], name=item["name"],
            summary=item.get("summary", ""), member_count=item["member_count"],
        )
        for item in communities
    ])


async def activate_snapshot(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    schema_version: str,
    source_manifest_hash: str,
    generation_metadata: Mapping[str, Any],
) -> ProjectGraphSnapshot:
    """Activate an already complete lightweight snapshot for compatibility."""
    return await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version=schema_version,
        source_manifest_hash=source_manifest_hash,
        generation_metadata=generation_metadata,
        nodes=[], edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
    )


async def get_active_snapshot(session: AsyncSession, project_id: str) -> ProjectGraphSnapshot | None:
    result = await session.execute(select(ProjectGraphSnapshot).where(
        ProjectGraphSnapshot.project_id == project_id,
        ProjectGraphSnapshot.status == "active",
    ))
    return result.scalars().one_or_none()


async def persist_snapshot_graph(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    evidence: Sequence[Mapping[str, Any]],
    node_evidence: Sequence[Mapping[str, Any]],
    edge_evidence: Sequence[Mapping[str, Any]],
    aliases: Sequence[Mapping[str, Any]],
    communities: Sequence[Mapping[str, Any]],
    transaction: bool = True,
) -> None:
    """Persist records only for a snapshot that belongs to the requested project."""
    async with _transaction(session, transaction):
        snapshot = await session.get(ProjectGraphSnapshot, snapshot_id, with_for_update=True)
        if snapshot is None or snapshot.project_id != project_id:
            raise ValueError("snapshot does not belong to project")
        if snapshot.status not in {"building", "active"}:
            raise ValueError("snapshot is not available for graph persistence")
        _add_graph_records(
            session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes, edges=edges,
            evidence=evidence, node_evidence=node_evidence, edge_evidence=edge_evidence,
            aliases=aliases, communities=communities,
        )


async def build_and_activate_snapshot(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    schema_version: str,
    source_manifest_hash: str,
    generation_metadata: Mapping[str, Any],
    nodes: Sequence[Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    evidence: Sequence[Mapping[str, Any]],
    node_evidence: Sequence[Mapping[str, Any]],
    edge_evidence: Sequence[Mapping[str, Any]],
    aliases: Sequence[Mapping[str, Any]],
    communities: Sequence[Mapping[str, Any]],
) -> ProjectGraphSnapshot:
    """Write a complete graph then atomically switch the project's active snapshot."""
    now = _utc_now()
    async with _transaction(session, not session.in_transaction()):
        snapshot = ProjectGraphSnapshot(
            snapshot_id=snapshot_id, project_id=project_id, schema_version=schema_version,
            source_manifest_hash=source_manifest_hash, status="building",
            generation_metadata=dict(generation_metadata),
        )
        session.add(snapshot)
        await session.flush()
        _add_graph_records(
            session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes, edges=edges,
            evidence=evidence, node_evidence=node_evidence, edge_evidence=edge_evidence,
            aliases=aliases, communities=communities,
        )
        active_snapshots = (await session.execute(
            select(ProjectGraphSnapshot).where(
                ProjectGraphSnapshot.project_id == project_id,
                ProjectGraphSnapshot.status == "active",
            ).with_for_update()
        )).scalars().all()
        for active_snapshot in active_snapshots:
            active_snapshot.status = "superseded"
            active_snapshot.superseded_at = now
        snapshot.status = "active"
        snapshot.activated_at = now
    return snapshot
