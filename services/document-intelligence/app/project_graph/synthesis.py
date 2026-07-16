"""Project-level deterministic synthesis over drawing evidence sheets."""
from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from hashlib import sha256
from typing import Iterable, Sequence

from app.project_graph.alias_resolver import resolve_aliases
from app.project_graph.community_builder import GraphCommunity, build_graph_communities
from app.project_graph.conflict_resolver import resolve_conflicts
from app.project_graph.cross_sheet_resolver import resolve_cross_sheet
from app.project_graph.models import (
    EdgeResolver,
    NodeProperty,
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
    ProjectGraphSnapshot,
)
from app.project_graph.page_patch import build_sheet_patch
from app.project_graph.summary_builder import ProjectGraphSummary, build_project_graph_summary
from app.project_graph.synthesis_types import (
    PckmProviderResult,
    PckmResolutionProposal,
    PckmSynthesisProvider,
    ResolutionCandidate,
    SheetKnowledgePatch,
)
from app.project_graph.validator import assert_valid_project_graph
from app.transcription.models import DrawingEvidenceSheet


_ALLOWED_PROVIDER_DECISIONS = frozenset(
    {"merge", "keep_separate", "possibly_same", "requires_review"}
)


@dataclass(frozen=True)
class ProviderProposal:
    candidate_id: str
    candidate: ResolutionCandidate
    result: PckmProviderResult | None
    proposal: PckmResolutionProposal | None = None
    error: str | None = None


@dataclass(frozen=True)
class SynthesisAudit:
    page_count: int
    element_type_count: int
    merged_type_count: int
    occurrence_count: int
    merged_occurrence_count: int
    possibly_same_count: int
    escalation_count: int
    conflict_count: int


@dataclass(frozen=True)
class SynthesisResult:
    snapshot: ProjectGraphSnapshot
    summary: ProjectGraphSummary
    audit: SynthesisAudit
    communities: tuple[GraphCommunity, ...]
    provider_proposals: tuple[ProviderProposal, ...]


