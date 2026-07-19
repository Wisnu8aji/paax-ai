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
    aliases: tuple[str, ...] = ()
    properties: tuple[tuple[str, str], ...] = ()
    requires_review: bool = False


@dataclass(frozen=True)
class _TypeSource:
    type_node: ProjectGraphNode
    patch: SheetKnowledgePatch
    source_ref: NodeSourceRef
    level: _FactValue | None
    space: _FactValue | None
    grid: _FactValue | None = None
    level_requires_review: bool = False


_PHYSICAL_BASIS_CATEGORIES = frozenset({"symbols", "geometry_descriptions"})
_LEGEND_MARKERS = re.compile(r"\b(?:legend|notasi|keterangan|simbol)\b", re.IGNORECASE)


_CODE_BOUNDARY = re.compile(r"(?<![A-Z0-9]){code}(?![A-Z0-9])")
# [\s\-]* (not \s*) tolerates "LT-2" alongside "LT.2"/"LT 2"/"LANTAI 2" -- real
# fixture anchor: page 47 titled "DENAH BALOK LINTEL LT-2" was missed by the
# space-only pattern and fell back to unspecified_level despite an
# unambiguous level marker being right there in the title.
_TITLE_LEVEL = re.compile(
    r"\b(?P<level>(?:LT\.?|LANTAI)[\s\-]*(?P<token>\d+|ATAP|ROOF|DASAR)"
    r"(?P<qualifier>[\s\-]+P\b(?:\s*[+\-\u00b1\u0105]\s*\d+(?:[.,]\d+)?)?)?)",
    re.IGNORECASE,
)
_TITLE_SCHEDULE = re.compile(r"\b(?:TABEL|SCHEDULE)\b", re.IGNORECASE)
_TITLE_SECTION = re.compile(r"\b(?:POTONGAN|TAMPAK|SECTION|ELEVATION)\b", re.IGNORECASE)


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
        if (
            category == "levels"
            and fact.attributes.get("level_classification")
            in {"NUMBER_NOISE", "ELEVATION_AMBIGUOUS"}
        ):
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
            aliases=tuple(
                alias for alias in fact.attributes.get("level_aliases", "").split(" | ") if alias
            ),
            properties=tuple(
                (key, value)
                for key, value in (
                    ("merged_from", fact.attributes.get("level_merged_from")),
                )
                if value
            ),
            requires_review=fact.attributes.get("level_classification") in {
                "FLOOR_NAME_AMBIGUOUS",
                "ELEVATION_AMBIGUOUS",
                "NUMBER_NOISE",
            },
        )
        existing = values.get(key)
        if existing is None:
            values[key] = candidate
            continue
        bboxes = [bbox for bbox in (existing.bbox, candidate.bbox) if bbox is not None]
        properties_by_key: dict[str, set[str]] = {}
        for property_key, property_value in (*existing.properties, *candidate.properties):
            properties_by_key.setdefault(property_key, set()).update(
                value.strip() for value in property_value.split(" | ") if value.strip()
            )
        values[key] = _FactValue(
            key=key,
            display=min(existing.display, candidate.display, key=lambda item: (item.casefold(), item)),
            confidence=min(existing.confidence, candidate.confidence),
            evidence_refs=tuple(sorted(set(existing.evidence_refs) | set(candidate.evidence_refs))),
            bbox=min(bboxes) if bboxes else None,
            aliases=tuple(sorted(set(existing.aliases) | set(candidate.aliases), key=str.casefold)),
            properties=tuple(
                (property_key, " | ".join(sorted(property_values, key=str.casefold)))
                for property_key, property_values in sorted(properties_by_key.items())
            ),
            requires_review=existing.requires_review or candidate.requires_review,
        )
    return tuple(
        value for _, value in sorted(values.items())
    )


_MAX_DIMENSION_LINK_DISTANCE = 120.0
_MAX_DIMENSION_LINK_DISTANCE_NORMALIZED = 0.05


def _nearest_dimension(
    element_bbox: tuple[float, float, float, float] | None,
    patch: SheetKnowledgePatch,
) -> tuple[str, tuple[float, float, float, float], float, tuple[str, ...], EdgeResolver, str] | None:
    """Find the nearest dimension fact using constraint resolver."""
    if element_bbox is None:
        return None
    candidates = [
        fact
        for fact in patch.facts
        if fact.category == "dimensions" and fact.bbox is not None and (fact.normalized or fact.raw).strip()
    ]
    if not candidates:
        return None

    transform = getattr(patch, "page_transform", None)
    if transform is not None:
        if isinstance(transform, dict):
            from app.perception.coordinate_transform import PageTransform
            transform = PageTransform(**transform)

    # We need to extract view bboxes and table bboxes from patch
    views = [node for node in patch.nodes if node.type == "view"]
    table_bboxes = [
        fact.bbox for fact in patch.facts
        if fact.category == "tables" and fact.bbox is not None
    ]

    cand_dicts = []
    for fact in candidates:
        display = (fact.normalized or fact.raw).strip()
        cand_dicts.append({
            "node_id": fact.fact_id,
            "bbox": fact.bbox,
            "confidence": fact.confidence,
            "status": fact.status,
            "display": display,
            "evidence_refs": tuple(sorted(set(fact.evidence_refs)))
        })

    from app.project_graph.constraint_resolver import resolve_candidates
    max_dist = _MAX_DIMENSION_LINK_DISTANCE_NORMALIZED if transform is not None else _MAX_DIMENSION_LINK_DISTANCE

    best_cand, state, scored = resolve_candidates(
        source_bbox=element_bbox,
        candidates=cand_dicts,
        relation_type="label_to_dimension",
        transform=transform,
        views=views,
        table_bboxes=table_bboxes,
        max_distance=max_dist,
    )

    if best_cand is None or state in {"rejected", "ambiguous"}:
        return None

    candidates_considered = len(candidates)
    passed_constraints = []
    failed_constraints = []
    score_breakdown = {}
    rejected_candidate_ids = []
    confidence_calibration = {}

    for s in scored:
        if s.score <= 0.0:
            rejected_candidate_ids.append(s.target_node_id)
        if s.target_node_id == best_cand["node_id"]:
            passed_constraints = s.passed_constraints
            failed_constraints = s.failed_constraints
            score_breakdown = s.score_breakdown
            confidence_calibration = s.confidence_calibration

    resolver_meta = EdgeResolver(
        method="constraint_scored_binding_v2",
        resolver_version="2.0.0",
        candidates_considered=candidates_considered,
        score_breakdown=score_breakdown,
        passed_constraints=passed_constraints,
        failed_constraints=failed_constraints,
        rejected_candidate_ids=rejected_candidate_ids,
        confidence_calibration=confidence_calibration,
    )

    return (
        best_cand["display"],
        best_cand["bbox"],
        best_cand["confidence"],
        best_cand["evidence_refs"],
        resolver_meta,
        state
    )


