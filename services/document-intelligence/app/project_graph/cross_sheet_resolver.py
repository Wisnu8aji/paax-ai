"""Conservative deterministic occurrence resolution across sheet patches."""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from hashlib import sha256
from typing import Iterable, Sequence

from app.project_graph.alias_resolver import AliasResolution
from app.project_graph.fixture_audit import (
    ResolutionRisk,
    ResolutionRiskSignals,
    score_resolution_risk,
)
from app.project_graph.models import (
    EdgeResolver,
    NodeProperty,
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
)
from app.project_graph.normalizer import normalize_element_code
from app.project_graph.synthesis_types import ResolutionCandidate, SheetKnowledgePatch


@dataclass(frozen=True)
class EscalationRequest:
    candidate: ResolutionCandidate
    risk: ResolutionRisk


@dataclass(frozen=True)
class CrossSheetResolution:
    nodes: tuple[ProjectGraphNode, ...]
    edges: tuple[ProjectGraphEdge, ...]
    missing_information: tuple[str, ...]
    escalation_requests: tuple[EscalationRequest, ...]


@dataclass(frozen=True)
class _FactValue:
    key: str
    display: str
    confidence: float
    evidence_refs: tuple[str, ...]
    bbox: tuple[float, float, float, float] | None


@dataclass(frozen=True)
class _TypeSource:
    type_node: ProjectGraphNode
    patch: SheetKnowledgePatch
    source_ref: NodeSourceRef
    level: _FactValue | None
    space: _FactValue | None


_CODE_BOUNDARY = re.compile(r"(?<![A-Z0-9]){code}(?![A-Z0-9])")
_TITLE_LEVEL = re.compile(r"\b(?:LT\.?|LANTAI)\s*(\d+|ATAP|ROOF|DASAR)\b", re.IGNORECASE)


