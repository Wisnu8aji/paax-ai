"""Deterministic level canonicalization with bounded semantic review proposals."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, Mapping, Protocol, Sequence

from app.project_graph.models import NodeSourceRef
from app.project_graph.synthesis_types import SheetFact, SheetKnowledgePatch


_NUMBER_NOISE = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*$")
_FLOOR_NUMBER = re.compile(r"\b(?:LANTAI|LT\.?|LEVEL|FLOOR|STORY)[\s-]*(?P<number>\d+)\b", re.IGNORECASE)
_ROOF = re.compile(r"\b(?:ATAP|ROOF)\b", re.IGNORECASE)
_SUBSTRUCTURE = re.compile(r"\b(?:DASAR|BASEMENT)\b", re.IGNORECASE)

_STATIC_ALIASES = {
    "main floor": "Lantai 1",
    "ground floor": "Lantai 1",
}

# Source PDFs use U+00B1. U+0105 is retained only to tolerate an older
# synthetic fixture encoding; both normalize as the same signed datum.
_PLUS_MINUS_CHARS = f"{chr(177)}{chr(261)}"
_ELEVATION = re.compile(
    rf"(?<![\w])(?P<value>[+\-{re.escape(_PLUS_MINUS_CHARS)}]\s*\d+(?:[.,]\d+)?)(?!\d)"
)
_EXPLICIT_EL = re.compile(
    rf"\bEL\.?\s*(?P<elevation>[+\-{re.escape(_PLUS_MINUS_CHARS)}]\s*\d+(?:[.,]\d+)?)\s*"
    r"(?P<floor>(?:LANTAI|LT\.?|LEVEL|FLOOR|STORY)\s*(?:\d+|ATAP|ROOF|DASAR|GROUND|BASEMENT))\b",
    re.IGNORECASE,
)
# Only a qualified roof level (for example "Lantai Atap P +16.20")
# stays separate. "Lantai Atap" in the explicit EL mapping is the roof.
_ROOF_VARIANT = re.compile(
    rf"\bLANTAI[\s-]+ATAP[\s-]+P\b.*[+\-{re.escape(_PLUS_MINUS_CHARS)}]\s*\d", re.IGNORECASE
)

SEMANTIC_PROMPT_VERSION = "level-semantic-v1"
FLASH_CONFIDENCE_FLOOR = 0.75


@dataclass(frozen=True)
class LevelSemanticCandidate:
    candidate_id: str
    raw: str
    normalized: str | None
    classification: str
    deterministic_canonical: str | None
    canonical_levels: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    context: Mapping[str, str]

    def as_audit_input(self) -> dict[str, object]:
        return {
            "candidate_id": self.candidate_id,
            "raw": self.raw,
            "normalized": self.normalized,
            "classification": self.classification,
            "deterministic_canonical": self.deterministic_canonical,
            "canonical_levels": list(self.canonical_levels),
            "evidence_refs": list(self.evidence_refs),
            "context": dict(self.context),
        }


@dataclass(frozen=True)
class LevelProviderResult:
    """Provider output plus the metadata required for an immutable audit trail."""

    payload: Mapping[str, Any]
    model: str
    prompt_version: str
    prompt_hash: str


@dataclass(frozen=True)
class LevelProviderAudit:
    candidate_id: str
    tier: Literal["flash", "pro"]
    model: str
    prompt_version: str
    prompt_hash: str
    input: Mapping[str, object]
    output: Mapping[str, Any]
    rationale: str
    validated_decision: Literal["merge_to", "possibly_same", "keep_separate"]
    validation_note: str


class LevelSemanticReviewProvider(Protocol):
    """Propose a level identity only; this protocol never mutates source facts."""

    def propose(
        self,
        candidate: LevelSemanticCandidate,
        *,
        tier: Literal["flash", "pro"],
    ) -> LevelProviderResult:
        """Return one auditable semantic proposal for a bounded candidate."""


@dataclass(frozen=True)
class LevelReviewPair:
    left: str
    right: str
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True)
class CanonicalLevel:
    canonical_name: str
    aliases: tuple[str, ...]
    merged_from: str
    elevation: str | None
    requires_review: bool
    source_refs: tuple[NodeSourceRef, ...]


@dataclass(frozen=True)
class LevelCanonicalization:
    patches: tuple[SheetKnowledgePatch, ...]
    missing_information: tuple[str, ...]
    possibly_same: tuple[LevelReviewPair, ...]
    levels: tuple[CanonicalLevel, ...]
    provider_audits: tuple[LevelProviderAudit, ...]


def _text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return " ".join(normalized.split())


def _elevation(value: str) -> str | None:
    match = _ELEVATION.search(value)
    if match is None:
        return None
    return match.group("value").replace(" ", "").replace(",", ".")


def _floor_name(value: str) -> str | None:
    key = _text_key(value)
    if key in _STATIC_ALIASES:
        return _STATIC_ALIASES[key]
    if _ROOF_VARIANT.search(value):
        return " ".join(value.split())
    number = _FLOOR_NUMBER.search(value)
    if number is not None:
        return f"Lantai {number.group('number')}"
    if _ROOF.search(value):
        return "Atap"
    if _SUBSTRUCTURE.search(value):
        return "Substruktur"
    return None


def _all_text(patches: Sequence[SheetKnowledgePatch]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    values: list[tuple[str, tuple[str, ...]]] = []
    for patch in patches:
        for fact in patch.facts:
            refs = tuple(sorted(set(fact.evidence_refs)))
            for value in (fact.raw, fact.normalized):
                if value:
                    values.append((value, refs))
    return tuple(values)


def _explicit_elevation_map(
    patches: Sequence[SheetKnowledgePatch],
) -> tuple[dict[str, tuple[str, tuple[str, ...]]], list[str]]:
    candidates: dict[str, list[tuple[str, tuple[str, ...]]]] = {}
    for text, refs in _all_text(patches):
        for match in _EXPLICIT_EL.finditer(text):
            elevation = _elevation(match.group("elevation"))
            floor = _floor_name(match.group("floor"))
            if elevation is not None and floor is not None:
                candidates.setdefault(elevation, []).append((floor, refs))

    result: dict[str, tuple[str, tuple[str, ...]]] = {}
    missing: list[str] = []
    for elevation, matches in sorted(candidates.items()):
        floors = {floor for floor, _ in matches}
        refs = tuple(sorted({ref for _, evidence_refs in matches for ref in evidence_refs}))
        if len(floors) == 1:
            result[elevation] = (next(iter(floors)), refs)
        else:
            missing.append(
                f"level elevation {elevation}: conflicting explicit EL mappings to {', '.join(sorted(floors))}"
            )
    return result, missing


def _negative_substructure(elevation: str) -> bool:
    try:
        normalized = elevation.translate(
            str.maketrans({character: "+" for character in _PLUS_MINUS_CHARS})
        )
        return Decimal(normalized) < Decimal("-0.5")
    except InvalidOperation:
        return False


def _classify(
    fact: SheetFact,
    elevation_map: dict[str, tuple[str, tuple[str, ...]]],
) -> tuple[str, str | None, str | None, tuple[str, ...]]:
    raw = fact.raw.strip()
    normalized = (fact.normalized or "").strip()
    if _NUMBER_NOISE.fullmatch(raw):
        return "NUMBER_NOISE", None, None, ()
    elevation = _elevation(raw)
    # A signed raw datum is stronger evidence than an upstream normalized
    # label: some fixture rows normalize step/ramp datums as "Lantai 3" etc.
    floor = _floor_name(raw) or (_floor_name(normalized) if elevation is None else None)
    if elevation is not None:
        mapped = elevation_map.get(elevation)
        if mapped is not None:
            return "ELEVATION", mapped[0], elevation, mapped[1]
        if floor is not None:
            classification = "FLOOR_NAME_AMBIGUOUS" if _ROOF_VARIANT.search(raw) else "FLOOR_NAME"
            return classification, floor, elevation if classification == "FLOOR_NAME_AMBIGUOUS" else None, ()
        if _negative_substructure(elevation):
            return "ELEVATION", "Substruktur", elevation, ()
        return "ELEVATION_AMBIGUOUS", None, elevation, ()
    if floor is not None:
        classification = "FLOOR_NAME_AMBIGUOUS" if _ROOF_VARIANT.search(raw) else "FLOOR_NAME"
        return classification, floor, None, ()
    return "UNCLASSIFIED", None, None, ()


def _numbered_floor(value: str | None) -> str | None:
    if value is None:
        return None
    match = _FLOOR_NUMBER.search(value)
    return match.group("number") if match is not None else None


def _proposal_payload(
    payload: Mapping[str, Any],
) -> tuple[Literal["merge_to", "possibly_same", "keep_separate"], str | None, str, float] | None:
    decision = payload.get("decision")
    rationale = payload.get("rationale")
    confidence = payload.get("confidence")
    merge_to = payload.get("merge_to")
    if decision not in {"merge_to", "possibly_same", "keep_separate"}:
        return None
    if not isinstance(rationale, str) or not rationale.strip():
        return None
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        return None
    confidence = float(confidence)
    if not 0.0 <= confidence <= 1.0:
        return None
    if merge_to is not None and (not isinstance(merge_to, str) or not merge_to.strip()):
        return None
    return decision, merge_to.strip() if isinstance(merge_to, str) else None, rationale.strip(), confidence


def _validate_semantic_proposal(
    candidate: LevelSemanticCandidate,
    result: LevelProviderResult,
) -> tuple[Literal["merge_to", "possibly_same", "keep_separate"], str | None, str, float, str]:
    parsed = _proposal_payload(result.payload)
    if parsed is None:
        return "possibly_same", None, "Provider proposal contract was invalid.", 0.0, "invalid provider proposal"
    decision, merge_to, rationale, confidence = parsed
    canonical_by_key = {_text_key(level): level for level in candidate.canonical_levels}
    if decision != "merge_to":
        return decision, merge_to, rationale, confidence, "accepted non-merge proposal"
    target = canonical_by_key.get(_text_key(merge_to or ""))
    if target is None:
        return "possibly_same", None, rationale, confidence, "invalid merge target: not a project canonical level"
    source_number = _numbered_floor(candidate.deterministic_canonical or candidate.raw)
    target_number = _numbered_floor(target)
    if source_number is not None and target_number is not None and source_number != target_number:
        return "possibly_same", None, rationale, confidence, "numbered floors differ: automatic merge prohibited"
    return "merge_to", target, rationale, confidence, "merge target validated deterministically"


def _semantic_candidate(
    *,
    fact: SheetFact,
    patch: SheetKnowledgePatch,
    kind: str,
    canonical: str | None,
    canonical_levels: Sequence[str],
) -> LevelSemanticCandidate:
    return LevelSemanticCandidate(
        candidate_id=fact.fact_id,
        raw=fact.raw,
        normalized=fact.normalized,
        classification=kind,
        deterministic_canonical=canonical,
        canonical_levels=tuple(sorted(set(canonical_levels), key=str.casefold)),
        evidence_refs=tuple(sorted(set(fact.evidence_refs))),
        context={
            "document_id": patch.document_id,
            "sheet_id": patch.sheet_id,
            "page_index": str(patch.page_index),
            "discipline": patch.discipline,
        },
    )


def _audit(
    *,
    candidate: LevelSemanticCandidate,
    tier: Literal["flash", "pro"],
    result: LevelProviderResult,
    decision: Literal["merge_to", "possibly_same", "keep_separate"],
    rationale: str,
    note: str,
) -> LevelProviderAudit:
    return LevelProviderAudit(
        candidate_id=candidate.candidate_id,
        tier=tier,
        model=result.model,
        prompt_version=result.prompt_version,
        prompt_hash=result.prompt_hash,
        input=candidate.as_audit_input(),
        output=dict(result.payload),
        rationale=rationale,
        validated_decision=decision,
        validation_note=note,
    )


def canonicalize_levels(
    patches: Sequence[SheetKnowledgePatch],
    provider: LevelSemanticReviewProvider | None = None,
) -> LevelCanonicalization:
    """Return copied patches with deterministic or validated semantic level keys.

    Semantic output remains a bounded, auditable proposal.  It may only select
    an already-known project canonical level and is always marked for review.
    """

    elevation_map, missing_information = _explicit_elevation_map(patches)
    classifications: dict[str, tuple[str, str | None, str | None, tuple[str, ...]]] = {}
    fact_context: list[tuple[SheetKnowledgePatch, SheetFact]] = []
    for patch in patches:
        for fact in patch.facts:
            if fact.category != "levels":
                continue
            classifications[fact.fact_id] = _classify(fact, elevation_map)
            fact_context.append((patch, fact))

    canonical_levels = sorted(
        {
            canonical
            for _kind, canonical, _elevation_value, _mapping_refs in classifications.values()
            if canonical is not None
        },
        key=str.casefold,
    )
    provider_audits: list[LevelProviderAudit] = []
    semantic_pairs: list[LevelReviewPair] = []
    if provider is not None:
        for patch, fact in fact_context:
            kind, canonical, elevation, mapping_refs = classifications[fact.fact_id]
            if kind not in {"FLOOR_NAME_AMBIGUOUS", "UNCLASSIFIED"}:
                continue
            candidate = _semantic_candidate(
                fact=fact,
                patch=patch,
                kind=kind,
                canonical=canonical,
                canonical_levels=canonical_levels,
            )
            try:
                flash_result = provider.propose(candidate, tier="flash")
                if not isinstance(flash_result, LevelProviderResult):
                    raise TypeError("provider returned an unsupported level result")
                decision, target, rationale, confidence, note = _validate_semantic_proposal(
                    candidate,
                    flash_result,
                )
                provider_audits.append(
                    _audit(
                        candidate=candidate,
                        tier="flash",
                        result=flash_result,
                        decision=decision,
                        rationale=rationale,
                        note=note,
                    )
                )
            except Exception as exc:
                missing_information.append(
                    f"level provider Flash unavailable for {fact.raw}: {exc}"
                )
                continue

            # A fully unclassified level has no deterministic identity, so it
            # receives the expensive thinking pass even if Flash sounds sure.
            # Other candidates only escalate when Flash explicitly lacks confidence.
            if kind == "UNCLASSIFIED" or confidence < FLASH_CONFIDENCE_FLOOR:
                try:
                    pro_result = provider.propose(candidate, tier="pro")
                    if not isinstance(pro_result, LevelProviderResult):
                        raise TypeError("provider returned an unsupported level result")
                    decision, target, rationale, confidence, note = _validate_semantic_proposal(
                        candidate,
                        pro_result,
                    )
                    provider_audits.append(
                        _audit(
                            candidate=candidate,
                            tier="pro",
                            result=pro_result,
                            decision=decision,
                            rationale=rationale,
                            note=note,
                        )
                    )
                except Exception as exc:
                    missing_information.append(
                        f"level provider Pro unavailable for {fact.raw}: {exc}"
                    )

            if decision == "merge_to" and target is not None:
                classifications[fact.fact_id] = ("SEMANTIC_MERGED", target, elevation, mapping_refs)
            elif decision == "possibly_same":
                missing_information.append(
                    f"level provider review: {fact.raw} possibly same as {target or 'an unresolved canonical level'}"
                )
                if canonical is not None and target is not None and canonical != target:
                    semantic_pairs.append(
                        LevelReviewPair(
                            left=canonical,
                            right=target,
                            evidence_refs=tuple(sorted(set(fact.evidence_refs))),
                        )
                    )

    aliases: dict[str, set[str]] = {}
    elevations: dict[str, set[str]] = {}
    evidence_by_level: dict[str, set[str]] = {}
    review_by_level: dict[str, bool] = {}
    sources_by_level: dict[str, list[NodeSourceRef]] = {}

    for patch, fact in fact_context:
        classification = classifications[fact.fact_id]
        kind, canonical, elevation, mapping_refs = classification
        if canonical is None:
            if kind in {"NUMBER_NOISE", "ELEVATION_AMBIGUOUS"}:
                missing_information.append(
                    f"{patch.sheet_id} page {patch.page_index + 1}: {kind} level candidate {fact.raw} requires review"
                )
            continue
        aliases.setdefault(canonical, set()).add(fact.raw)
        if fact.normalized:
            aliases[canonical].add(fact.normalized)
        aliases[canonical].add(canonical)
        if elevation is not None:
            elevations.setdefault(canonical, set()).add(elevation)
        evidence_by_level.setdefault(canonical, set()).update(fact.evidence_refs)
        evidence_by_level[canonical].update(mapping_refs)
        review_by_level[canonical] = review_by_level.get(canonical, False) or kind in {
            "FLOOR_NAME_AMBIGUOUS",
            "SEMANTIC_MERGED",
        }
        sources_by_level.setdefault(canonical, []).append(
            NodeSourceRef(
                document_id=patch.document_id,
                page_index=patch.page_index,
                sheet_id=patch.sheet_id,
                evidence_refs=sorted(set(fact.evidence_refs) | set(mapping_refs)),
            )
        )

    copied_patches: list[SheetKnowledgePatch] = []
    for patch in patches:
        facts: list[SheetFact] = []
        for fact in patch.facts:
            classification = classifications.get(fact.fact_id)
            if classification is None:
                facts.append(fact)
                continue
            kind, canonical, elevation, mapping_refs = classification
            attributes = dict(fact.attributes)
            attributes["level_classification"] = kind
            if canonical is not None:
                attributes["level_canonical_name"] = canonical
                attributes["level_aliases"] = " | ".join(sorted(aliases[canonical], key=str.casefold))
                attributes["level_merged_from"] = " | ".join(sorted(aliases[canonical], key=str.casefold))
                if elevation is not None:
                    attributes["level_elevation"] = elevation
                facts.append(
                    fact.model_copy(
                        update={
                            "normalized": canonical,
                            "evidence_refs": sorted(set(fact.evidence_refs) | set(mapping_refs)),
                            "attributes": attributes,
                        }
                    )
                )
            else:
                facts.append(fact.model_copy(update={"normalized": None, "attributes": attributes}))
        copied_patches.append(patch.model_copy(update={"facts": facts}))

    pairs: list[LevelReviewPair] = list(semantic_pairs)
    roof_variants = [
        canonical
        for canonical in aliases
        if canonical != "Atap" and _ROOF_VARIANT.search(canonical)
    ]
    if "Atap" in aliases:
        for variant in roof_variants:
            pairs.append(
                LevelReviewPair(
                    left="Atap",
                    right=variant,
                    evidence_refs=tuple(sorted(evidence_by_level["Atap"] | evidence_by_level[variant])),
                )
            )
            missing_information.append(
                f"level review: Atap and {variant} have distinct elevation evidence; keep separate pending review"
            )

    levels: list[CanonicalLevel] = []
    for canonical in sorted(aliases, key=str.casefold):
        source_refs: dict[tuple[str, int, str], set[str]] = {}
        for source_ref in sources_by_level[canonical]:
            key = (source_ref.document_id, source_ref.page_index, source_ref.sheet_id)
            source_refs.setdefault(key, set()).update(source_ref.evidence_refs)
        elevation_values = elevations.get(canonical, set())
        levels.append(
            CanonicalLevel(
                canonical_name=canonical,
                aliases=tuple(sorted(aliases[canonical] - {canonical}, key=str.casefold)),
                merged_from=" | ".join(sorted(aliases[canonical], key=str.casefold)),
                elevation=" | ".join(sorted(elevation_values)) if elevation_values else None,
                requires_review=review_by_level.get(canonical, False),
                source_refs=tuple(
                    NodeSourceRef(
                        document_id=document_id,
                        page_index=page_index,
                        sheet_id=sheet_id,
                        evidence_refs=sorted(evidence_refs),
                    )
                    for (document_id, page_index, sheet_id), evidence_refs in sorted(source_refs.items())
                ),
            )
        )

    return LevelCanonicalization(
        patches=tuple(copied_patches),
        missing_information=tuple(sorted(set(missing_information))),
        possibly_same=tuple(sorted(pairs, key=lambda pair: (pair.left, pair.right))),
        levels=tuple(levels),
        provider_audits=tuple(provider_audits),
    )
