"""Immutable, project-scoped persistence for PCKM graph snapshots."""
from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from sqlalchemy import delete, select
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
    ProjectGraphSummaryView,
    ProjectGraphCorrection,
    ProjectGraphRetrievalCache,
    DocumentRevision,
    SheetRevision,
)
import uuid


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class IncrementalResynthesisPlan:
    """Dependency scope for a page revision; immutable snapshot records stay auditable."""

    project_id: str
    snapshot_id: str
    evidence_ids: tuple[str, ...]
    node_ids: tuple[str, ...]
    edge_ids: tuple[str, ...]
    summary_level_ids: tuple[str, ...]
    correction_ids: tuple[str, ...]
    invalidated_cache_entries: int


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
            revision_id=item.get("revision_id"),
            run_id=item.get("run_id"),
            dem_page_id=item.get("dem_page_id"),
            view_id=item.get("view_id"),
            zone_id=item.get("zone_id"),
            modality=item.get("modality"),
            raw_content=item.get("raw_content"),
            normalized_content=item.get("normalized_content"),
            bbox_source=item.get("bbox_source"),
            bbox_normalized=item.get("bbox_normalized"),
            polygon_source=item.get("polygon_source"),
            polygon_normalized=item.get("polygon_normalized"),
            confidence=item.get("confidence"),
            extractor=item.get("extractor"),
            artifact_hash=item.get("artifact_hash"),
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


def persist_summary_views(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    views: Sequence[Mapping[str, Any] | Any],
) -> None:
    """Persist ProjectGraphSummaryView records for a snapshot."""
    records = []
    for item in views:
        if hasattr(item, "model_dump"):
            d = item.model_dump()
        elif hasattr(item, "dict"):
            d = item.dict()
        else:
            d = dict(item)

        grain = d.get("grain", {})
        if hasattr(grain, "model_dump"):
            grain_dict = grain.model_dump()
        elif hasattr(grain, "dict"):
            grain_dict = grain.dict()
        else:
            grain_dict = dict(grain) if grain else {}

        view_kind = d.get("view_kind", "LEVEL_OVERVIEW")
        level_id = grain_dict.get("level_id")
        
        view_id = d.get("view_id") or f"{snapshot_id}:{view_kind}:{level_id or 'global'}"

        records.append(
            ProjectGraphSummaryView(
                snapshot_id=snapshot_id,
                project_id=project_id,
                view_id=view_id,
                view_kind=view_kind,
                level_id=level_id,
                payload=d,
            )
        )
    session.add_all(records)



async def activate_snapshot(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    schema_version: str,
    source_manifest_hash: str,
    generation_metadata: Mapping[str, Any],
    effective_sheet_revision_ids: Sequence[str] = (),
) -> ProjectGraphSnapshot:
    """Activate an already complete lightweight snapshot for compatibility."""
    return await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version=schema_version,
        source_manifest_hash=source_manifest_hash,
        generation_metadata=generation_metadata,
        effective_sheet_revision_ids=effective_sheet_revision_ids,
        nodes=[], edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
    )


async def get_active_snapshot(session: AsyncSession, project_id: str) -> ProjectGraphSnapshot | None:
    result = await session.execute(select(ProjectGraphSnapshot).where(
        ProjectGraphSnapshot.project_id == project_id,
        ProjectGraphSnapshot.status == "active",
    ))
    snapshot = result.scalars().one_or_none()
    if snapshot is None:
        return None
    effective_revision_ids = tuple((await session.execute(
        select(SheetRevision.revision_id).where(
            SheetRevision.project_id == project_id,
            SheetRevision.is_active.is_(True),
        ).order_by(SheetRevision.revision_id)
    )).scalars().all())
    if not effective_revision_ids:
        return snapshot
    snapshot_revision_ids = tuple(sorted(snapshot.effective_sheet_revision_ids or ()))
    return snapshot if snapshot_revision_ids == effective_revision_ids else None


async def activate_document_revision(
    session: AsyncSession, *, project_id: str, revision_id: str,
) -> DocumentRevision:
    """Make a document revision effective and retain its predecessor for audit."""
    now = _utc_now()
    async with _transaction(session, not session.in_transaction()):
        revision = (await session.execute(select(DocumentRevision).where(
            DocumentRevision.project_id == project_id,
            DocumentRevision.revision_id == revision_id,
        ).with_for_update())).scalars().one_or_none()
        if revision is None:
            raise ValueError("document revision does not belong to project")
        current = (await session.execute(select(DocumentRevision).where(
            DocumentRevision.project_id == project_id,
            DocumentRevision.document_id == revision.document_id,
            DocumentRevision.is_active.is_(True),
            DocumentRevision.revision_id != revision.revision_id,
        ).with_for_update())).scalars().all()
        predecessor_id = revision.supersedes_revision_id or (current[0].revision_id if current else None)
        for predecessor in current:
            predecessor.is_active = False
            predecessor.status = "superseded"
            predecessor.superseded_by_revision_id = revision.revision_id
        if predecessor_id:
            predecessor = await session.get(DocumentRevision, predecessor_id)
            if predecessor is None or predecessor.project_id != project_id or predecessor.document_id != revision.document_id:
                raise ValueError("document revision supersedes an unrelated revision")
            revision.supersedes_revision_id = predecessor_id
            predecessor.is_active = False
            predecessor.status = "superseded"
            predecessor.superseded_by_revision_id = revision.revision_id
        revision.status = "effective"
        revision.is_active = True
        revision.effective_date = revision.effective_date or now
    return revision


