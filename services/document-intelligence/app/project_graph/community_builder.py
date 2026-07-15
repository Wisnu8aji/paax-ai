"""Deterministic, audit-friendly community views for project graph synthesis."""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Sequence

from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode


@dataclass(frozen=True)
class GraphCommunity:
    """A connected graph community with stable identifiers and display metadata."""

    community_id: str
    label: str
    node_ids: tuple[str, ...]
    edge_ids: tuple[str, ...]


def build_graph_communities(
    nodes: Sequence[ProjectGraphNode], edges: Sequence[ProjectGraphEdge]
) -> tuple[GraphCommunity, ...]:
    """Build input-order-independent connected components without mutating inputs.

    Edges with endpoints absent from ``nodes`` are deliberately ignored here; the
    project-graph validator reports those structural errors before synthesis uses
    the communities.
    """
    nodes_by_id = {node.node_id: node for node in nodes}
    adjacency = {node_id: set() for node_id in nodes_by_id}
    graph_edges = tuple(
        sorted(
            (edge for edge in edges if edge.source in nodes_by_id and edge.target in nodes_by_id),
            key=lambda edge: (edge.edge_id, edge.source, edge.target, edge.relation),
        )
    )
    for edge in graph_edges:
        adjacency[edge.source].add(edge.target)
        adjacency[edge.target].add(edge.source)

    remaining = set(nodes_by_id)
    communities: list[GraphCommunity] = []
    while remaining:
        start = min(remaining)
        component_ids = {start}
        pending = [start]
        remaining.remove(start)

        while pending:
            node_id = pending.pop()
            for neighbor_id in sorted(adjacency[node_id]):
                if neighbor_id not in remaining:
                    continue
                remaining.remove(neighbor_id)
                component_ids.add(neighbor_id)
                pending.append(neighbor_id)

        node_ids = tuple(sorted(component_ids))
        component_edges = tuple(
            edge for edge in graph_edges if edge.source in component_ids and edge.target in component_ids
        )
        edge_ids = tuple(edge.edge_id for edge in component_edges)
        identity_material = "|".join(
            [
                *(f"node:{node_id}" for node_id in node_ids),
                *(
                    f"edge:{edge.edge_id}:{edge.source}:{edge.relation}:{edge.target}"
                    for edge in component_edges
                ),
            ]
        )
        primary_node = nodes_by_id[node_ids[0]]
        communities.append(
            GraphCommunity(
                community_id=f"community-{sha256(identity_material.encode('utf-8')).hexdigest()[:16]}",
                label=f"{primary_node.type}: {primary_node.canonical_name}",
                node_ids=node_ids,
                edge_ids=edge_ids,
            )
        )

    return tuple(sorted(communities, key=lambda community: (community.label, community.community_id)))
