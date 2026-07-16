from __future__ import annotations

from hashlib import sha256
from typing import Iterable

from app.project_graph.models import EdgeResolver, NodeProperty, NodeSourceRef, ProjectGraphEdge, ProjectGraphNode
from app.project_graph.normalizer import normalize_discipline, normalize_element_code
from app.project_graph.synthesis_types import SheetCompletionState, SheetFact, SheetKnowledgePatch
from app.transcription.models import DemIntegrityReport, DrawingEvidenceSheet, ObservationValue


_OBSERVATION_NODE_TYPES = {
    "texts": "note",
    "dimensions": "dimension",
    "grids": "grid_axis",
    "levels": "level",
    "spaces": "space",
    "element_labels": "element_type",
    "symbols": "specification",
    "tables": "schedule_table",
    "materials": "material",
    "notes": "note",
    "references": "drawing_reference",
    "patterns": "specification",
    "geometry_descriptions": "specification",
}

_STATUS_TO_VERIFICATION = {
    "extracted": "extracted",
    "ai_interpreted": "ai_interpreted",
    "ambiguous": "ambiguous",
    "conflicting": "conflicting",
    "missing": "ambiguous",
    "human_verified": "human_verified",
}

_STATUS_TO_CONFIDENCE = {
    "extracted": "EXTRACTED",
    "ai_interpreted": "AI_INTERPRETED",
    "ambiguous": "AMBIGUOUS",
    "conflicting": "CONFLICTING",
    "missing": "AMBIGUOUS",
    "human_verified": "HUMAN_VERIFIED",
}


def _stable_id(prefix: str, *parts: object) -> str:
    source = "|".join(str(part) for part in parts)
    return f"{prefix}-{sha256(source.encode('utf-8')).hexdigest()[:16].upper()}"


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _split_evidence_refs(refs: Iterable[str], present_ids: set[str]) -> tuple[list[str], list[str]]:
    refs = _unique(refs)
    return (
        [reference for reference in refs if reference in present_ids],
        [reference for reference in refs if reference not in present_ids],
    )


def _source_ref(sheet: DrawingEvidenceSheet, evidence_refs: list[str]) -> NodeSourceRef:
    return NodeSourceRef(
        document_id=sheet.document_id,
        page_index=sheet.source.page_index,
        sheet_id=sheet.sheet_identity.sheet_number.value,
        evidence_refs=evidence_refs,
    )


def _node_properties(
    observation: ObservationValue,
    evidence_refs: list[str],
) -> dict[str, NodeProperty]:
    value_source = "ai_interpreted" if observation.status == "ai_interpreted" else "extracted"
    properties = {
        "raw": NodeProperty(
            value=observation.raw,
            value_source=value_source,
            evidence_refs=evidence_refs,
        ),
        "category": NodeProperty(value="", evidence_refs=[]),
    }
    if observation.normalized is not None:
        properties["normalized"] = NodeProperty(
            value=observation.normalized,
            value_source=value_source,
            evidence_refs=evidence_refs,
        )
    if observation.numeric_value is not None:
        properties["numeric_value"] = NodeProperty(
            value=observation.numeric_value,
            value_source=value_source,
            evidence_refs=evidence_refs,
        )
    if observation.unit is not None:
        properties["unit"] = NodeProperty(
            value=observation.unit,
            value_source=value_source,
            evidence_refs=evidence_refs,
        )
    return properties


def _observation_name(category: str, observation: ObservationValue) -> str:
    value = observation.normalized or observation.raw
    if category == "element_labels":
        return normalize_element_code(value)
    return value.strip() or observation.raw