async def activate_sheet_revision(
    session: AsyncSession, *, project_id: str, revision_id: str,
) -> SheetRevision:
    """Make one sheet revision effective while preserving its superseded lineage."""
    now = _utc_now()
    async with _transaction(session, not session.in_transaction()):
        revision = (await session.execute(select(SheetRevision).where(
            SheetRevision.project_id == project_id,
            SheetRevision.revision_id == revision_id,
        ).with_for_update())).scalars().one_or_none()
        if revision is None:
            raise ValueError("sheet revision does not belong to project")
        document_revision = await session.get(DocumentRevision, revision.document_revision_id)
        if document_revision is None or document_revision.project_id != project_id or not document_revision.is_active:
            raise ValueError("sheet revision requires an effective document revision")
        current = (await session.execute(select(SheetRevision).where(
            SheetRevision.project_id == project_id,
            SheetRevision.document_id == revision.document_id,
            SheetRevision.sheet_id == revision.sheet_id,
            SheetRevision.is_active.is_(True),
            SheetRevision.revision_id != revision.revision_id,
        ).with_for_update())).scalars().all()
        predecessor_id = revision.supersedes_revision_id or (current[0].revision_id if current else None)
        for predecessor in current:
            predecessor.is_active = False
            predecessor.status = "superseded"
            predecessor.superseded_by_revision_id = revision.revision_id
        if predecessor_id:
            predecessor = await session.get(SheetRevision, predecessor_id)
            if (
                predecessor is None or predecessor.project_id != project_id
                or predecessor.document_id != revision.document_id or predecessor.sheet_id != revision.sheet_id
            ):
                raise ValueError("sheet revision supersedes an unrelated revision")
            revision.supersedes_revision_id = predecessor_id
            predecessor.is_active = False
            predecessor.status = "superseded"
            predecessor.superseded_by_revision_id = revision.revision_id
        revision.status = "effective"
        revision.is_active = True
        revision.effective_date = revision.effective_date or now
    return revision


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
    summary_views: Sequence[Mapping[str, Any]] = (),
    effective_sheet_revision_ids: Sequence[str] = (),
) -> ProjectGraphSnapshot:
    """Write a complete graph then atomically switch the project's active snapshot."""
    now = _utc_now()
    async with _transaction(session, not session.in_transaction()):
        effective_revision_ids = tuple((await session.execute(
            select(SheetRevision.revision_id).where(
                SheetRevision.project_id == project_id,
                SheetRevision.is_active.is_(True),
            ).order_by(SheetRevision.revision_id)
        )).scalars().all())
        requested_revision_ids = tuple(sorted(set(effective_sheet_revision_ids)))
        if effective_revision_ids and requested_revision_ids != effective_revision_ids:
            raise ValueError("snapshot must declare exactly the project's effective sheet revisions")
        if requested_revision_ids:
            missing_lineage = [item["evidence_id"] for item in evidence if not item.get("revision_id")]
            foreign_lineage = [item["evidence_id"] for item in evidence if item.get("revision_id") not in requested_revision_ids]
            if missing_lineage or foreign_lineage:
                raise ValueError("revision-scoped snapshot contains evidence outside its effective sheet revisions")
        snapshot = ProjectGraphSnapshot(
            snapshot_id=snapshot_id, project_id=project_id, schema_version=schema_version,
            source_manifest_hash=source_manifest_hash, status="building",
            generation_metadata=dict(generation_metadata),
            effective_sheet_revision_ids=list(requested_revision_ids),
        )
        session.add(snapshot)
        await session.flush()
        _add_graph_records(
            session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes, edges=edges,
            evidence=evidence, node_evidence=node_evidence, edge_evidence=edge_evidence,
            aliases=aliases, communities=communities,
        )
        persist_summary_views(
            session, project_id=project_id, snapshot_id=snapshot_id, views=summary_views
        )
        previous_active = (await session.execute(select(ProjectGraphSnapshot).where(
            ProjectGraphSnapshot.project_id == project_id,
            ProjectGraphSnapshot.status == "active",
        ).with_for_update())).scalars().first()
        if previous_active is not None:
            accepted = (await session.execute(select(ProjectGraphCorrection).where(
                ProjectGraphCorrection.project_id == project_id,
                ProjectGraphCorrection.snapshot_id == previous_active.snapshot_id,
                ProjectGraphCorrection.status == "accepted",
            ))).scalars().all()
            new_node_ids = {item["node_id"] for item in nodes}
            new_edge_ids = {item["edge_id"] for item in edges}
            for correction in accepted:
                target_exists = correction.target_id in (new_node_ids if correction.target_type == "node" else new_edge_ids)
                session.add(ProjectGraphCorrection(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    snapshot_id=snapshot_id,
                    target_type=correction.target_type,
                    target_id=correction.target_id,
                    correction_type=correction.correction_type,
                    proposed_value=correction.proposed_value,
                    rationale=correction.rationale,
                    status="accepted" if target_exists else "stale",
                    resolution_note=None if target_exists else "Target tidak ditemukan pada snapshot baru; perlu review ulang.",
                    created_by=correction.created_by,
                    resolved_by=correction.resolved_by,
                    carried_from=correction.id,
                ))
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