def _dimension_node_id(patch: SheetKnowledgePatch, display: str, bbox: tuple[float, float, float, float]) -> str | None:
    """Look up the node_id page_patch.py already assigned to this dimension
    fact via SheetFact.attributes["node_id"] (see page_patch.py) -- avoids
    recomputing _stable_id's position-dependent formula here and risking a
    silent mismatch against the node build_sheet_patch() actually created."""
    fact = next(
        (
            fact
            for fact in patch.facts
            if fact.category == "dimensions"
            and (fact.normalized or fact.raw).strip() == display
            and fact.bbox == bbox
        ),
        None,
    )
    if fact is None:
        return None
    return fact.attributes.get("node_id")


def _sheet_node_by_title(patches: Sequence[SheetKnowledgePatch]) -> dict[str, str]:
    """Index sheet_node_id by normalized title, across all patches. Exact-match
    only (via _text_key, no fuzzy/substring matching) -- a callout like "POTONGAN
    A" must match a sheet titled exactly "POTONGAN A" to be linked; anything
    less exact (most real references, e.g. "Rujukan ke Detail D1" or a room
    name like "R.DOKUMEN") is left as missing_information rather than guessed.
    A title claimed by more than one sheet is dropped entirely (ambiguous,
    e.g. real fixture has both "POTONGAN B" and "POTONGAN - B" as distinct
    titles -- those stay distinct since _text_key doesn't strip punctuation,
    but if two sheets ever did share one exact title, linking to either would
    be a guess)."""
    by_title: dict[str, list[str]] = {}
    for patch in patches:
        sheet_node = next((node for node in patch.nodes if node.type == "sheet"), None)
        if sheet_node is None:
            continue
        title_property = sheet_node.properties.get("title")
        if title_property is None or not str(title_property.value).strip():
            continue
        key = _text_key(str(title_property.value))
        if not key:
            continue
        by_title.setdefault(key, []).append(sheet_node.node_id)
    return {key: node_ids[0] for key, node_ids in by_title.items() if len(node_ids) == 1}


def _reference_fact_node_id(patch: SheetKnowledgePatch, raw_reference: str) -> tuple[str, float, tuple[str, ...]] | None:
    """Look up the node_id + confidence + evidence_refs page_patch.py assigned
    to this "references"-category fact, mirroring _dimension_node_id's
    back-reference pattern via SheetFact.attributes["node_id"]."""
    fact = next(
        (fact for fact in patch.facts if fact.category == "references" and fact.raw == raw_reference),
        None,
    )
    if fact is None:
        return None
    node_id = fact.attributes.get("node_id")
    if node_id is None:
        return None
    return node_id, fact.confidence, tuple(sorted(set(fact.evidence_refs)))


def _sheet_title(patch: SheetKnowledgePatch) -> str:
    identity = next((fact for fact in patch.facts if fact.category == "sheet_identity"), None)
    return "" if identity is None else identity.attributes.get("title", "")


def _is_occurrence_excluded_sheet(patch: SheetKnowledgePatch) -> bool:
    """Schedules define types and sections/elevations span levels, so neither
    creates a located occurrence. Their drawing references remain intact."""
    title = _sheet_title(patch)
    return (
        _TITLE_SCHEDULE.search(title) is not None
        or _TITLE_SECTION.search(title) is not None
        or any(fact.category == "tables" for fact in patch.facts)
    )


def _title_level(
    patch: SheetKnowledgePatch,
    levels: Sequence[_FactValue],
) -> _FactValue | None:
    identity = next((fact for fact in patch.facts if fact.category == "sheet_identity"), None)
    if identity is None:
        return None
    title = identity.attributes.get("title", "")
    match = _TITLE_LEVEL.search(title)
    if match is None:
        return None
    title_candidate = match.group("level")
    title_candidate_key = _text_key(title_candidate)
    for level in levels:
        canonical_keys = {level.key, *(_text_key(alias) for alias in level.aliases)}
        if title_candidate_key in canonical_keys:
            return level

    # A qualified title must be backed by the canonicalized level facts.  This
    # prevents its qualifier/elevation from being discarded by a title-only
    # fallback such as "Atap".
    if match.group("qualifier"):
        return None

    token = match.group("token").upper()
    if token.isdigit():
        display = f"Lantai {token}"
    elif token in {"ATAP", "ROOF"}:
        display = "Atap"
    else:
        display = "Substruktur"
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