def _stable_id(prefix: str, *parts: object) -> str:
    payload = json.dumps(parts, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return f"{prefix}-{sha256(payload.encode('utf-8')).hexdigest()[:16].upper()}"


def _patch_key(patch: SheetKnowledgePatch) -> tuple[str, int, str]:
    return (patch.document_id, patch.page_index, patch.sheet_id)


def _source_key(source_ref: NodeSourceRef) -> tuple[str, int, str]:
    return (source_ref.document_id, source_ref.page_index, source_ref.sheet_id)


def _canonical_text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return " ".join(normalized.split())


def _merge_source_refs(source_refs: Iterable[NodeSourceRef]) -> list[NodeSourceRef]:
    grouped: dict[tuple[str, int, str], set[str]] = {}
    for source_ref in source_refs:
        grouped.setdefault(_source_key(source_ref), set()).update(source_ref.evidence_refs)
    return [
        NodeSourceRef(
            document_id=document_id,
            page_index=page_index,
            sheet_id=sheet_id,
            evidence_refs=sorted(evidence_refs),
        )
        for (document_id, page_index, sheet_id), evidence_refs in sorted(grouped.items())
    ]


def _merge_properties(nodes: Sequence[ProjectGraphNode]) -> dict[str, NodeProperty]:
    properties: dict[str, NodeProperty] = {}
    for node in nodes:
        for key, property_value in node.properties.items():
            existing = properties.get(key)
            if existing is None:
                properties[key] = property_value.model_copy(
                    update={"evidence_refs": sorted(set(property_value.evidence_refs))}
                )
                continue
            if existing.value != property_value.value or existing.value_source != property_value.value_source:
                raise ValueError(f"node {node.node_id} has conflicting property {key}")
            properties[key] = existing.model_copy(
                update={
                    "evidence_refs": sorted(
                        set(existing.evidence_refs) | set(property_value.evidence_refs)
                    )
                }
            )
    return properties


def _merge_nodes(nodes: Iterable[ProjectGraphNode]) -> list[ProjectGraphNode]:
    grouped: dict[str, list[ProjectGraphNode]] = {}
    for node in nodes:
        grouped.setdefault(node.node_id, []).append(node)
    merged: list[ProjectGraphNode] = []
    for node_id, same_id_nodes in sorted(grouped.items()):
        ordered = sorted(
            same_id_nodes,
            key=lambda node: (node.type, node.canonical_name, node.discipline),
        )
        first = ordered[0]
        canonical_name = min(
            (node.canonical_name for node in ordered),
            key=lambda value: (value.casefold(), value),
        )
        if any(
            (node.type, _canonical_text_key(node.canonical_name), node.discipline) !=
            (first.type, _canonical_text_key(first.canonical_name), first.discipline)
            for node in ordered[1:]
        ):
            raise ValueError(f"node id collision for {node_id}")
        merged.append(
            first.model_copy(
                update={
                    "canonical_name": canonical_name,
                    "aliases": sorted(
                        {
                            *(
                                alias
                                for node in ordered
                                for alias in node.aliases
                            ),
                            *(
                                node.canonical_name
                                for node in ordered
                                if node.canonical_name != canonical_name
                            ),
                        },
                        key=lambda value: (value.casefold(), value),
                    ),
                    "properties": _merge_properties(ordered),
                    "confidence": min(node.confidence for node in ordered),
                    "source_refs": _merge_source_refs(
                        source_ref for node in ordered for source_ref in node.source_refs
                    ),
                }
            )
        )
    return merged


def _merge_edges(edges: Iterable[ProjectGraphEdge]) -> list[ProjectGraphEdge]:
    grouped: dict[str, list[ProjectGraphEdge]] = {}
    for edge in edges:
        grouped.setdefault(edge.edge_id, []).append(edge)
    merged: list[ProjectGraphEdge] = []
    for edge_id, same_id_edges in sorted(grouped.items()):
        ordered = sorted(
            same_id_edges,
            key=lambda edge: (edge.source, edge.target, edge.relation),
        )
        first = ordered[0]
        if any(
            (edge.source, edge.target, edge.relation, edge.confidence_class) !=
            (first.source, first.target, first.relation, first.confidence_class)
            for edge in ordered[1:]
        ):
            raise ValueError(f"edge id collision for {edge_id}")
        resolvers = {edge.resolver.model_dump_json() if edge.resolver else "" for edge in ordered}
        if len(resolvers) > 1:
            raise ValueError(f"edge {edge_id} has conflicting resolver metadata")
        merged.append(
            first.model_copy(
                update={
                    "confidence": min(edge.confidence for edge in ordered),
                    "evidence_refs": sorted(
                        {
                            evidence_ref
                            for edge in ordered
                            for evidence_ref in edge.evidence_refs
                        }
                    ),
                }
            )
        )
    return merged


def _proposal_results(
    candidates: Sequence[ResolutionCandidate],
    provider: PckmSynthesisProvider | None,
) -> tuple[tuple[ProviderProposal, ...], tuple[str, ...]]:
    if provider is None:
        return (), ()
    proposals: list[ProviderProposal] = []
    missing_information: list[str] = []
    for candidate in candidates:
        try:
            result = provider.resolve(candidate)
            if not isinstance(result, PckmProviderResult):
                raise TypeError("provider returned an unsupported result type")
        except Exception as exc:
            proposals.append(
                ProviderProposal(
                    candidate_id=candidate.candidate_id,
                    candidate=candidate,
                    result=None,
                    error=str(exc),
                )
            )
            missing_information.append(
                f"provider proposal unavailable for {candidate.candidate_id}: {exc}"
            )
            continue
        decision = result.payload.get("decision")
        if decision not in _ALLOWED_PROVIDER_DECISIONS:
            proposals.append(
                ProviderProposal(
                    candidate_id=candidate.candidate_id,
                    candidate=candidate,
                    result=result,
                    error="unsupported provider decision",
                )
            )
            missing_information.append(
                f"provider proposal rejected for {candidate.candidate_id}: unsupported decision"
            )
            continue
        try:
            proposal = PckmResolutionProposal.model_validate(result.payload)
        except Exception:
            proposals.append(
                ProviderProposal(
                    candidate_id=candidate.candidate_id,
                    candidate=candidate,
                    result=result,
                    error="invalid provider proposal",
                )
            )
            missing_information.append(
                f"provider proposal rejected for {candidate.candidate_id}: invalid contract"
            )
            continue
        proposals.append(
            ProviderProposal(
                candidate_id=candidate.candidate_id,
                candidate=candidate,
                result=result,
                proposal=proposal,
            )
        )
    return tuple(proposals), tuple(sorted(set(missing_information)))


def _provider_review_edges(
    proposals: Sequence[ProviderProposal],
    nodes: Sequence[ProjectGraphNode],
) -> list[ProjectGraphEdge]:
    """Materialize only ambiguous provider proposals as noncanonical review edges."""

    nodes_by_id = {node.node_id: node for node in nodes}
    edges: list[ProjectGraphEdge] = []
    for proposal in proposals:
        if proposal.proposal is None or proposal.result is None:
            continue
        if proposal.proposal.decision not in {"possibly_same", "requires_review"}:
            continue
        occurrence_ids = sorted(
            {
                node_id
                for node_id in proposal.candidate.target_node_ids
                if node_id in nodes_by_id and nodes_by_id[node_id].type == "element_occurrence"
            }
        )
        if len(occurrence_ids) != 2:
            continue
        evidence_refs = sorted(
            {
                evidence_ref
                for node_id in occurrence_ids
                for source_ref in nodes_by_id[node_id].source_refs
                for evidence_ref in source_ref.evidence_refs
            }
        )
        source_id, target_id = occurrence_ids
        edges.append(
            ProjectGraphEdge(
                edge_id=_stable_id(
                    "EDGE",
                    proposal.candidate_id,
                    source_id,
                    target_id,
                    "POSSIBLY_SAME_AS",
                ),
                source=source_id,
                target=target_id,
                relation="POSSIBLY_SAME_AS",
                confidence_class="AMBIGUOUS",
                confidence=0.5,
                evidence_refs=evidence_refs,
                resolver=EdgeResolver(
                    method="provider_review_proposal",
                    model=proposal.result.model,
                ),
            )
        )
    return edges


def _patch_missing_information(patches: Sequence[SheetKnowledgePatch]) -> list[str]:
    values: list[str] = []
    for patch in patches:
        for ambiguity in patch.ambiguities:
            values.append(f"{patch.sheet_id} page {patch.page_index + 1}: ambiguity {ambiguity}")
    return values


def _snapshot_id(
    project_id: str,
    document_ids: Sequence[str],
    dem_run_ids: Sequence[str],
    page_count: int,
    nodes: Sequence[ProjectGraphNode],
    edges: Sequence[ProjectGraphEdge],
    communities: Sequence[GraphCommunity],
    aliases: Sequence[str],
    conflicts: Sequence[str],
    missing_information: Sequence[str],
) -> str:
    """Hash the complete deterministic content, not only graph identifiers."""

    content = {
        "project_id": project_id,
        "document_ids": sorted(document_ids),
        "dem_run_ids": sorted(dem_run_ids),
        "page_count": page_count,
        "nodes": [node.model_dump(mode="json") for node in nodes],
        "edges": [edge.model_dump(mode="json") for edge in edges],
        "communities": [
            {
                "community_id": community.community_id,
                "label": community.label,
                "node_ids": list(community.node_ids),
                "edge_ids": list(community.edge_ids),
            }
            for community in communities
        ],
        "aliases": sorted(aliases),
        "conflicts": sorted(conflicts),
        "missing_information": sorted(missing_information),
    }
    return _stable_id("SNAPSHOT", content)


def synthesize_project_graph(
    sheets: Sequence[DrawingEvidenceSheet],
    provider: PckmSynthesisProvider | None = None,
) -> SynthesisResult:
    """Build a deterministic project graph; provider output remains an audit proposal."""

    if not sheets:
        raise ValueError("at least one drawing evidence sheet is required")
    project_ids = {sheet.project_id for sheet in sheets}
    if len(project_ids) != 1:
        raise ValueError("all drawing evidence sheets must belong to one project")
    project_id = next(iter(project_ids))
    patches = sorted((build_sheet_patch(sheet) for sheet in sheets), key=_patch_key)

    alias_resolution = resolve_aliases(patches)
    if alias_resolution.project_id != project_id:
        raise ValueError("alias resolution project id does not match synthesis input")
    cross_sheet = resolve_cross_sheet(patches, alias_resolution)
    conflicts = resolve_conflicts(patches)
    proposals, provider_missing_information = _proposal_results(
        [request.candidate for request in cross_sheet.escalation_requests],
        provider,
    )

    # "level" is excluded here for the same reason "element_type" is: raw
    # per-page nodes from page_patch.py (one per sheet mentioning a level
    # observation, id prefix NODE-) are pure noise -- real 88-page fixture
    # measurement found 156 such nodes for a project with only 12 genuinely
    # distinct levels, because the "levels" observation category also
    # captures ramp/roof/elevation markers that coincidentally normalize to
    # the same text as a real floor name. The deduplicated replacement
    # (cross_sheet_resolver._level_node(), id prefix LEVEL-, one per
    # (project, normalized level key)) is already included via
    # cross_sheet.nodes below and is the only kind occurrences actually
    # attach to via LOCATED_ON.
    base_nodes = [
        node
        for patch in patches
        for node in patch.nodes
        if node.type not in {"element_type", "level"}
    ]
    candidate_nodes = [
        *base_nodes,
        *alias_resolution.nodes,
        *cross_sheet.nodes,
        *conflicts.nodes,
    ]
    nodes = _merge_nodes(candidate_nodes)
    node_ids = {node.node_id for node in nodes}
    base_edges = [
        edge
        for patch in patches
        for edge in patch.edges
        if edge.source in node_ids and edge.target in node_ids
    ]
    provider_edges = _provider_review_edges(proposals, [*candidate_nodes])
    edges = _merge_edges([*base_edges, *cross_sheet.edges, *conflicts.edges, *provider_edges])
    assert_valid_project_graph(nodes, edges)

    missing_information = sorted(
        set(
            [
                *cross_sheet.missing_information,
                *provider_missing_information,
                *_patch_missing_information(patches),
            ]
        )
    )
    communities = build_graph_communities(nodes, edges)
    document_ids = sorted({patch.document_id for patch in patches})
    dem_run_ids = sorted({patch.run_id for patch in patches})
    aliases = sorted(alias_resolution.alias_to_node_id)
    conflict_ids = sorted(node.node_id for node in nodes if node.type == "conflict")
    snapshot = ProjectGraphSnapshot(
        project_id=project_id,
        snapshot_id=_snapshot_id(
            project_id,
            document_ids,
            dem_run_ids,
            len(patches),
            nodes,
            edges,
            communities,
            aliases,
            conflict_ids,
            missing_information,
        ),
        document_ids=document_ids,
        dem_run_ids=dem_run_ids,
        page_count=len(patches),
        nodes=nodes,
        edges=edges,
        communities=[community.community_id for community in communities],
        aliases=aliases,
        conflicts=conflict_ids,
        missing_information=missing_information,
    )
    summary = build_project_graph_summary(snapshot)
    type_nodes = [node for node in nodes if node.type == "element_type"]
    occurrence_nodes = [node for node in nodes if node.type == "element_occurrence"]
    audit = SynthesisAudit(
        page_count=len(patches),
        element_type_count=len(type_nodes),
        merged_type_count=sum(len(node.source_refs) > 1 for node in type_nodes),
        occurrence_count=len(occurrence_nodes),
        merged_occurrence_count=sum(len(node.source_refs) > 1 for node in occurrence_nodes),
        possibly_same_count=sum(edge.relation == "POSSIBLY_SAME_AS" for edge in edges),
        escalation_count=len(cross_sheet.escalation_requests),
        conflict_count=len(snapshot.conflicts),
    )
    return SynthesisResult(
        snapshot=snapshot,
        summary=summary,
        audit=audit,
        communities=communities,
        provider_proposals=proposals,
    )