async def plan_incremental_resynthesis(
    session: AsyncSession,
    *,
    project_id: str,
    snapshot_id: str,
    document_id: str,
    sheet_id: str,
    page_index: int,
    revision_id: str,
) -> IncrementalResynthesisPlan:
    """Return the page-local dependency closure and discard only its snapshot cache.

    Snapshot evidence is immutable. The caller rebuilds this returned scope into a
    new revision-scoped snapshot; historical evidence and summary rows remain
    available for audit until their snapshot is superseded.
    """
    snapshot = await session.get(ProjectGraphSnapshot, snapshot_id)
    if snapshot is None or snapshot.project_id != project_id:
        raise ValueError("snapshot does not belong to project")
    evidence_ids = tuple(sorted((await session.execute(select(ProjectGraphEvidence.evidence_id).where(
        ProjectGraphEvidence.project_id == project_id,
        ProjectGraphEvidence.snapshot_id == snapshot_id,
        ProjectGraphEvidence.document_id == document_id,
        ProjectGraphEvidence.sheet_id == sheet_id,
        ProjectGraphEvidence.page_index == page_index,
        ProjectGraphEvidence.revision_id == revision_id,
    ))).scalars().all()))
    if evidence_ids:
        node_ids = set((await session.execute(select(ProjectGraphNodeEvidence.node_id).where(
            ProjectGraphNodeEvidence.snapshot_id == snapshot_id,
            ProjectGraphNodeEvidence.evidence_id.in_(evidence_ids),
        ))).scalars().all())
        edge_ids = set((await session.execute(select(ProjectGraphEdgeEvidence.edge_id).where(
            ProjectGraphEdgeEvidence.snapshot_id == snapshot_id,
            ProjectGraphEdgeEvidence.evidence_id.in_(evidence_ids),
        ))).scalars().all())
    else:
        node_ids, edge_ids = set(), set()
    if node_ids:
        edge_ids.update((await session.execute(select(ProjectGraphEdge.edge_id).where(
            ProjectGraphEdge.snapshot_id == snapshot_id,
            (ProjectGraphEdge.source_node_id.in_(node_ids)) | (ProjectGraphEdge.target_node_id.in_(node_ids)),
        ))).scalars().all())
        summary_level_ids = tuple(sorted({item for item in (await session.execute(select(ProjectGraphNode.level_id).where(
            ProjectGraphNode.snapshot_id == snapshot_id,
            ProjectGraphNode.node_id.in_(node_ids),
        ))).scalars().all() if item is not None}))
    else:
        summary_level_ids = ()
    target_ids = node_ids | edge_ids
    correction_ids = tuple(sorted((await session.execute(select(ProjectGraphCorrection.id).where(
        ProjectGraphCorrection.project_id == project_id,
        ProjectGraphCorrection.snapshot_id == snapshot_id,
        ProjectGraphCorrection.status == "accepted",
        ProjectGraphCorrection.target_id.in_(target_ids) if target_ids else False,
    ))).scalars().all())) if target_ids else ()
    deleted = await session.execute(delete(ProjectGraphRetrievalCache).where(
        ProjectGraphRetrievalCache.project_id == project_id,
        ProjectGraphRetrievalCache.snapshot_id == snapshot_id,
    ))
    await session.flush()
    return IncrementalResynthesisPlan(
        project_id=project_id,
        snapshot_id=snapshot_id,
        evidence_ids=evidence_ids,
        node_ids=tuple(sorted(node_ids)),
        edge_ids=tuple(sorted(edge_ids)),
        summary_level_ids=summary_level_ids,
        correction_ids=correction_ids,
        invalidated_cache_entries=int(deleted.rowcount or 0),
    )