def build_sheet_patch(
    sheet: DrawingEvidenceSheet,
    integrity_report: DemIntegrityReport | None = None,
) -> SheetKnowledgePatch:
    """Convert one stored sheet into deterministic graph facts without inference."""

    present_ids = {item.evidence_id for item in sheet.evidence}
    sheet_id = sheet.sheet_identity.sheet_number.value
    discipline = normalize_discipline(sheet.sheet_identity.discipline.value)
    valid_sheet_number_refs, missing_sheet_number_refs = _split_evidence_refs(
        sheet.sheet_identity.sheet_number.evidence_refs,
        present_ids,
    )
    valid_title_refs, missing_title_refs = _split_evidence_refs(
        sheet.sheet_identity.title.evidence_refs,
        present_ids,
    )
    valid_scale_refs: list[str] = []
    missing_scale_refs: list[str] = []
    scale_facts: list[SheetFact] = []
    for position, scale in enumerate(sheet.sheet_identity.scale_candidates):
        valid_refs, missing_refs = _split_evidence_refs(scale.evidence_refs, present_ids)
        valid_scale_refs.extend(valid_refs)
        missing_scale_refs.extend(missing_refs)
        scale_facts.append(
            SheetFact(
                fact_id=_stable_id("FACT", sheet.document_id, sheet.source.page_index, "scale", position),
                category="scale",
                raw=scale.raw,
                normalized=scale.normalized,
                confidence=scale.confidence,
                status="extracted",
                evidence_refs=valid_refs,
                missing_evidence_refs=missing_refs,
            )
        )
    valid_identity_refs = _unique([*valid_sheet_number_refs, *valid_title_refs, *valid_scale_refs])
    missing_identity_refs = _unique(
        [*missing_sheet_number_refs, *missing_title_refs, *missing_scale_refs]
    )
    sheet_node_id = _stable_id("SHEET", sheet.document_id, sheet.source.page_index, sheet_id)
    discipline_node_id = _stable_id("DISCIPLINE", discipline)
    facts = [
        SheetFact(
            fact_id=_stable_id("FACT", sheet_node_id, "sheet_identity"),
            category="sheet_identity",
            raw=sheet_id,
            normalized=sheet_id,
            confidence=min(
                sheet.sheet_identity.sheet_number.confidence,
                sheet.sheet_identity.title.confidence,
            ),
            status="extracted",
            evidence_refs=valid_identity_refs,
            missing_evidence_refs=missing_identity_refs,
            attributes={
                "sheet_number": sheet_id,
                "title": sheet.sheet_identity.title.value,
            },
        ),
        SheetFact(
            fact_id=_stable_id("FACT", sheet_node_id, "discipline"),
            category="discipline",
            raw=sheet.sheet_identity.discipline.value,
            normalized=discipline,
            confidence=sheet.sheet_identity.discipline.confidence,
            status=sheet.sheet_identity.discipline.status,
            evidence_refs=[],
        ),
        *scale_facts,
    ]
    nodes = [
        ProjectGraphNode(
            node_id=sheet_node_id,
            type="sheet",
            canonical_name=sheet_id,
            aliases=_unique([sheet.sheet_identity.title.value]),
            properties={
                "title": NodeProperty(value=sheet.sheet_identity.title.value, evidence_refs=valid_title_refs),
                "sheet_number": NodeProperty(value=sheet_id, evidence_refs=valid_sheet_number_refs),
            },
            discipline=discipline,
            verification_status="extracted",
            confidence=min(sheet.sheet_identity.sheet_number.confidence, sheet.sheet_identity.title.confidence),
            source_refs=[_source_ref(sheet, valid_identity_refs)],
        ),
        ProjectGraphNode(
            node_id=discipline_node_id,
            type="discipline",
            canonical_name=discipline,
            discipline=discipline,
            verification_status=_STATUS_TO_VERIFICATION[sheet.sheet_identity.discipline.status],
            confidence=sheet.sheet_identity.discipline.confidence,
            source_refs=[_source_ref(sheet, [])],
        ),
    ]
    edges = [
        ProjectGraphEdge(
            edge_id=_stable_id("EDGE", sheet_node_id, discipline_node_id, "DEFINED_BY"),
            source=sheet_node_id,
            target=discipline_node_id,
            relation="DEFINED_BY",
            confidence_class=_STATUS_TO_CONFIDENCE[sheet.sheet_identity.discipline.status],
            confidence=sheet.sheet_identity.discipline.confidence,
            evidence_refs=[],
            resolver=EdgeResolver(method="deterministic_page_patch"),
        )
    ]
    aliases = _unique([sheet_id, sheet.sheet_identity.title.value])
    dangling_refs = list(missing_identity_refs)
    unresolved_references: list[str] = []
    quarantined_keys = {
        (item.category, item.raw, frozenset(item.evidence_refs))
        for item in (integrity_report.quarantined_observations if integrity_report else [])
    }
    flagged_keys = {
        (item.category, item.raw, frozenset(item.evidence_refs))
        for item in (integrity_report.flagged_observations if integrity_report else [])
    }

    for category, node_type in _OBSERVATION_NODE_TYPES.items():
        for position, observation in enumerate(getattr(sheet.observations, category)):
            valid_refs, missing_refs = _split_evidence_refs(observation.evidence_refs, present_ids)
            observation_key = (category, observation.raw, frozenset(missing_refs))
            dangling_refs.extend(missing_refs)
            if observation_key in quarantined_keys:
                continue
            canonical_name = _observation_name(category, observation)
            node_id = _stable_id("NODE", sheet_node_id, category, position, canonical_name)
            effective_status = "ambiguous" if observation_key in flagged_keys else observation.status
            status = _STATUS_TO_VERIFICATION[effective_status]
            fact = SheetFact(
                fact_id=_stable_id("FACT", node_id),
                category=category,
                raw=observation.raw,
                normalized=observation.normalized,
                numeric_value=observation.numeric_value,
                unit=observation.unit,
                bbox=observation.bbox,
                confidence=observation.confidence,
                status=effective_status,
                evidence_refs=valid_refs,
                missing_evidence_refs=missing_refs,
                # node_id back-reference lets downstream resolvers (e.g.
                # cross_sheet_resolver's dimension-to-element linking) target the
                # exact ProjectGraphNode this fact produced, without recomputing
                # _stable_id's position-dependent formula and risking a mismatch.
                attributes={"node_id": node_id},
            )
            facts.append(fact)
            properties = _node_properties(observation, valid_refs)
            properties["category"] = NodeProperty(value=category, evidence_refs=valid_refs)
            nodes.append(
                ProjectGraphNode(
                    node_id=node_id,
                    type=node_type,
                    canonical_name=canonical_name,
                    aliases=_unique(
                        value
                        for value in (observation.raw, observation.normalized)
                        if value != canonical_name
                    ),
                    properties=properties,
                    discipline=discipline,
                    verification_status=status,
                    confidence=observation.confidence,
                    source_refs=[_source_ref(sheet, valid_refs)],
                )
            )
            edges.append(
                ProjectGraphEdge(
                    edge_id=_stable_id("EDGE", sheet_node_id, node_id, "CONTAINS"),
                    source=sheet_node_id,
                    target=node_id,
                    relation="CONTAINS",
                    confidence_class=_STATUS_TO_CONFIDENCE[effective_status],
                    confidence=observation.confidence,
                    evidence_refs=valid_refs,
                    resolver=EdgeResolver(method="deterministic_page_patch"),
                )
            )
            aliases.extend([observation.raw, observation.normalized or ""])
            if category == "references":
                unresolved_references.append(observation.raw)

    dangling_refs = _unique(dangling_refs)
    return SheetKnowledgePatch(
        sheet_id=sheet_id,
        document_id=sheet.document_id,
        project_id=sheet.project_id,
        run_id=sheet.run_id,
        page_index=sheet.source.page_index,
        discipline=discipline,
        completion=SheetCompletionState(
            sections_expected=sheet.completion.sections_expected,
            sections_completed=sheet.completion.sections_completed,
            is_complete=sheet.completion.is_complete,
            next_cursor=sheet.completion.next_cursor,
        ),
        facts=facts,
        nodes=nodes,
        edges=edges,
        aliases=_unique(aliases),
        unresolved_references=_unique(unresolved_references),
        dangling_evidence_refs=dangling_refs,
        missing_evidence_refs=dangling_refs,
        ambiguities=list(sheet.ambiguities),
        conflicts=list(sheet.conflicts),
        unclassified=list(sheet.unclassified),
    )
