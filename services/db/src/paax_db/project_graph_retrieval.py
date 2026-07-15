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


def _normalize(value: str) -> str:
    return " ".join(value.lower().split())


def _seed_score(query: str, name: str, search_text: str, is_alias: bool) -> int:
    normalized_name = _normalize(name)
    if is_alias:
        return 120
    if normalized_name == query:
        return 100
    if normalized_name.startswith(query):
        return 80
    if query in normalized_name or query in _normalize(search_text):
        return 60
    query_terms = set(query.split())
    return 10 * len(query_terms & set(_normalize(name + " " + search_text).split()))


async def build_project_vocabulary(
    session: AsyncSession, *, project_id: str, snapshot_id: str
) -> set[str]:
    names = (await session.execute(select(ProjectGraphNode.normalized_name).where(
        ProjectGraphNode.project_id == project_id, ProjectGraphNode.snapshot_id == snapshot_id,
    ))).scalars().all()
    aliases = (await session.execute(select(ProjectGraphAlias.alias_normalized).where(
        ProjectGraphAlias.project_id == project_id, ProjectGraphAlias.snapshot_id == snapshot_id,
    ))).scalars().all()
    return {value for value in {*names, *aliases} if value}


async def retrieve_project_graph(
    session: AsyncSession, *, project_id: str, query: str, depth: int = 2,
    budget_tokens: int = 1400, relations: set[str] | None = None,
    traversal_mode: str = "bfs", target_node_id: str | None = None,
) -> GraphRetrievalResult:
    """Return a bounded, evidence-backed subgraph; never calculate or cross tenants."""
    snapshot = await get_active_snapshot(session, project_id)
    if snapshot is None:
        return GraphRetrievalResult(status="not_ready")
    query_normalized = _normalize(query)
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
    alias_ids = set(aliases)
    by_id = {item.node_id: item for item in candidates}
    for node_id in aliases:
        node = await session.get(ProjectGraphNode, {"snapshot_id": snapshot.snapshot_id, "node_id": node_id})
        if node is not None:
            by_id[node.node_id] = node
    vocabulary = await build_project_vocabulary(session, project_id=project_id, snapshot_id=snapshot.snapshot_id)
    ordered_seeds = sorted(
        by_id.values(),
        key=lambda node: (-_seed_score(query_normalized, node.canonical_name, node.search_text, node.node_id in alias_ids), node.node_id),
    )
    by_id = {node.node_id: node for node in ordered_seeds}
    if traversal_mode not in {"bfs", "dfs", "shortest_path", "direct_lookup"}:
        raise ValueError("unsupported traversal mode")
    edge_query = select(ProjectGraphEdge).where(
        ProjectGraphEdge.project_id == project_id,
        ProjectGraphEdge.snapshot_id == snapshot.snapshot_id,
    )
    if relations:
        edge_query = edge_query.where(ProjectGraphEdge.relation.in_(relations))
    graph_edges = (await session.execute(edge_query)).scalars().all()
    adjacency: dict[str, list[tuple[str, ProjectGraphEdge]]] = {}
    for edge in graph_edges:
        adjacency.setdefault(edge.source_node_id, []).append((edge.target_node_id, edge))
        adjacency.setdefault(edge.target_node_id, []).append((edge.source_node_id, edge))
    seed_ids = list(by_id)
    visited = set(seed_ids)
    edges: list[ProjectGraphEdge] = []
    if traversal_mode == "shortest_path" and seed_ids and target_node_id:
        queue = [seed_ids[0]]
        parents: dict[str, tuple[str, ProjectGraphEdge]] = {}
        while queue and target_node_id not in parents:
            current = queue.pop(0)
            for neighbor, edge in adjacency.get(current, []):
                if neighbor in parents or neighbor == seed_ids[0]:
                    continue
                parents[neighbor] = (current, edge)
                queue.append(neighbor)
        if target_node_id in parents:
            current = target_node_id
            visited = {current}
            while current != seed_ids[0]:
                parent, edge = parents[current]
                visited.add(parent)
                edges.append(edge)
                current = parent
            edges.reverse()
    elif traversal_mode != "direct_lookup":
        frontier = list(seed_ids)
        for _ in range(max(0, depth)):
            next_frontier: list[str] = []
            while frontier:
                current = frontier.pop() if traversal_mode == "dfs" else frontier.pop(0)
                for neighbor, edge in adjacency.get(current, []):
                    if neighbor in visited:
                        continue
                    visited.add(neighbor)
                    edges.append(edge)
                    next_frontier.append(neighbor)
            frontier = next_frontier
    if visited - set(by_id):
        expanded = (await session.execute(select(ProjectGraphNode).where(
            ProjectGraphNode.project_id == project_id, ProjectGraphNode.snapshot_id == snapshot.snapshot_id,
            ProjectGraphNode.node_id.in_(visited - set(by_id)),
        ))).scalars().all()
        by_id.update({item.node_id: item for item in expanded})
    nodes = [by_id[node_id] for node_id in sorted(visited) if node_id in by_id]
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
        user_query=query, query_plan={"intent": "DIRECT_FACT" if len(query_normalized.split()) <= 2 else "LIST_FILTER", "depth": depth, "relations": sorted(relations or []), "traversal_mode": traversal_mode, "target_node_id": target_node_id, "vocabulary_match": query_normalized in vocabulary},
        selected_seed_ids=list(by_id), traversed_node_ids=[item.node_id for item in nodes],
        traversed_edge_ids=[item.edge_id for item in edges], context_token_estimate=token_estimate, outcome="success"))
    await session.flush()
    return GraphRetrievalResult("success", snapshot.snapshot_id, nodes, edges, evidence, token_estimate)
