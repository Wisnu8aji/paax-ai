"""Deterministic project-level canonicalization for drawing level evidence.

This module deliberately has no network path.  The optional provider protocol
is only an extension seam for a later, separately-gated semantic review.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Protocol, Sequence

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


class LevelSemanticReviewProvider(Protocol):
    """Future-only semantic review seam; canonicalization never calls it yet."""

    def propose(self, *, candidates: tuple[str, ...]) -> object:
        """Return a bounded review proposal in a later gated integration."""


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


def canonicalize_levels(
    patches: Sequence[SheetKnowledgePatch],
    provider: LevelSemanticReviewProvider | None = None,
) -> LevelCanonicalization:
    """Return copied patches with only deterministic level identities re-keyed.

    ``provider`` intentionally remains unused: unresolved semantic cases are
    surfaced as review information until the separately authorized provider
    integration is added.
    """

    del provider
    elevation_map, missing_information = _explicit_elevation_map(patches)
    classifications: dict[str, tuple[str, str | None, str | None, tuple[str, ...]]] = {}
    aliases: dict[str, set[str]] = {}
    elevations: dict[str, set[str]] = {}
    evidence_by_level: dict[str, set[str]] = {}
    review_by_level: dict[str, bool] = {}
    sources_by_level: dict[str, list[NodeSourceRef]] = {}

    for patch in patches:
        for fact in patch.facts:
            if fact.category != "levels":
                continue
            classification = _classify(fact, elevation_map)
            classifications[fact.fact_id] = classification
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
            review_by_level[canonical] = review_by_level.get(canonical, False) or kind == "FLOOR_NAME_AMBIGUOUS"
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

    pairs: list[LevelReviewPair] = []
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
    )