def _stable_id(prefix: str, *parts: object) -> str:
    payload = json.dumps(parts, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return f"{prefix}-{sha256(payload.encode('utf-8')).hexdigest()[:16].upper()}"


def _text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return " ".join(normalized.split())


def _source_key(source_ref: NodeSourceRef) -> tuple[str, int, str]:
    return (source_ref.document_id, source_ref.page_index, source_ref.sheet_id)


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


def _source_ref_with_evidence(source_ref: NodeSourceRef, evidence_refs: Iterable[str]) -> NodeSourceRef:
    return NodeSourceRef(
        document_id=source_ref.document_id,
        page_index=source_ref.page_index,
        sheet_id=source_ref.sheet_id,
        evidence_refs=sorted(set(evidence_refs)),
    )


def _fact_values(patch: SheetKnowledgePatch, category: str) -> tuple[_FactValue, ...]:
    values: dict[str, _FactValue] = {}
    for fact in patch.facts:
        if fact.category != category:
            continue
        display = (fact.normalized or fact.raw).strip()
        if not display:
            continue
        key = _text_key(display)
        if not key:
            continue
        candidate = _FactValue(
            key=key,
            display=display,
            confidence=fact.confidence,
            evidence_refs=tuple(sorted(set(fact.evidence_refs))),
            bbox=fact.bbox,
        )
        existing = values.get(key)
        if existing is None:
            values[key] = candidate
            continue
        bboxes = [bbox for bbox in (existing.bbox, candidate.bbox) if bbox is not None]
        values[key] = _FactValue(
            key=key,
            display=min(existing.display, candidate.display, key=lambda item: (item.casefold(), item)),
            confidence=min(existing.confidence, candidate.confidence),
            evidence_refs=tuple(sorted(set(existing.evidence_refs) | set(candidate.evidence_refs))),
            bbox=min(bboxes) if bboxes else None,
        )
    return tuple(
        value for _, value in sorted(values.items())
    )


def _title_level(patch: SheetKnowledgePatch) -> _FactValue | None:
    identity = next((fact for fact in patch.facts if fact.category == "sheet_identity"), None)
    if identity is None:
        return None
    title = identity.attributes.get("title", "")
    match = _TITLE_LEVEL.search(title)
    if match is None:
        return None
    token = match.group(1).upper()
    if token.isdigit():
        display = f"Lantai {token}"
    elif token in {"ATAP", "ROOF"}:
        display = "Atap"
    else:
        display = "Dasar"
    return _FactValue(
        key=_text_key(display),
        display=display,
        confidence=identity.confidence,
        evidence_refs=tuple(sorted(identity.evidence_refs)),
        bbox=None,
    )


def _element_bbox(
    patch: SheetKnowledgePatch,
    code: str,
    source_ref: NodeSourceRef,
) -> tuple[float, float, float, float] | None:
    candidates = [
        fact
        for fact in patch.facts
        if fact.category == "element_labels"
        and normalize_element_code(fact.normalized or fact.raw) == code
        and fact.bbox is not None
    ]
    if not candidates:
        return None
    matching_evidence = [
        fact for fact in candidates if set(fact.evidence_refs) & set(source_ref.evidence_refs)
    ]
    if matching_evidence:
        selected = sorted(matching_evidence, key=lambda fact: fact.fact_id)[0]
    elif len(candidates) == 1:
        selected = candidates[0]
    else:
        return None
    return selected.bbox


def _nearest_value(
    source_bbox: tuple[float, float, float, float] | None,
    values: Sequence[_FactValue],
) -> _FactValue | None:
    if source_bbox is None:
        return None
    candidates = [value for value in values if value.bbox is not None]
    if not candidates:
        return None
    source_x = (source_bbox[0] + source_bbox[2]) / 2
    source_y = (source_bbox[1] + source_bbox[3]) / 2
    ranked = sorted(
        (
            ((source_x - ((value.bbox[0] + value.bbox[2]) / 2)) ** 2
             + (source_y - ((value.bbox[1] + value.bbox[3]) / 2)) ** 2,
             value.key,
             value)
            for value in candidates
            if value.bbox is not None
        ),
        key=lambda item: (item[0], item[1]),
    )
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        return None
    return ranked[0][2]


def _source_context(
    patch: SheetKnowledgePatch,
    code: str,
    source_ref: NodeSourceRef,
) -> tuple[_FactValue | None, _FactValue | None]:
    source_bbox = _element_bbox(patch, code, source_ref)
    levels = _fact_values(patch, "levels")
    spaces = _fact_values(patch, "spaces")
    level = _title_level(patch)
    if level is None:
        level = _nearest_value(source_bbox, levels)
    space = _nearest_value(source_bbox, spaces)
    return level, space


def _context_missing_reason(source: _TypeSource) -> str:
    missing: list[str] = []
    if source.level is None:
        missing.append("level")
    if source.space is None:
        missing.append("spatial context")
    return ", ".join(missing) or "explicit occurrence context"


def _mentions_code(values: Iterable[str], code: str) -> bool:
    if not code:
        return False
    pattern = re.compile(_CODE_BOUNDARY.pattern.format(code=re.escape(code.upper())))
    return any(pattern.search(value.upper()) is not None for value in values)


def _reference_node(type_node: ProjectGraphNode, source_ref: NodeSourceRef) -> ProjectGraphNode:
    node_id = _stable_id("ELEMREF", type_node.node_id, *_source_key(source_ref))
    return ProjectGraphNode(
        node_id=node_id,
        type="drawing_reference",
        canonical_name=f"{type_node.canonical_name} on {source_ref.sheet_id}",
        aliases=[type_node.canonical_name],
        properties={
            "element_code": NodeProperty(
                value=type_node.canonical_name,
                evidence_refs=source_ref.evidence_refs,
            )
        },
        discipline=type_node.discipline,
        verification_status="extracted",
        confidence=type_node.confidence,
        source_refs=[source_ref],
    )


def _level_node(
    project_id: str,
    level: _FactValue,
    source_refs: Iterable[NodeSourceRef],
) -> ProjectGraphNode:
    return ProjectGraphNode(
        node_id=_stable_id("LEVEL", project_id, level.key),
        type="level",
        canonical_name=level.display,
        properties={
            "normalized_key": NodeProperty(value=level.key, evidence_refs=list(level.evidence_refs))
        },
        discipline="general",
        verification_status="extracted",
        confidence=level.confidence,
        source_refs=_merge_source_refs(source_refs),
    )


def _space_node(
    project_id: str,
    discipline: str,
    level_node: ProjectGraphNode,
    space: _FactValue,
    source_refs: Iterable[NodeSourceRef],
) -> ProjectGraphNode:
    return ProjectGraphNode(
        node_id=_stable_id("SPACE", project_id, discipline, level_node.node_id, space.key),
        type="space",
        canonical_name=space.display,
        properties={
            "normalized_key": NodeProperty(value=space.key, evidence_refs=list(space.evidence_refs))
        },
        discipline=discipline,
        verification_status="extracted",
        confidence=space.confidence,
        source_refs=_merge_source_refs(source_refs),
    )


def _occurrence_node(
    type_node: ProjectGraphNode,
    level_node: ProjectGraphNode,
    space_node: ProjectGraphNode,
    sources: Sequence[_TypeSource],
) -> ProjectGraphNode:
    source_refs = _merge_source_refs(source.source_ref for source in sources)
    label_evidence_refs = sorted(
        {
            evidence_ref
            for source_ref in source_refs
            for evidence_ref in source_ref.evidence_refs
        }
    )
    level_evidence_refs = sorted(
        {
            evidence_ref
            for source in sources
            if source.level is not None
            for evidence_ref in source.level.evidence_refs
        }
    )
    space_evidence_refs = sorted(
        {
            evidence_ref
            for source in sources
            if source.space is not None
            for evidence_ref in source.space.evidence_refs
        }
    )
    return ProjectGraphNode(
        node_id=_stable_id("ELOCC", type_node.node_id, level_node.node_id, space_node.node_id),
        type="element_occurrence",
        canonical_name=(
            f"{type_node.canonical_name} @ {level_node.canonical_name} / "
            f"{space_node.canonical_name}"
        ),
        properties={
            "element_type_id": NodeProperty(
                value=type_node.node_id,
                evidence_refs=label_evidence_refs,
            ),
            "level": NodeProperty(
                value=level_node.canonical_name,
                evidence_refs=level_evidence_refs,
            ),
            "space": NodeProperty(
                value=space_node.canonical_name,
                evidence_refs=space_evidence_refs,
            ),
        },
        discipline=type_node.discipline,
        verification_status="cross_sheet_inferred",
        confidence=min(source.type_node.confidence for source in sources),
        source_refs=source_refs,
    )


def _escalation_request(
    project_id: str,
    type_node: ProjectGraphNode,
    sources: Sequence[_TypeSource],
    occurrence_ids: Sequence[str],
    reference_ids: Sequence[str],
    candidate_count: int,
) -> EscalationRequest | None:
    source_patches = {(source.patch.document_id, source.patch.page_index): source.patch for source in sources}
    source_count = len(sources)
    code = type_node.canonical_name
    risk = score_resolution_risk(
        ResolutionRiskSignals(
            ambiguity=float(_mentions_code((item for patch in source_patches.values() for item in patch.ambiguities), code)),
            conflict=float(any(patch.conflicts for patch in source_patches.values())),
            fanout=float(source_count >= 4),
            cross_discipline=0.0,
            low_evidence=float(any(not source.source_ref.evidence_refs for source in sources)),
            candidate_count=candidate_count,
            confidence=type_node.confidence,
            conflict_detected=any(patch.conflicts for patch in source_patches.values()),
            cross_discipline_detected=False,
            affected_nodes=source_count,
        )
    )
    if not risk.requires_escalation:
        return None
    candidate = ResolutionCandidate(
        candidate_id=_stable_id("CANDIDATE", type_node.node_id, candidate_count, *occurrence_ids),
        project_id=project_id,
        source_node_ids=sorted(reference_ids),
        target_node_ids=[type_node.node_id, *sorted(occurrence_ids)],
        relation_hint="POSSIBLY_SAME_AS" if len(occurrence_ids) > 1 else None,
        context={
            "element_code": code,
            "discipline": type_node.discipline,
            "candidate_count": candidate_count,
            "risk_score": risk.score,
            "risk_band": risk.band,
            "escalation_reasons": list(risk.escalation_reasons),
            "source_pages": sorted(
                source.source_ref.page_index + 1 for source in sources
            ),
        },
    )
    return EscalationRequest(candidate=candidate, risk=risk)


def resolve_cross_sheet(
    patches: Sequence[SheetKnowledgePatch],
    aliases: AliasResolution,
) -> CrossSheetResolution:
    """Resolve source labels into conservative occurrences without provider decisions."""

    sources_by_type: dict[str, list[_TypeSource]] = {}
    missing_information: list[str] = []

    for patch in sorted(patches, key=lambda item: (item.document_id, item.page_index, item.sheet_id)):
        if patch.missing_evidence_refs:
            missing_information.append(
                f"{patch.sheet_id} page {patch.page_index + 1}: unresolved evidence refs "
                f"{', '.join(sorted(set(patch.missing_evidence_refs)))}"
            )
        for reference in sorted(set(patch.unresolved_references)):
            missing_information.append(
                f"{patch.sheet_id} page {patch.page_index + 1}: unresolved reference {reference}"
            )
        for label in sorted(set(patch.unclassified)):
            missing_information.append(
                f"{patch.sheet_id} page {patch.page_index + 1}: unclassified {label}"
            )

    for type_node in sorted(aliases.nodes, key=lambda item: item.node_id):
        for patch in sorted(patches, key=lambda item: (item.document_id, item.page_index, item.sheet_id)):
            if patch.discipline != type_node.discipline:
                continue
            for fact in patch.facts:
                if (
                    fact.category != "element_labels"
                    or normalize_element_code(fact.normalized or fact.raw) != type_node.canonical_name
                ):
                    continue
                source_ref = NodeSourceRef(
                    document_id=patch.document_id,
                    page_index=patch.page_index,
                    sheet_id=patch.sheet_id,
                    evidence_refs=sorted(set(fact.evidence_refs)),
                )
                level, space = _source_context(patch, type_node.canonical_name, source_ref)
                sources_by_type.setdefault(type_node.node_id, []).append(
                    _TypeSource(
                        type_node=type_node,
                        patch=patch,
                        source_ref=source_ref,
                        level=level,
                        space=space,
                    )
                )

    nodes: list[ProjectGraphNode] = []
    edges: list[ProjectGraphEdge] = []
    escalation_requests: list[EscalationRequest] = []

    for type_node_id, sources in sorted(sources_by_type.items()):
        sources = sorted(sources, key=lambda item: _source_key(item.source_ref))
        type_node = sources[0].type_node
        reference_ids: list[str] = []
        contexts: dict[tuple[str, str], list[_TypeSource]] = {}

        for source in sources:
            reference_node = _reference_node(type_node, source.source_ref)
            reference_ids.append(reference_node.node_id)
            nodes.append(reference_node)
            edges.append(
                ProjectGraphEdge(
                    edge_id=_stable_id("EDGE", reference_node.node_id, type_node.node_id, "SAME_AS"),
                    source=reference_node.node_id,
                    target=type_node.node_id,
                    relation="SAME_AS",
                    confidence_class="CROSS_SHEET_INFERRED",
                    confidence=type_node.confidence,
                    evidence_refs=list(source.source_ref.evidence_refs),
                    resolver=EdgeResolver(method="deterministic_exact_code"),
                )
            )
            sheet_node = next(
                (node for node in source.patch.nodes if node.type == "sheet"),
                None,
            )
            if sheet_node is not None:
                edges.append(
                    ProjectGraphEdge(
                        edge_id=_stable_id(
                            "EDGE",
                            reference_node.node_id,
                            sheet_node.node_id,
                            "DEPICTED_IN",
                        ),
                        source=reference_node.node_id,
                        target=sheet_node.node_id,
                        relation="DEPICTED_IN",
                        confidence_class="EXTRACTED",
                        confidence=type_node.confidence,
                        evidence_refs=list(source.source_ref.evidence_refs),
                        resolver=EdgeResolver(method="deterministic_exact_code"),
                    )
                )
            if source.level is None or source.space is None:
                missing_information.append(
                    f"{type_node.canonical_name} on {source.source_ref.sheet_id} page "
                    f"{source.source_ref.page_index + 1} requires {_context_missing_reason(source)} "
                    "before occurrence synthesis"
                )
                continue
            contexts.setdefault((source.level.key, source.space.key), []).append(source)

        occurrence_ids: list[str] = []
        for context_key, context_sources in sorted(contexts.items()):
            level = context_sources[0].level
            space = context_sources[0].space
            assert level is not None and space is not None
            level_refs = [
                _source_ref_with_evidence(source.source_ref, source.level.evidence_refs)
                for source in context_sources
                if source.level is not None
            ]
            space_refs = [
                _source_ref_with_evidence(source.source_ref, source.space.evidence_refs)
                for source in context_sources
                if source.space is not None
            ]
            level_node = _level_node(aliases.project_id, level, level_refs)
            space_node = _space_node(
                aliases.project_id,
                type_node.discipline,
                level_node,
                space,
                space_refs,
            )
            occurrence = _occurrence_node(type_node, level_node, space_node, context_sources)
            nodes.extend((level_node, space_node, occurrence))
            occurrence_ids.append(occurrence.node_id)
            edges.extend(
                (
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", occurrence.node_id, type_node.node_id, "INSTANCE_OF"),
                        source=occurrence.node_id,
                        target=type_node.node_id,
                        relation="INSTANCE_OF",
                        confidence_class="CROSS_SHEET_INFERRED",
                        confidence=occurrence.confidence,
                        evidence_refs=sorted(
                            {
                                evidence_ref
                                for source_ref in occurrence.source_refs
                                for evidence_ref in source_ref.evidence_refs
                            }
                        ),
                        resolver=EdgeResolver(method="deterministic_occurrence_context"),
                    ),
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", occurrence.node_id, level_node.node_id, "LOCATED_ON"),
                        source=occurrence.node_id,
                        target=level_node.node_id,
                        relation="LOCATED_ON",
                        confidence_class="CROSS_SHEET_INFERRED",
                        confidence=occurrence.confidence,
                        evidence_refs=sorted(
                            {
                                evidence_ref
                                for source_ref in level_node.source_refs
                                for evidence_ref in source_ref.evidence_refs
                            }
                        ),
                        resolver=EdgeResolver(method="deterministic_occurrence_context"),
                    ),
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", occurrence.node_id, space_node.node_id, "LOCATED_IN"),
                        source=occurrence.node_id,
                        target=space_node.node_id,
                        relation="LOCATED_IN",
                        confidence_class="CROSS_SHEET_INFERRED",
                        confidence=occurrence.confidence,
                        evidence_refs=sorted(
                            {
                                evidence_ref
                                for source_ref in space_node.source_refs
                                for evidence_ref in source_ref.evidence_refs
                            }
                        ),
                        resolver=EdgeResolver(method="deterministic_occurrence_context"),
                    ),
                )
            )

        for alternate_id in sorted(occurrence_ids)[1:]:
            primary_id = sorted(occurrence_ids)[0]
            edges.append(
                ProjectGraphEdge(
                    edge_id=_stable_id("EDGE", primary_id, alternate_id, "POSSIBLY_SAME_AS"),
                    source=primary_id,
                    target=alternate_id,
                    relation="POSSIBLY_SAME_AS",
                    confidence_class="AMBIGUOUS",
                    confidence=0.5,
                    evidence_refs=sorted(
                        {
                            evidence_ref
                            for occurrence_id in (primary_id, alternate_id)
                            for occurrence in nodes
                            if occurrence.node_id == occurrence_id
                            for source_ref in occurrence.source_refs
                            for evidence_ref in source_ref.evidence_refs
                        }
                    ),
                    resolver=EdgeResolver(method="conservative_occurrence_split"),
                )
            )

        candidate_count = max(1, len(contexts) + sum(source.level is None or source.space is None for source in sources))
        request = _escalation_request(
            aliases.project_id,
            type_node,
            sources,
            occurrence_ids,
            reference_ids,
            candidate_count,
        )
        if request is not None:
            escalation_requests.append(request)

    return CrossSheetResolution(
        nodes=tuple(sorted(nodes, key=lambda item: item.node_id)),
        edges=tuple(sorted(edges, key=lambda item: item.edge_id)),
        missing_information=tuple(sorted(set(missing_information))),
        escalation_requests=tuple(
            sorted(escalation_requests, key=lambda item: item.candidate.candidate_id)
        ),
    )