def _physical_basis_facts(
    patch: SheetKnowledgePatch, source_ref: NodeSourceRef
) -> tuple[object, ...]:
    """Return symbol/geometry facts that can anchor a physical candidate.

    Labels, schedules, legends, and context groups are deliberately not a
    physical basis. A basis must have both a locator (bbox) and evidence so the
    gate fails closed when DEM extraction is incomplete.
    """
    label_refs = set(source_ref.evidence_refs)
    label_bboxes = [
        fact.bbox
        for fact in patch.facts
        if fact.category == "element_labels"
        and fact.bbox is not None
        and label_refs & set(fact.evidence_refs)
    ]

    def overlaps(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> bool:
        return left[0] <= right[2] and right[0] <= left[2] and left[1] <= right[3] and right[1] <= left[3]

    def reasonable_basis_bbox(bbox: tuple[float, float, float, float]) -> bool:
        if not label_bboxes:
            return False
        basis_area = max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1])
        return any(
            overlaps(bbox, label_bbox)
            and basis_area <= max(1.0, (label_bbox[2] - label_bbox[0]) * (label_bbox[3] - label_bbox[1])) * 4
            for label_bbox in label_bboxes
        )
    return tuple(
        fact
        for fact in patch.facts
        if fact.category in _PHYSICAL_BASIS_CATEGORIES
        and fact.bbox is not None
        and fact.evidence_refs
        and _LEGEND_MARKERS.search(fact.raw) is None
        # Symbol/geometry evidence is commonly a distinct DEM item from the
        # text label. Use deterministic bbox overlap to associate them; patch
        # co-location alone would incorrectly bind legends and notes to every
        # label on a sheet.
        and reasonable_basis_bbox(fact.bbox)
    )


def _human_verified_physical_basis(
    patch: SheetKnowledgePatch, source_ref: NodeSourceRef, basis_fact: object
) -> bool:
    """Promote only an explicitly human-verified, conflict-free candidate."""
    if patch.conflicts:
        return False
    relevant = [
        fact
        for fact in patch.facts
        if fact.category in {"element_labels", "levels", "spaces"}
        and (
            fact.category != "element_labels"
            or set(fact.evidence_refs) & set(source_ref.evidence_refs)
        )
    ]
    return bool(relevant) and all(
        fact.status == "human_verified" for fact in (*relevant, basis_fact)
    )


def _physical_candidate_node(
    type_node: ProjectGraphNode,
    source: _TypeSource,
    level_node: ProjectGraphNode,
    space_node: ProjectGraphNode | None,
    grid_node: ProjectGraphNode | None,
    basis_fact: object,
) -> ProjectGraphNode:
    assert source.level is not None
    locator = space_node or grid_node
    assert locator is not None
    evidence_refs = sorted(
        set(source.source_ref.evidence_refs)
        | set(basis_fact.evidence_refs)
        | set(source.level.evidence_refs)
    )
    verified = _human_verified_physical_basis(source.patch, source.source_ref, basis_fact)
    status = "human_verified" if verified else "cross_sheet_inferred"
    return ProjectGraphNode(
        node_id=_stable_id(
            "PHYS", type_node.node_id, source.patch.document_id,
            source.patch.page_index, source.source_ref.sheet_id,
            source.level.key,
            source.space.key if source.space is not None else None,
            source.grid.key if source.grid is not None else None,
            basis_fact.fact_id,
        ),
        type="physical_element" if verified else "physical_element_candidate",
        canonical_name=f"{type_node.canonical_name} @ {source.level.display} / {locator.canonical_name}",
        properties={
            "element_type_id": NodeProperty(value=type_node.node_id, evidence_refs=evidence_refs),
            "view_id": NodeProperty(value=source.patch.sheet_id, evidence_refs=evidence_refs),
            "level": NodeProperty(value=source.level.display, evidence_refs=list(source.level.evidence_refs)),
            "spatial_locator": NodeProperty(value=locator.canonical_name, evidence_refs=evidence_refs),
            "basis_kind": NodeProperty(value=basis_fact.category, evidence_refs=list(basis_fact.evidence_refs)),
            "occurrence_semantics": NodeProperty(value="physical_instance", evidence_refs=evidence_refs),
            "physical_count_eligible": NodeProperty(value=verified, evidence_refs=evidence_refs),
        },
        discipline=type_node.discipline,
        verification_status=status,
        confidence=min(type_node.confidence, source.level.confidence, basis_fact.confidence),
        source_refs=_merge_source_refs([source.source_ref]),
    )


