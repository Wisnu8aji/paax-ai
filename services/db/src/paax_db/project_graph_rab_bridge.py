"""Safe PCKM-to-RAB handoff: evidence-backed inputs only, never calculations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ProjectGraphNode, ProjectGraphNodeEvidence
from .project_graph_repository import get_active_snapshot


@dataclass
class RabBridgeProposal:
    status: str
    snapshot_id: str | None
    items: list[dict[str, Any]]


async def build_rab_bridge_proposal(
    session: AsyncSession, *, project_id: str, node_ids: Sequence[str]
) -> RabBridgeProposal:
    """Prepare evidence-backed candidates for a human-approved Core Engine request."""
    snapshot = await get_active_snapshot(session, project_id)
    if snapshot is None:
        return RabBridgeProposal("graph_not_ready", None, [])
    nodes = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id,
        ProjectGraphNode.snapshot_id == snapshot.snapshot_id,
        ProjectGraphNode.node_id.in_(list(node_ids)),
    ))).scalars().all()
    evidence_rows = (await session.execute(select(ProjectGraphNodeEvidence).where(
        ProjectGraphNodeEvidence.snapshot_id == snapshot.snapshot_id,
        ProjectGraphNodeEvidence.node_id.in_([node.node_id for node in nodes]),
    ))).scalars().all()
    evidence_by_node: dict[str, list[str]] = {}
    for row in evidence_rows:
        evidence_by_node.setdefault(row.node_id, []).append(row.evidence_id)
    return RabBridgeProposal("requires_human_approval", snapshot.snapshot_id, [
        {"node_id": node.node_id, "name": node.canonical_name, "discipline": node.discipline,
         "properties": node.properties_json, "evidence_ids": evidence_by_node.get(node.node_id, [])}
        for node in nodes
    ])
