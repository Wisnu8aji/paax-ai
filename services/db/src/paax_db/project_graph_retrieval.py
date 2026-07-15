"""Deterministic, project-scoped retrieval over immutable PCKM snapshots."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    ProjectGraphAlias, ProjectGraphEdge, ProjectGraphEvidence, ProjectGraphNode,
    ProjectGraphNodeEvidence, ProjectGraphQueryLog,
)
from .project_graph_repository import get_active_snapshot


@dataclass
class GraphRetrievalResult:
    status: str
    snapshot_id: str | None = None
    nodes: list[ProjectGraphNode] = field(default_factory=list)
    edges: list[ProjectGraphEdge] = field(default_factory=list)
    evidence: list[ProjectGraphEvidence] = field(default_factory=list)
    context_token_estimate: int = 0


def _tokens(values: Iterable[str]) -> int:
    return sum((len(value) + 3) // 4 for value in values)


async def retrieve_project_graph(
    session: AsyncSession, *, project_id: str, query: str, depth: int = 2,
    budget_tokens: int = 1400, relations: set[str] | None = None,
) -> GraphRetrievalResult:
    """Return a bounded, evidence-backed subgraph; never calculate or cross tenants."""
    snapshot = await get_active_snapshot(session, project_id)
    if snapshot is None:
        return GraphRetrievalResult(status="not_ready")
    query_normalized = " ".join(query.lower().split())
    aliases = (await session.execute(select(ProjectGraphAlias.node_id).where(
        ProjectGraphAlias.project_id == project_id,
        ProjectGraphAlias.snapshot_id == snapshot.snapshot_id,
        ProjectGraphAlias.alias_normalized == query_normalized,
    ))).scalars().all()
    candidates = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id,
        ProjectGraphNode.snapshot_id == snapshot.snapshot_id,
        or_(ProjectGraphNode.normalized_name.contains(query_normalized), ProjectGraphNode.search_text.contains(query_normalized)),
    ))).scalars().all()
    by_id = {item.node_id: item for item in candidates}
    for node_id in aliases:
        node = await session.get(ProjectGraphNode, {"snapshot_id": snapshot.snapshot_id, "node_id": node_id})
        if node is not None:
            by_id[node.node_id] = node
    nodes = list(by_id.values())
    frontier = set(by_id)
    edges: list[ProjectGraphEdge] = []
    for _ in range(max(0, depth)):
        if not frontier:
            break
        edge_query = select(ProjectGraphEdge).where(
            ProjectGraphEdge.project_id == project_id,
            ProjectGraphEdge.snapshot_id == snapshot.snapshot_id,
            or_(ProjectGraphEdge.source_node_id.in_(frontier), ProjectGraphEdge.target_node_id.in_(frontier)),
        )
        if relations:
            edge_query = edge_query.where(ProjectGraphEdge.relation.in_(relations))
        found = (await session.execute(edge_query)).scalars().all()
        edges.extend(item for item in found if item.edge_id not in {edge.edge_id for edge in edges})
        adjacent = {identifier for edge in found for identifier in (edge.source_node_id, edge.target_node_id)} - set(by_id)
        if adjacent:
            expanded = (await session.execute(select(ProjectGraphNode).where(
                ProjectGraphNode.project_id == project_id, ProjectGraphNode.snapshot_id == snapshot.snapshot_id,
                ProjectGraphNode.node_id.in_(adjacent),
            ))).scalars().all()
            by_id.update({item.node_id: item for item in expanded})
        frontier = adjacent
    nodes = list(by_id.values())
    evidence = (await session.execute(select(ProjectGraphEvidence).join(
        ProjectGraphNodeEvidence,
        (ProjectGraphEvidence.snapshot_id == ProjectGraphNodeEvidence.snapshot_id) &
        (ProjectGraphEvidence.evidence_id == ProjectGraphNodeEvidence.evidence_id),
    ).where(ProjectGraphEvidence.project_id == project_id, ProjectGraphEvidence.snapshot_id == snapshot.snapshot_id,
            ProjectGraphNodeEvidence.node_id.in_([node.node_id for node in nodes])))).scalars().unique().all() if nodes else []
    token_estimate = _tokens([node.canonical_name + " " + node.search_text for node in nodes] + [item.raw_text for item in evidence])
    while nodes and token_estimate > budget_tokens:
        nodes.pop()
        permitted = {item.node_id for item in nodes}
        edges = [item for item in edges if item.source_node_id in permitted or item.target_node_id in permitted]
        evidence = [item for item in evidence if item.evidence_id in {row.evidence_id for row in await session.execute(select(ProjectGraphNodeEvidence).where(ProjectGraphNodeEvidence.snapshot_id == snapshot.snapshot_id, ProjectGraphNodeEvidence.node_id.in_(permitted)))}]
        token_estimate = _tokens([node.canonical_name + " " + node.search_text for node in nodes] + [item.raw_text for item in evidence])
    session.add(ProjectGraphQueryLog(id=uuid.uuid4(), project_id=project_id, snapshot_id=snapshot.snapshot_id,
        user_query=query, query_plan={"depth": depth, "relations": sorted(relations or [])},
        selected_seed_ids=list(by_id), traversed_node_ids=[item.node_id for item in nodes],
        traversed_edge_ids=[item.edge_id for item in edges], context_token_estimate=token_estimate, outcome="success"))
    await session.flush()
    return GraphRetrievalResult("success", snapshot.snapshot_id, nodes, edges, evidence, token_estimate)