def _nearest_value(
    source_bbox: tuple[float, float, float, float] | None,
    values: Sequence[_FactValue],
    patch: Optional[SheetKnowledgePatch] = None,
    relation_type: str = "element_to_value",
) -> _FactValue | None:
    if source_bbox is None:
        return None
    candidates = [value for value in values if value.bbox is not None]
    if not candidates:
        return None
        
    if patch is not None:
        cand_dicts = []
        for val in candidates:
            cand_dicts.append({
                "node_id": val.key,
                "bbox": val.bbox,
                "confidence": val.confidence,
                "status": "human_verified" if getattr(val, "status", None) == "human_verified" else "extracted",
                "val": val
            })
            
        from app.project_graph.constraint_resolver import resolve_candidates
        transform = getattr(patch, "page_transform", None)
        views = [node for node in patch.nodes if node.type == "view"]
        table_bboxes = [
            f.bbox for f in patch.facts
            if f.category == "tables" and f.bbox is not None
        ]
        
        best_cand, state, scored = resolve_candidates(
            source_bbox=source_bbox,
            candidates=cand_dicts,
            relation_type=relation_type,
            transform=transform,
            views=views,
            table_bboxes=table_bboxes,
            max_distance=300.0,
        )
        if best_cand is not None and state not in {"rejected", "ambiguous"}:
            return best_cand["val"]
            
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
    discipline: str,
) -> tuple[_FactValue | None, _FactValue | None, _FactValue | None, bool]:
    source_bbox = _element_bbox(patch, code, source_ref)
    levels = _fact_values(patch, "levels")
    spaces = _fact_values(patch, "spaces")
    level = _title_level(patch, levels)
    if level is None:
        level = _nearest_value(source_bbox, levels, patch, "element_to_level")
    space = _nearest_value(source_bbox, spaces, patch, "element_to_space")
    grid = _nearest_value(source_bbox, _fact_values(patch, "grids"), patch, "element_to_grid") if discipline == "structure" else None
    requires_review = level is not None and level.requires_review
    if level is None:
        requires_review = any(
            fact.category == "levels"
            and fact.attributes.get("level_classification") in {"NUMBER_NOISE", "ELEVATION_AMBIGUOUS"}
            for fact in patch.facts
        )
    return level, space, grid, requires_review


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
        aliases=list(level.aliases),
        properties={
            "normalized_key": NodeProperty(value=level.key, evidence_refs=list(level.evidence_refs)),
            **{
                key: NodeProperty(value=value, evidence_refs=list(level.evidence_refs))
                for key, value in level.properties
            },
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


def _grid_node(
    project_id: str,
    discipline: str,
    level_node: ProjectGraphNode,
    grid: _FactValue,
    source_refs: Iterable[NodeSourceRef],
) -> ProjectGraphNode:
    return ProjectGraphNode(
        node_id=_stable_id("GRIDLOC", project_id, discipline, level_node.node_id, grid.key),
        type="grid_axis",
        canonical_name=grid.display,
        properties={"normalized_key": NodeProperty(value=grid.key, evidence_refs=list(grid.evidence_refs))},
        discipline=discipline,
        verification_status="extracted",
        confidence=grid.confidence,
        source_refs=_merge_source_refs(source_refs),
    )


def _occurrence_node(
    type_node: ProjectGraphNode,
    level_node: ProjectGraphNode,
    space_node: ProjectGraphNode | None,
    sources: Sequence[_TypeSource],
    *,
    grid_node: ProjectGraphNode | None = None,
    verification_status: str = "cross_sheet_inferred",
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
    base_confidence = min(source.type_node.confidence for source in sources)
    is_generic_level = any(s.level is not None and s.level.key.startswith("unmapped") for s in sources)
    is_generic_space = any(s.space is not None and s.space.key.startswith("unmapped") for s in sources)
    if is_generic_level or is_generic_space:
        penalty_level = 0.2 if is_generic_level else 0.0
        penalty_space = 0.3 if is_generic_space else 0.0
        confidence = round(base_confidence * (1.0 - penalty_level - penalty_space), 4)
    else:
        confidence = base_confidence

    if verification_status == "ambiguous":
        confidence = round(confidence * 0.7, 4)

    locator_node = space_node or grid_node
    node_id_parts = [type_node.node_id, level_node.node_id]
    node_id_parts.append(locator_node.node_id if locator_node is not None else sources[0].source_ref.sheet_id)
    canonical_name = f"{type_node.canonical_name} @ {level_node.canonical_name}"
    if locator_node is not None:
        canonical_name += f" / {locator_node.canonical_name}"
    properties = {
        "element_type_id": NodeProperty(value=type_node.node_id, evidence_refs=label_evidence_refs),
        "level": NodeProperty(value=level_node.canonical_name, evidence_refs=level_evidence_refs),
        # Count comes only from the distinct extracted label sources grouped
        # into this deterministic context; it is never a quantity takeoff.
        "label_count": NodeProperty(value=len(sources), evidence_refs=label_evidence_refs),
        "occurrence_semantics": NodeProperty(
            value="context_group_not_physical", evidence_refs=label_evidence_refs
        ),
        "physical_count_eligible": NodeProperty(value=False, evidence_refs=label_evidence_refs),
    }
    if space_node is not None:
        properties["space"] = NodeProperty(value=space_node.canonical_name, evidence_refs=space_evidence_refs)
    if grid_node is not None:
        properties["grid"] = NodeProperty(
            value=grid_node.canonical_name,
            evidence_refs=sorted(
                {
                    evidence_ref
                    for source in sources
                    if source.grid is not None
                    for evidence_ref in source.grid.evidence_refs
                }
            ),
        )
    return ProjectGraphNode(
        node_id=_stable_id("ELOCC", *node_id_parts),
        type="element_occurrence",
        canonical_name=canonical_name,
        properties=properties,
        discipline=type_node.discipline,
        verification_status=verification_status,
        confidence=confidence,
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
    reference_edges: list[ProjectGraphEdge] = []
    sheet_node_by_title = _sheet_node_by_title(patches)

    for patch in sorted(patches, key=lambda item: (item.document_id, item.page_index, item.sheet_id)):
        if patch.missing_evidence_refs:
            missing_information.append(
                f"{patch.sheet_id} page {patch.page_index + 1}: unresolved evidence refs "
                f"{', '.join(sorted(set(patch.missing_evidence_refs)))}"
            )
        this_patch_sheet_node_id = next(
            (node.node_id for node in patch.nodes if node.type == "sheet"), None
        )
        for reference in sorted(set(patch.unresolved_references)):
            sheet_nodes = [node for p in patches for node in p.nodes if node.type == "sheet"]
            cand_dicts = []
            for sheet_node in sheet_nodes:
                title_prop = sheet_node.properties.get("title")
                title_val = str(title_prop.value) if title_prop else ""
                match = _text_key(reference) == _text_key(title_val)
                cand_dicts.append({
                    "node_id": sheet_node.node_id,
                    "confidence": sheet_node.confidence,
                    "status": sheet_node.verification_status,
                    "title": title_val,
                    "match": match
                })
            
            from app.project_graph.constraint_resolver import resolve_candidates
            best_cand, state, scored = resolve_candidates(
                source_bbox=None,
                candidates=cand_dicts,
                relation_type="reference_to_detail",
                legend_match_func=lambda c: c["match"],
                discipline_match_func=lambda c: True,
            )
            
            reference_fact = _reference_fact_node_id(patch, reference)
            if best_cand is not None and best_cand["node_id"] != this_patch_sheet_node_id and reference_fact is not None and state != "rejected":
                reference_node_id, reference_confidence, reference_evidence_refs = reference_fact
                
                candidates_considered = len(sheet_nodes)
                passed_constraints = []
                failed_constraints = []
                score_breakdown = {}
                confidence_calibration = {}
                for s in scored:
                    if s.target_node_id == best_cand["node_id"]:
                        passed_constraints = s.passed_constraints
                        failed_constraints = s.failed_constraints
                        score_breakdown = s.score_breakdown
                        confidence_calibration = s.confidence_calibration

                resolver_meta = EdgeResolver(
                    method="constraint_scored_binding_v2",
                    resolver_version="2.0.0",
                    candidates_considered=candidates_considered,
                    score_breakdown=score_breakdown,
                    passed_constraints=passed_constraints,
                    failed_constraints=failed_constraints,
                    confidence_calibration=confidence_calibration,
                )
                
                reference_edges.append(
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", reference_node_id, best_cand["node_id"], "REFERENCES"),
                        source=reference_node_id,
                        target=best_cand["node_id"],
                        relation="REFERENCES",
                        confidence_class="AMBIGUOUS" if state == "ambiguous" else "CROSS_SHEET_INFERRED",
                        confidence=reference_confidence,
                        evidence_refs=list(reference_evidence_refs),
                        resolver=resolver_meta,
                        resolution_state=state,
                    )
                )
            else:
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
                level, space, grid, level_requires_review = _source_context(
                    patch, type_node.canonical_name, source_ref, type_node.discipline
                )
                sources_by_type.setdefault(type_node.node_id, []).append(
                    _TypeSource(
                        type_node=type_node,
                        patch=patch,
                        source_ref=source_ref,
                        level=level,
                        space=space,
                        grid=grid,
                        level_requires_review=level_requires_review,
                    )
                )

    nodes: list[ProjectGraphNode] = []
    edges: list[ProjectGraphEdge] = list(reference_edges)
    escalation_requests: list[EscalationRequest] = []

    for type_node_id, sources in sorted(sources_by_type.items()):
        sources = sorted(sources, key=lambda item: _source_key(item.source_ref))
        type_node = sources[0].type_node
        reference_ids: list[str] = []
        contexts: dict[tuple[str, str], list[_TypeSource]] = {}
        occurrence_sources = [
            source for source in sources if not _is_occurrence_excluded_sheet(source.patch)
        ]
        has_contextual = any(
            source.level is not None
            and (source.space is not None or type_node.discipline != "architecture")
            for source in occurrence_sources
        )


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
                    resolver=EdgeResolver(
                        method="deterministic_exact_code",
                        confidence_calibration={
                            "ocr_score": round(type_node.confidence, 4),
                            "detector_score": 1.0,
                            "geometry_score": 1.0,
                            "legend_score": 1.0,
                            "schedule_score": 1.0,
                            "consistency_score": 1.0,
                            "calibrated_score": round(type_node.confidence, 4),
                        },
                    ),
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
                        resolver=EdgeResolver(
                            method="deterministic_exact_code",
                            confidence_calibration={
                                "ocr_score": round(type_node.confidence, 4),
                                "detector_score": 1.0,
                                "geometry_score": 1.0,
                                "legend_score": 1.0,
                                "schedule_score": 1.0,
                                "consistency_score": 1.0,
                                "calibrated_score": round(type_node.confidence, 4),
                            },
                        ),
                    )
                )
            element_bbox = _element_bbox(source.patch, type_node.canonical_name, source.source_ref)
            nearest_dimension = _nearest_dimension(element_bbox, source.patch)
            if nearest_dimension is not None:
                dim_display, dim_bbox, dim_confidence, dim_evidence_refs, dim_resolver, dim_state = nearest_dimension
                dim_node_id = _dimension_node_id(source.patch, dim_display, dim_bbox)
                if dim_node_id is not None:
                    edges.append(
                        ProjectGraphEdge(
                            edge_id=_stable_id("EDGE", reference_node.node_id, dim_node_id, "HAS_DIMENSION"),
                            source=reference_node.node_id,
                            target=dim_node_id,
                            relation="HAS_DIMENSION",
                            confidence_class="AMBIGUOUS" if dim_state == "ambiguous" else "CROSS_SHEET_INFERRED",
                            confidence=min(type_node.confidence, dim_confidence),
                            evidence_refs=list(dim_evidence_refs),
                            resolver=dim_resolver,
                            resolution_state=dim_state,
                        )
                    )

            if _is_occurrence_excluded_sheet(source.patch):
                continue

            if source.level is not None and source.space is None and type_node.discipline == "structure":
                locator = (
                    f"grid:{source.grid.key}" if source.grid is not None
                    else f"sheet:{source.source_ref.sheet_id}"
                )
                contexts.setdefault((source.level.key, locator), []).append(source)
                continue

            if source.level is not None and source.space is None and type_node.discipline == "mep":
                contexts.setdefault((source.level.key, f"sheet:{source.source_ref.sheet_id}"), []).append(source)
                continue

            if source.level is None or source.space is None:
                if not has_contextual and not source.level_requires_review:
                    missing_information.append(
                        f"{type_node.canonical_name} on {source.source_ref.sheet_id} page "
                        f"{source.source_ref.page_index + 1} requires {_context_missing_reason(source)} "
                        "before occurrence synthesis"
                    )
                    continue

                if source.level is None and source.space is None:
                    sheet_id = source.source_ref.sheet_id
                    page_index = source.source_ref.page_index
                    fallback_level_key = f"unmapped_{sheet_id}_p{page_index}"
                    fallback_space_key = f"unmapped_{sheet_id}_p{page_index}"
                    fallback_level_display = f"Lantai Tidak Terpetakan ({sheet_id} hal. {page_index + 1})"
                    fallback_space_display = f"Ruang Tidak Terpetakan ({sheet_id} hal. {page_index + 1})"
                else:
                    fallback_level_key = "unmapped"
                    fallback_space_key = "unmapped"
                    fallback_level_display = "Lantai Tidak Terpetakan"
                    fallback_space_display = "Ruang Tidak Terpetakan"

                fallback_level = source.level or _FactValue(
                    key=fallback_level_key,
                    display=fallback_level_display,
                    confidence=0.5,
                    evidence_refs=(),
                    bbox=None,
                )
                fallback_space = source.space or _FactValue(
                    key=fallback_space_key,
                    display=fallback_space_display,
                    confidence=0.5,
                    evidence_refs=(),
                    bbox=None,
                )
                generic_source = _TypeSource(
                    type_node=source.type_node,
                    patch=source.patch,
                    source_ref=source.source_ref,
                    level=fallback_level,
                    space=fallback_space,
                    level_requires_review=source.level_requires_review,
                )
                contexts.setdefault(
                    (fallback_level.key, f"space:{fallback_space.key}"), []
                ).append(generic_source)
            else:
                contexts.setdefault((source.level.key, f"space:{source.space.key}"), []).append(source)

        occurrence_ids: list[str] = []
        for context_key, context_sources in sorted(contexts.items()):
            _, locator_token = context_key
            locator_kind, _, _ = locator_token.partition(":")
            level = context_sources[0].level
            assert level is not None
            level_refs = [
                _source_ref_with_evidence(source.source_ref, source.level.evidence_refs)
                for source in context_sources
                if source.level is not None
            ]
            level_node = _level_node(aliases.project_id, level, level_refs)
            space_node: ProjectGraphNode | None = None
            grid_node: ProjectGraphNode | None = None
            verification_status = (
                "ambiguous" if any(source.level_requires_review for source in context_sources)
                else "cross_sheet_inferred"
            )
            if locator_kind == "space":
                space = context_sources[0].space
                assert space is not None
                space_refs = [
                    _source_ref_with_evidence(source.source_ref, source.space.evidence_refs)
                    for source in context_sources
                    if source.space is not None
                ]
                space_node = _space_node(
                    aliases.project_id, type_node.discipline, level_node, space, space_refs
                )
            elif locator_kind == "grid":
                grid = context_sources[0].grid
                assert grid is not None
                grid_refs = [
                    _source_ref_with_evidence(source.source_ref, source.grid.evidence_refs)
                    for source in context_sources
                    if source.grid is not None
                ]
                grid_node = _grid_node(
                    aliases.project_id, type_node.discipline, level_node, grid, grid_refs
                )
            elif locator_kind == "sheet":
                # The schema has no "needs_review" status; "ambiguous" is
                # the valid signal that a level+sheet locator needs review.
                verification_status = "ambiguous"
            else:  # pragma: no cover - locator tokens above are exhaustive
                raise AssertionError(f"unexpected occurrence locator {locator_kind!r}")

            occurrence = _occurrence_node(
                type_node,
                level_node,
                space_node,
                context_sources,
                grid_node=grid_node,
                verification_status=verification_status,
            )
            nodes.append(level_node)
            if space_node is not None:
                nodes.append(space_node)
            if grid_node is not None:
                nodes.append(grid_node)
            nodes.append(occurrence)
            occurrence_ids.append(occurrence.node_id)
            locator_edges: list[ProjectGraphEdge] = []
            if space_node is not None:
                locator_edges.append(
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", occurrence.node_id, space_node.node_id, "LOCATED_IN"),
                        source=occurrence.node_id,
                        target=space_node.node_id,
                        relation="LOCATED_IN",
                        confidence_class="CROSS_SHEET_INFERRED",
                        confidence=occurrence.confidence,
                        evidence_refs=sorted(
                            evidence_ref
                            for source_ref in space_node.source_refs
                            for evidence_ref in source_ref.evidence_refs
                        ),
                        resolver=EdgeResolver(
                            method="deterministic_occurrence_context",
                            confidence_calibration={
                                "ocr_score": round(occurrence.confidence, 4),
                                "detector_score": 1.0,
                                "geometry_score": 1.0,
                                "legend_score": 1.0,
                                "schedule_score": 1.0,
                                "consistency_score": 1.0,
                                "calibrated_score": round(occurrence.confidence, 4),
                            },
                        ),
                    )
                )
            if grid_node is not None:
                locator_edges.append(
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", occurrence.node_id, grid_node.node_id, "ALIGNED_TO"),
                        source=occurrence.node_id,
                        target=grid_node.node_id,
                        relation="ALIGNED_TO",
                        confidence_class="CROSS_SHEET_INFERRED",
                        confidence=occurrence.confidence,
                        evidence_refs=sorted(
                            evidence_ref
                            for source_ref in grid_node.source_refs
                            for evidence_ref in source_ref.evidence_refs
                        ),
                        resolver=EdgeResolver(
                            method="deterministic_occurrence_context",
                            confidence_calibration={
                                "ocr_score": round(occurrence.confidence, 4),
                                "detector_score": 1.0,
                                "geometry_score": 1.0,
                                "legend_score": 1.0,
                                "schedule_score": 1.0,
                                "consistency_score": 1.0,
                                "calibrated_score": round(occurrence.confidence, 4),
                            },
                        ),
                    )
                )
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
                        resolver=EdgeResolver(
                            method="deterministic_occurrence_context",
                            confidence_calibration={
                                "ocr_score": round(occurrence.confidence, 4),
                                "detector_score": 1.0,
                                "geometry_score": 1.0,
                                "legend_score": 1.0,
                                "schedule_score": 1.0,
                                "consistency_score": 1.0,
                                "calibrated_score": round(occurrence.confidence, 4),
                            },
                        ),
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
                        resolver=EdgeResolver(
                            method="deterministic_occurrence_context",
                            confidence_calibration={
                                "ocr_score": round(occurrence.confidence, 4),
                                "detector_score": 1.0,
                                "geometry_score": 1.0,
                                "legend_score": 1.0,
                                "schedule_score": 1.0,
                                "consistency_score": 1.0,
                                "calibrated_score": round(occurrence.confidence, 4),
                            },
                        ),
                    ),
                    *locator_edges,
                )
            )

            # A grouped label remains a reference/context group. A separate
            # candidate is created only from a symbol/geometry basis with a
            # real level and spatial locator on a view. Schedules, legends and
            # details never reach this branch because occurrence_sources is
            # filtered above.
            for source in context_sources:
                has_real_locator = (
                    (source.space is not None and not source.space.key.startswith("unmapped"))
                    or source.grid is not None
                )
                if source.level is None or not has_real_locator:
                    continue
                label_bbox = _element_bbox(source.patch, type_node.canonical_name, source.source_ref)
                basis_facts = _physical_basis_facts(source.patch, source.source_ref)
                
                if label_bbox is not None and basis_facts:
                    cand_dicts = []
                    for fact in basis_facts:
                        cand_dicts.append({
                            "node_id": fact.fact_id,
                            "bbox": fact.bbox,
                            "confidence": fact.confidence,
                            "status": fact.status,
                            "fact": fact
                        })
                    
                    from app.project_graph.constraint_resolver import resolve_candidates
                    transform = getattr(source.patch, "page_transform", None)
                    views = [node for node in source.patch.nodes if node.type == "view"]
                    table_bboxes = [
                        f.bbox for f in source.patch.facts
                        if f.category == "tables" and f.bbox is not None
                    ]
                    
                    best_cand, state, scored = resolve_candidates(
                        source_bbox=label_bbox,
                        candidates=cand_dicts,
                        relation_type="label_to_symbol",
                        transform=transform,
                        views=views,
                        table_bboxes=table_bboxes,
                        max_distance=50.0,
                    )
                    
                    if best_cand is not None and state != "rejected":
                        basis_fact = best_cand["fact"]
                        candidate = _physical_candidate_node(
                            type_node, source, level_node, space_node, grid_node, basis_fact
                        )
                        nodes.append(candidate)
                        candidate_evidence = sorted(
                            set(candidate.properties["physical_count_eligible"].evidence_refs)
                        )
                        
                        candidates_considered = len(basis_facts)
                        passed_constraints = []
                        failed_constraints = []
                        score_breakdown = {}
                        rejected_candidate_ids = []
                        confidence_calibration = {}
                        for s in scored:
                            if s.score <= 0.0:
                                rejected_candidate_ids.append(s.target_node_id)
                            if s.target_node_id == best_cand["node_id"]:
                                passed_constraints = s.passed_constraints
                                failed_constraints = s.failed_constraints
                                score_breakdown = s.score_breakdown
                                confidence_calibration = s.confidence_calibration
                                
                        resolver_meta = EdgeResolver(
                            method="constraint_scored_binding_v2",
                            resolver_version="2.0.0",
                            candidates_considered=candidates_considered,
                            score_breakdown=score_breakdown,
                            passed_constraints=passed_constraints,
                            failed_constraints=failed_constraints,
                            rejected_candidate_ids=rejected_candidate_ids,
                            confidence_calibration=confidence_calibration,
                        )
                        
                        edges.extend(
                            (
                                ProjectGraphEdge(
                                    edge_id=_stable_id("EDGE", candidate.node_id, type_node.node_id, "INSTANCE_OF"),
                                    source=candidate.node_id,
                                    target=type_node.node_id,
                                    relation="INSTANCE_OF",
                                    confidence_class="AMBIGUOUS" if state == "ambiguous" else "HUMAN_VERIFIED" if candidate.verification_status == "human_verified" else "CROSS_SHEET_INFERRED",
                                    confidence=candidate.confidence,
                                    evidence_refs=candidate_evidence,
                                    resolver=resolver_meta,
                                    resolution_state=state,
                                ),
                                ProjectGraphEdge(
                                    edge_id=_stable_id("EDGE", candidate.node_id, level_node.node_id, "LOCATED_ON"),
                                    source=candidate.node_id,
                                    target=level_node.node_id,
                                    relation="LOCATED_ON",
                                    confidence_class="AMBIGUOUS" if state == "ambiguous" else "HUMAN_VERIFIED" if candidate.verification_status == "human_verified" else "CROSS_SHEET_INFERRED",
                                    confidence=candidate.confidence,
                                    evidence_refs=candidate_evidence,
                                    resolver=resolver_meta,
                                    resolution_state=state,
                                ),
                                ProjectGraphEdge(
                                    edge_id=_stable_id("EDGE", candidate.node_id, (space_node or grid_node).node_id, "LOCATED_IN" if space_node else "ALIGNED_TO"),
                                    source=candidate.node_id,
                                    target=(space_node or grid_node).node_id,
                                    relation="LOCATED_IN" if space_node else "ALIGNED_TO",
                                    confidence_class="AMBIGUOUS" if state == "ambiguous" else "HUMAN_VERIFIED" if candidate.verification_status == "human_verified" else "CROSS_SHEET_INFERRED",
                                    confidence=candidate.confidence,
                                    evidence_refs=candidate_evidence,
                                    resolver=resolver_meta,
                                    resolution_state=state,
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
                    resolver=EdgeResolver(
                        method="conservative_occurrence_split",
                        confidence_calibration={
                            "ocr_score": 0.5,
                            "detector_score": 1.0,
                            "geometry_score": 1.0,
                            "legend_score": 1.0,
                            "schedule_score": 1.0,
                            "consistency_score": 1.0,
                            "calibrated_score": 0.5,
                        },
                    ),
                )
            )

        candidate_count = max(
            1,
            len(contexts) + sum(
                source.level is None
                or (source.space is None and type_node.discipline == "architecture")
                for source in occurrence_sources
            ),
        )
        request = _escalation_request(
            aliases.project_id,
            type_node,
            occurrence_sources,
            occurrence_ids,
            reference_ids,
            candidate_count,
        ) if occurrence_sources else None
        if request is not None:
            escalation_requests.append(request)

        # Candidate generation for type ↔ schedule row / table
        schedule_tables = [node for p in patches for node in p.nodes if node.type == "schedule_table"]
        if schedule_tables:
            cand_dicts = []
            for table_node in schedule_tables:
                same_sheet = any(s.patch.sheet_id == table_node.source_refs[0].sheet_id for s in sources if s.patch.nodes) if table_node.source_refs else False
                aligned = False
                for source in sources:
                    label_bbox = _element_bbox(source.patch, type_node.canonical_name, source.source_ref)
                    table_fact = next((f for f in source.patch.facts if f.category == "tables"), None)
                    if label_bbox is not None and table_fact is not None and table_fact.bbox is not None:
                        from app.project_graph.constraint_resolver import check_table_row_alignment
                        if check_table_row_alignment(label_bbox, table_fact.bbox, tolerance=50.0):
                            aligned = True
                            break
                            
                cand_dicts.append({
                    "node_id": table_node.node_id,
                    "bbox": table_node.source_refs[0].evidence_refs[0] if (table_node.source_refs and table_node.source_refs[0].evidence_refs) else None,
                    "confidence": table_node.confidence,
                    "status": table_node.verification_status,
                    "same_sheet": same_sheet,
                    "aligned": aligned,
                    "table_node": table_node
                })
                
            from app.project_graph.constraint_resolver import resolve_candidates
            best_table, table_state, table_scored = resolve_candidates(
                source_bbox=None,
                candidates=cand_dicts,
                relation_type="type_to_schedule_row",
                legend_match_func=lambda c: c["same_sheet"],
                schedule_match_func=lambda c: c["aligned"],
            )
            
            if best_table is not None and table_state != "rejected":
                candidates_considered = len(schedule_tables)
                passed_constraints = []
                failed_constraints = []
                score_breakdown = {}
                confidence_calibration = {}
                for s in table_scored:
                    if s.target_node_id == best_table["node_id"]:
                        passed_constraints = s.passed_constraints
                        failed_constraints = s.failed_constraints
                        score_breakdown = s.score_breakdown
                        confidence_calibration = s.confidence_calibration

                resolver_meta = EdgeResolver(
                    method="constraint_scored_binding_v2",
                    resolver_version="2.0.0",
                    candidates_considered=candidates_considered,
                    score_breakdown=score_breakdown,
                    passed_constraints=passed_constraints,
                    failed_constraints=failed_constraints,
                    confidence_calibration=confidence_calibration,
                )
                
                edges.append(
                    ProjectGraphEdge(
                        edge_id=_stable_id("EDGE", type_node.node_id, best_table["node_id"], "DEPICTED_IN"),
                        source=type_node.node_id,
                        target=best_table["node_id"],
                        relation="DEPICTED_IN",
                        confidence_class="AMBIGUOUS" if table_state == "ambiguous" else "CROSS_SHEET_INFERRED",
                        confidence=min(type_node.confidence, best_table["confidence"]),
                        evidence_refs=sorted(set(ref for s in sources for ref in s.source_ref.evidence_refs)),
                        resolver=resolver_meta,
                        resolution_state=table_state,
                    )
                )

    return CrossSheetResolution(
        nodes=tuple(sorted(nodes, key=lambda item: item.node_id)),
        edges=tuple(sorted(edges, key=lambda item: item.edge_id)),
        missing_information=tuple(sorted(set(missing_information))),
        escalation_requests=tuple(
            sorted(escalation_requests, key=lambda item: item.candidate.candidate_id)
        ),
    )
