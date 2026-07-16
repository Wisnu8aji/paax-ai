"""Deterministic, project-scoped retrieval over immutable PCKM snapshots."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    ProjectGraphAlias, ProjectGraphEdge, ProjectGraphEvidence, ProjectGraphNode,
    ProjectGraphNodeEvidence, ProjectGraphQueryLog, ProjectGraphSummaryView,
)
from .project_graph_repository import get_active_snapshot
from .project_graph_intent import parse_query_plan


@dataclass
class GraphRetrievalResult:
    status: str
    snapshot_id: str | None = None
    nodes: list[ProjectGraphNode] = field(default_factory=list)
    edges: list[ProjectGraphEdge] = field(default_factory=list)
    evidence: list[ProjectGraphEvidence] = field(default_factory=list)
    context_token_estimate: int = 0
    intent: str | None = None
    applied_filters: dict[str, str | None] = field(default_factory=dict)
    data_status: str | None = None
    notes: list[str] = field(default_factory=list)
    summary_view: dict[str, Any] | None = None
    guidance: str | None = None
    rab_bridge_available: bool | None = None
    missing_information: list[str] = field(default_factory=list)


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


async def _exact_level_seeds(
    session: AsyncSession, *, project_id: str, snapshot_id: str, query_normalized: str
) -> list[ProjectGraphNode]:
    """If the query names a level exactly (e.g. "lantai 2"), scope retrieval to
    those level node(s) instead of mixing them with every other node whose
    free-text search_text happens to contain the same words (e.g. a
    "discipline" node, a note, or an unrelated drawing_reference). Exact match
    only -- "lantai 2" must equal a level's canonical_name once normalized,
    not merely appear as a substring, so a phrase like "struktur lantai 2"
    intentionally does NOT trigger this path (that phrase has no node matching
    it; see _seed_score's substring fallback for that case instead).

    Two distinct kinds of "level" node exist in the graph: (a) the raw
    per-page node page_patch.py creates from every "levels" observation
    (id prefix NODE-, one per mentioning page, includes noise like ramp
    levels/roof elevations that share the same normalized text by
    coincidence), and (b) the deduplicated node cross_sheet_resolver.py's
    _level_node() creates (id prefix LEVEL-, one per (project, normalized
    level key)) which is the ONLY kind occurrences actually attach to via a
    LOCATED_ON edge. Real 88-page fixture proof: querying "Lantai 2" finds 8
    same-named level nodes, but only 1 has any LOCATED_ON edge pointing at
    it -- the other 7 are inert page-mention noise that would dilute BFS
    seeding without ever surfacing a real occurrence. So this filters to
    seeds that are an actual LOCATED_ON target, not just anything typed
    "level" with a matching name."""
    level_nodes = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id,
        ProjectGraphNode.snapshot_id == snapshot_id,
        ProjectGraphNode.node_type == "level",
    ))).scalars().all()
    name_matches = [node for node in level_nodes if _normalize(node.canonical_name) == query_normalized]
    if not name_matches:
        return []
    located_on_targets = set((await session.execute(select(ProjectGraphEdge.target_node_id).where(
        ProjectGraphEdge.project_id == project_id,
        ProjectGraphEdge.snapshot_id == snapshot_id,
        ProjectGraphEdge.relation == "LOCATED_ON",
        ProjectGraphEdge.target_node_id.in_([node.node_id for node in name_matches]),
    ))).scalars().all())
    attached = [node for node in name_matches if node.node_id in located_on_targets]
    # Fall back to the unfiltered name matches only if none carry a real
    # occurrence -- an empty result would be strictly worse than surfacing
    # the (inert but honestly labeled) mention nodes for this level name.
    return attached or name_matches


_NUMERIC_RELATIONS = {"INSTANCE_OF", "HAS_DIMENSION", "DEFINED_BY", "LOCATED_ON", "DEPICTED_IN"}
_LEVEL_NODE_TYPES = {"level"}
_PROTECTED_NODE_TYPES = {"dimension", "material", "drawing_reference", "reference", "sheet", "conflict"}


async def _nodes_for_ids(
    session: AsyncSession, *, project_id: str, snapshot_id: str, node_ids: set[str]
) -> dict[str, ProjectGraphNode]:
    if not node_ids:
        return {}
    rows = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id,
        ProjectGraphNode.snapshot_id == snapshot_id,
        ProjectGraphNode.node_id.in_(node_ids),
    ))).scalars().all()
    return {node.node_id: node for node in rows}


async def _evidence_for_nodes(
    session: AsyncSession, *, project_id: str, snapshot_id: str, nodes: list[ProjectGraphNode]
) -> list[ProjectGraphEvidence]:
    if not nodes:
        return []
    return (await session.execute(select(ProjectGraphEvidence).join(
        ProjectGraphNodeEvidence,
        (ProjectGraphEvidence.snapshot_id == ProjectGraphNodeEvidence.snapshot_id) &
        (ProjectGraphEvidence.evidence_id == ProjectGraphNodeEvidence.evidence_id),
    ).where(
        ProjectGraphEvidence.project_id == project_id,
        ProjectGraphEvidence.snapshot_id == snapshot_id,
        ProjectGraphNodeEvidence.node_id.in_([node.node_id for node in nodes]),
    ))).scalars().unique().all()


def _result_token_estimate(
    nodes: list[ProjectGraphNode], evidence: list[ProjectGraphEvidence]
) -> int:
    return _tokens(
        [node.canonical_name + " " + node.search_text for node in nodes]
        + [item.raw_text for item in evidence]
    )


async def _write_query_log(
    session: AsyncSession, *, project_id: str, snapshot_id: str, query: str,
    query_plan: dict[str, Any], seed_ids: list[str], result: GraphRetrievalResult,
) -> None:
    session.add(ProjectGraphQueryLog(
        id=uuid.uuid4(), project_id=project_id, snapshot_id=snapshot_id,
        user_query=query, query_plan=query_plan, selected_seed_ids=seed_ids,
        traversed_node_ids=[node.node_id for node in result.nodes],
        traversed_edge_ids=[edge.edge_id for edge in result.edges],
        context_token_estimate=result.context_token_estimate, outcome=result.status,
    ))
    await session.flush()


async def _entity_seed_nodes(
    session: AsyncSession, *, project_id: str, snapshot_id: str, entity_values: list[str]
) -> list[ProjectGraphNode]:
    if not entity_values:
        return []
    values = {_normalize(value) for value in entity_values}
    nodes = (await session.execute(select(ProjectGraphNode).where(
        ProjectGraphNode.project_id == project_id,
        ProjectGraphNode.snapshot_id == snapshot_id,
        ProjectGraphNode.node_type.in_(["element_type", "element_occurrence", "drawing_reference"]),
    ))).scalars().all()
    selected = []
    for node in nodes:
        names = {_normalize(node.canonical_name), _normalize(node.normalized_name)}
        if any(name == value or name.startswith(value + " ") for value in values for name in names):
            selected.append(node)
    return selected


def _node_priority(node: ProjectGraphNode, seed_ids: set[str]) -> int:
    if node.node_id in seed_ids:
        return 1000
    if node.node_type in _PROTECTED_NODE_TYPES:
        return {
            "conflict": 950,
            "dimension": 900,
            "material": 900,
            "drawing_reference": 800,
            "reference": 800,
            "sheet": 700,
        }.get(node.node_type, 700)
    return 100


async def _prune_result(
    session: AsyncSession, *, project_id: str, snapshot_id: str,
    nodes: list[ProjectGraphNode], edges: list[ProjectGraphEdge], budget_tokens: int,
    seed_ids: set[str],
) -> tuple[list[ProjectGraphNode], list[ProjectGraphEdge], list[ProjectGraphEvidence], int]:
    evidence = await _evidence_for_nodes(session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes)
    token_estimate = _result_token_estimate(nodes, evidence)
    while nodes and token_estimate > budget_tokens:
        removable = [node for node in nodes if node.node_id not in seed_ids]
        candidate = min(removable or nodes, key=lambda node: (_node_priority(node, seed_ids), node.node_id))
        nodes.remove(candidate)
        permitted = {node.node_id for node in nodes}
        edges = [
            edge for edge in edges
            if edge.source_node_id in permitted and edge.target_node_id in permitted
        ]
        evidence = await _evidence_for_nodes(
            session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes
        )
        token_estimate = _result_token_estimate(nodes, evidence)
        if len(nodes) == 1 and token_estimate > budget_tokens and nodes[0].node_id in seed_ids:
            break
    return nodes, edges, evidence, token_estimate


async def _retrieve_intent(
    session: AsyncSession, *, project_id: str, query: str, depth: int,
    budget_tokens: int, snapshot_id: str,
) -> GraphRetrievalResult:
    notes: list[str] = []
    try:
        plan, notes = await parse_query_plan(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query
        )
    except Exception as exc:
        legacy = await _retrieve_legacy(
            session, project_id=project_id, query=query, depth=depth,
            budget_tokens=budget_tokens, relations=None, traversal_mode="bfs",
            target_node_id=None,
        )
        legacy.notes.append("parser: fallback_legacy")
        legacy.notes.append(f"parser_error: {type(exc).__name__}")
        return legacy

    intent = plan.intent.value
    effective_relations = set(plan.relations)
    if intent == "NUMERIC_STORED_FACT" and any(
        term in _normalize(query) for term in ("konflik", "bentrok", "tidak sesuai", "beda ukuran")
    ):
        # B4's numeric-word rule is intentionally broad; an explicit conflict
        # phrase is the stronger execution contract for retrieval.
        intent = "CONFLICT_LOOKUP"
        effective_relations = {"CONFLICTS_WITH", "HAS_EVIDENCE"}
    applied_filters = {
        "level": plan.filters.get("level"),
        "discipline": plan.filters.get("discipline"),
    }
    plan_payload = plan.model_dump(mode="json")
    plan_payload["intent"] = intent
    plan_payload["relations"] = sorted(effective_relations)

    if intent == "CALCULATION_REQUIRED":
        entity_nodes = await _entity_seed_nodes(
            session, project_id=project_id, snapshot_id=snapshot_id,
            entity_values=[entity.value for entity in plan.entities],
        )
        facts = ", ".join(
            f"tipe elemen {node.canonical_name}"
            for node in entity_nodes
        ) or "tipe elemen dan dimensi tertulis bila tersedia"
        guidance = (
            "Angka final wajib dihitung oleh Core Engine dan menunggu approval manusia; "
            f"fakta tersedia: {facts}. Retrieve tidak menghitung volume atau kebutuhan material."
        )
        result = GraphRetrievalResult(
            status="calculation_required", snapshot_id=snapshot_id, intent=intent,
            applied_filters=applied_filters, data_status="calculation_required",
            notes=notes, guidance=guidance, rab_bridge_available=True,
        )
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=[node.node_id for node in entity_nodes], result=result,
        )
        return result

    unknown_level = any(note.startswith("level tak dikenal:") for note in notes)
    if unknown_level:
        result = GraphRetrievalResult(
            status="success", snapshot_id=snapshot_id, intent=intent,
            applied_filters=applied_filters, data_status="unknown_level", notes=notes,
        )
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=[], result=result,
        )
        return result

    if intent in {"LIST_FILTER", "ELEMENT_LOOKUP"} and applied_filters["level"]:
        level_seeds = await _exact_level_seeds(
            session, project_id=project_id, snapshot_id=snapshot_id,
            query_normalized=_normalize(applied_filters["level"] or ""),
        )
        if not level_seeds:
            notes.append(f"level tak dikenal: {applied_filters['level']}")
            result = GraphRetrievalResult(
                status="success", snapshot_id=snapshot_id, intent=intent,
                applied_filters=applied_filters, data_status="unknown_level", notes=notes,
            )
            await _write_query_log(
                session, project_id=project_id, snapshot_id=snapshot_id, query=query,
                query_plan=plan_payload, seed_ids=[], result=result,
            )
            return result

        level_ids = {node.node_id for node in level_seeds}
        view = (await session.execute(select(ProjectGraphSummaryView).where(
            ProjectGraphSummaryView.project_id == project_id,
            ProjectGraphSummaryView.snapshot_id == snapshot_id,
            ProjectGraphSummaryView.view_kind == "LEVEL_OVERVIEW",
            ProjectGraphSummaryView.level_id.in_(level_ids),
        ))).scalars().first()
        if view is not None:
            occurrence_edges = (await session.execute(select(ProjectGraphEdge).where(
                ProjectGraphEdge.project_id == project_id,
                ProjectGraphEdge.snapshot_id == snapshot_id,
                ProjectGraphEdge.relation == "LOCATED_ON",
                ProjectGraphEdge.target_node_id.in_(level_ids),
            ))).scalars().all()
            occurrence_ids = {edge.source_node_id for edge in occurrence_edges}
            occurrence_nodes = await _nodes_for_ids(
                session, project_id=project_id, snapshot_id=snapshot_id, node_ids=occurrence_ids
            )
            discipline = applied_filters["discipline"]
            selected_occurrences = [
                node for node in occurrence_nodes.values()
                if discipline is None or _normalize(node.discipline) == _normalize(discipline)
            ]
            selected_ids = level_ids | {node.node_id for node in selected_occurrences}
            nodes = [node for node in [*level_seeds, *selected_occurrences] if node.node_id in selected_ids]
            edges = [edge for edge in occurrence_edges if edge.source_node_id in selected_ids and edge.target_node_id in selected_ids]
            nodes, edges, evidence, token_estimate = await _prune_result(
                session, project_id=project_id, snapshot_id=snapshot_id,
                nodes=sorted({node.node_id: node for node in nodes}.values(), key=lambda node: node.node_id),
                edges=edges, budget_tokens=budget_tokens, seed_ids=level_ids,
            )
            result = GraphRetrievalResult(
                status="success", snapshot_id=snapshot_id, nodes=nodes, edges=edges,
                evidence=evidence, context_token_estimate=token_estimate, intent=intent,
                applied_filters=applied_filters, data_status="grounded" if nodes else "empty",
                notes=notes, summary_view=view.payload,
            )
            await _write_query_log(
                session, project_id=project_id, snapshot_id=snapshot_id, query=query,
                query_plan=plan_payload, seed_ids=sorted(level_ids), result=result,
            )
            return result

        all_nodes = (await session.execute(select(ProjectGraphNode).where(
            ProjectGraphNode.project_id == project_id,
            ProjectGraphNode.snapshot_id == snapshot_id,
        ))).scalars().all()
        node_by_id = {node.node_id: node for node in all_nodes}
        edge_query = select(ProjectGraphEdge).where(
            ProjectGraphEdge.project_id == project_id,
            ProjectGraphEdge.snapshot_id == snapshot_id,
            ProjectGraphEdge.relation.in_(set(plan.relations)),
        )
        graph_edges = (await session.execute(edge_query)).scalars().all()
        adjacency: dict[str, list[tuple[str, ProjectGraphEdge]]] = {}
        for edge in graph_edges:
            adjacency.setdefault(edge.source_node_id, []).append((edge.target_node_id, edge))
            adjacency.setdefault(edge.target_node_id, []).append((edge.source_node_id, edge))
        discipline = applied_filters["discipline"]
        visited = set(level_ids)
        edges: list[ProjectGraphEdge] = []
        frontier = list(level_ids)
        for _ in range(max(0, plan.traversal_depth or depth)):
            next_frontier: list[str] = []
            for current in frontier:
                for neighbor, edge in adjacency.get(current, []):
                    node = node_by_id.get(neighbor)
                    if neighbor in visited or node is None:
                        continue
                    if node.node_type not in _LEVEL_NODE_TYPES and discipline and _normalize(node.discipline) != _normalize(discipline):
                        continue
                    visited.add(neighbor)
                    edges.append(edge)
                    next_frontier.append(neighbor)
            frontier = next_frontier
        nodes = [node_by_id[node_id] for node_id in sorted(visited) if node_id in node_by_id]
        nodes, edges, evidence, token_estimate = await _prune_result(
            session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes,
            edges=edges, budget_tokens=budget_tokens, seed_ids=level_ids,
        )
        result = GraphRetrievalResult(
            status="success", snapshot_id=snapshot_id, nodes=nodes, edges=edges,
            evidence=evidence, context_token_estimate=token_estimate, intent=intent,
            applied_filters=applied_filters, data_status="grounded" if nodes else "empty",
            notes=notes,
        )
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=sorted(level_ids), result=result,
        )
        return result

    if intent == "CONFLICT_LOOKUP":
        seed_nodes = (await session.execute(select(ProjectGraphNode).where(
            ProjectGraphNode.project_id == project_id,
            ProjectGraphNode.snapshot_id == snapshot_id,
            ProjectGraphNode.node_type == "conflict",
        ))).scalars().all()
        seed_ids = {node.node_id for node in seed_nodes}
        result = await _retrieve_from_seeds(
            session, project_id=project_id, snapshot_id=snapshot_id, seed_nodes=seed_nodes,
            relations=effective_relations, depth=plan.traversal_depth, budget_tokens=budget_tokens,
            intent=intent, applied_filters=applied_filters, notes=notes,
        )
        result.missing_information = []
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=sorted(seed_ids), result=result,
        )
        return result

    if intent == "MISSING_DATA":
        seed_nodes = (await session.execute(select(ProjectGraphNode).where(
            ProjectGraphNode.project_id == project_id,
            ProjectGraphNode.snapshot_id == snapshot_id,
            ProjectGraphNode.node_type.in_(["missing_data", "conflict"]),
        ))).scalars().all()
        result = await _retrieve_from_seeds(
            session, project_id=project_id, snapshot_id=snapshot_id, seed_nodes=seed_nodes,
            relations=effective_relations, depth=plan.traversal_depth, budget_tokens=budget_tokens,
            intent=intent, applied_filters=applied_filters, notes=notes,
        )
        result.missing_information = [node.canonical_name for node in seed_nodes[:10]]
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=[node.node_id for node in seed_nodes], result=result,
        )
        return result

    if intent == "NUMERIC_STORED_FACT":
        seed_nodes = await _entity_seed_nodes(
            session, project_id=project_id, snapshot_id=snapshot_id,
            entity_values=[entity.value for entity in plan.entities],
        )
        result = await _retrieve_from_seeds(
            session, project_id=project_id, snapshot_id=snapshot_id, seed_nodes=seed_nodes,
            relations=_NUMERIC_RELATIONS, depth=2, budget_tokens=budget_tokens,
            intent=intent, applied_filters=applied_filters, notes=notes,
        )
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=[node.node_id for node in seed_nodes], result=result,
        )
        return result

    if intent == "ELEMENT_LOOKUP" and plan.entities and not applied_filters["level"]:
        seed_nodes = await _entity_seed_nodes(
            session, project_id=project_id, snapshot_id=snapshot_id,
            entity_values=[entity.value for entity in plan.entities],
        )
        result = await _retrieve_from_seeds(
            session, project_id=project_id, snapshot_id=snapshot_id, seed_nodes=seed_nodes,
            relations=effective_relations, depth=plan.traversal_depth, budget_tokens=budget_tokens,
            intent=intent, applied_filters=applied_filters, notes=notes,
        )
        await _write_query_log(
            session, project_id=project_id, snapshot_id=snapshot_id, query=query,
            query_plan=plan_payload, seed_ids=[node.node_id for node in seed_nodes], result=result,
        )
        return result

    # A plan without a recognized scope remains grounded by the existing deterministic lookup.
    legacy = await _retrieve_legacy(
        session, project_id=project_id, query=query, depth=depth,
        budget_tokens=budget_tokens, relations=set(plan.relations), traversal_mode=plan.traversal_mode,
        target_node_id=None,
    )
    legacy.intent = intent
    legacy.applied_filters = applied_filters
    legacy.data_status = "grounded" if legacy.nodes else "empty"
    legacy.notes = notes
    return legacy


async def _retrieve_from_seeds(
    session: AsyncSession, *, project_id: str, snapshot_id: str,
    seed_nodes: list[ProjectGraphNode], relations: set[str], depth: int,
    budget_tokens: int, intent: str, applied_filters: dict[str, str | None], notes: list[str],
) -> GraphRetrievalResult:
    seed_ids = {node.node_id for node in seed_nodes}
    edge_query = select(ProjectGraphEdge).where(
        ProjectGraphEdge.project_id == project_id,
        ProjectGraphEdge.snapshot_id == snapshot_id,
        ProjectGraphEdge.relation.in_(relations),
    )
    graph_edges = (await session.execute(edge_query)).scalars().all()
    adjacency: dict[str, list[tuple[str, ProjectGraphEdge]]] = {}
    for edge in graph_edges:
        adjacency.setdefault(edge.source_node_id, []).append((edge.target_node_id, edge))
        adjacency.setdefault(edge.target_node_id, []).append((edge.source_node_id, edge))
    visited = set(seed_ids)
    edges: list[ProjectGraphEdge] = []
    frontier = list(seed_ids)
    all_nodes = await _nodes_for_ids(
        session, project_id=project_id, snapshot_id=snapshot_id,
        node_ids={endpoint for edge in graph_edges for endpoint in (edge.source_node_id, edge.target_node_id)} | seed_ids,
    )
    for _ in range(max(0, depth)):
        next_frontier: list[str] = []
        for current in frontier:
            for neighbor, edge in adjacency.get(current, []):
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                edges.append(edge)
                next_frontier.append(neighbor)
        frontier = next_frontier
    nodes = [all_nodes[node_id] for node_id in sorted(visited) if node_id in all_nodes]
    nodes, edges, evidence, token_estimate = await _prune_result(
        session, project_id=project_id, snapshot_id=snapshot_id, nodes=nodes,
        edges=edges, budget_tokens=budget_tokens, seed_ids=seed_ids,
    )
    return GraphRetrievalResult(
        status="success", snapshot_id=snapshot_id, nodes=nodes, edges=edges,
        evidence=evidence, context_token_estimate=token_estimate, intent=intent,
        applied_filters=applied_filters, data_status="grounded" if nodes else "empty", notes=notes,
    )


async def retrieve_project_graph(
    session: AsyncSession, *, project_id: str, query: str, depth: int = 2,
    budget_tokens: int = 1400, relations: set[str] | None = None,
    traversal_mode: str = "bfs", target_node_id: str | None = None,
    use_intent: bool = False,
) -> GraphRetrievalResult:
    """Return a bounded, evidence-backed subgraph; never calculate or cross tenants."""
    snapshot = await get_active_snapshot(session, project_id)
    if snapshot is None:
        return GraphRetrievalResult(status="not_ready")
    if use_intent:
        return await _retrieve_intent(
            session, project_id=project_id, query=query, depth=depth,
            budget_tokens=budget_tokens, snapshot_id=snapshot.snapshot_id,
        )
    return await _retrieve_legacy(
        session, project_id=project_id, query=query, depth=depth,
        budget_tokens=budget_tokens, relations=relations, traversal_mode=traversal_mode,
        target_node_id=target_node_id,
    )


async def _retrieve_legacy(
    session: AsyncSession, *, project_id: str, query: str, depth: int,
    budget_tokens: int, relations: set[str] | None, traversal_mode: str,
    target_node_id: str | None,
) -> GraphRetrievalResult:
    snapshot = await get_active_snapshot(session, project_id)
    if snapshot is None:
        return GraphRetrievalResult(status="not_ready")
    query_normalized = _normalize(query)
    if traversal_mode not in {"bfs", "dfs", "shortest_path", "direct_lookup"}:
        raise ValueError("unsupported traversal mode")

    level_seeds = await _exact_level_seeds(
        session, project_id=project_id, snapshot_id=snapshot.snapshot_id, query_normalized=query_normalized
    )
    level_scoped = bool(level_seeds) and traversal_mode == "bfs" and target_node_id is None
    if level_scoped:
        # Location-scoped query: seeds are ONLY the level node(s) whose name
        # exactly matches the query (not mixed with unrelated text-match
        # noise), and traversal follows LOCATED_ON/INSTANCE_OF/HAS_DIMENSION
        # only -- the relations that actually carry "what's on this level and
        # its measurements", not every relation in the graph (which is what
        # let a "lantai 2" query previously pull in unrelated
        # "discipline"/"note" nodes via BFS over all edges).
        by_id = {node.node_id: node for node in level_seeds}
        relations = {"LOCATED_ON", "INSTANCE_OF", "HAS_DIMENSION"}
    else:
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
        ordered_seeds = sorted(
            by_id.values(),
            key=lambda node: (-_seed_score(query_normalized, node.canonical_name, node.search_text, node.node_id in alias_ids), node.node_id),
        )
        by_id = {node.node_id: node for node in ordered_seeds}
    vocabulary = await build_project_vocabulary(session, project_id=project_id, snapshot_id=snapshot.snapshot_id)
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
        edges = [item for item in edges if item.source_node_id in permitted and item.target_node_id in permitted]
        permitted_evidence_ids = (await session.execute(select(ProjectGraphNodeEvidence.evidence_id).where(
            ProjectGraphNodeEvidence.snapshot_id == snapshot.snapshot_id, ProjectGraphNodeEvidence.node_id.in_(permitted)))).scalars().all()
        evidence = [item for item in evidence if item.evidence_id in set(permitted_evidence_ids)]
        token_estimate = _tokens([node.canonical_name + " " + node.search_text for node in nodes] + [item.raw_text for item in evidence])
    session.add(ProjectGraphQueryLog(id=uuid.uuid4(), project_id=project_id, snapshot_id=snapshot.snapshot_id,
        user_query=query, query_plan={"intent": "LEVEL_SCOPED" if level_scoped else ("DIRECT_FACT" if len(query_normalized.split()) <= 2 else "LIST_FILTER"), "depth": depth, "relations": sorted(relations or []), "traversal_mode": traversal_mode, "target_node_id": target_node_id, "vocabulary_match": query_normalized in vocabulary},
        selected_seed_ids=seed_ids, traversed_node_ids=[item.node_id for item in nodes],
        traversed_edge_ids=[item.edge_id for item in edges], context_token_estimate=token_estimate, outcome="success"))
    await session.flush()
    return GraphRetrievalResult("success", snapshot.snapshot_id, nodes, edges, evidence, token_estimate)
