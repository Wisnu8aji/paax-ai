"""Pure derived sheet indexes for Level, Classification, and source order.

This module never changes the source page identity and never calls an AI
provider. It transforms already-produced deterministic sheet semantics into
three complete, reviewable navigation views.
"""
from __future__ import annotations

import re
from collections.abc import Iterable

from .models import (
    DrawingType,
    PageIntelligence,
    SheetClassificationKey,
    SheetSemanticProfile,
    SheetViewEntry,
    SheetViews,
    SheetViewStatus,
)


_CLASSIFICATION_BY_DRAWING_TYPE: dict[str, SheetClassificationKey] = {
    "cover": SheetClassificationKey.COVER,
    "drawing_list": SheetClassificationKey.DRAWING_LIST,
    "site_plan": SheetClassificationKey.SITE_PLAN,
    "floor_plan": SheetClassificationKey.PLAN,
    "roof_plan": SheetClassificationKey.PLAN,
    "finish_plan": SheetClassificationKey.PLAN,
    "ceiling_plan": SheetClassificationKey.PLAN,
    "door_window_plan": SheetClassificationKey.PLAN,
    "partition_plan": SheetClassificationKey.PLAN,
    "foundation_plan": SheetClassificationKey.PLAN,
    "column_plan": SheetClassificationKey.PLAN,
    "beam_plan": SheetClassificationKey.PLAN,
    "slab_plan": SheetClassificationKey.PLAN,
    "lighting_plan": SheetClassificationKey.PLAN,
    "power_plan": SheetClassificationKey.PLAN,
    "lightning_protection": SheetClassificationKey.PLAN,
    "fire_safety_plan": SheetClassificationKey.PLAN,
    "hvac_plan": SheetClassificationKey.PLAN,
    "plumbing_plan": SheetClassificationKey.PLAN,
    "drainage_plan": SheetClassificationKey.PLAN,
    "general_arrangement": SheetClassificationKey.PLAN,
    "bridge_plan": SheetClassificationKey.PLAN,
    "road_plan_profile": SheetClassificationKey.PLAN,
    "elevation": SheetClassificationKey.ELEVATION,
    "section": SheetClassificationKey.SECTION,
    "cross_section": SheetClassificationKey.SECTION,
    "detail": SheetClassificationKey.DETAIL,
    "reinforcement_detail": SheetClassificationKey.DETAIL,
    "schedule": SheetClassificationKey.SCHEDULE,
    "single_line_diagram": SheetClassificationKey.DIAGRAM,
    "schematic": SheetClassificationKey.DIAGRAM,
    "technical_note": SheetClassificationKey.TECHNICAL_NOTE,
    "legend": SheetClassificationKey.TECHNICAL_NOTE,
    "unknown": SheetClassificationKey.UNKNOWN,
}

_CLASSIFICATION_RANK = {
    SheetClassificationKey.COVER: 0,
    SheetClassificationKey.DRAWING_LIST: 10,
    SheetClassificationKey.SITE_PLAN: 20,
    SheetClassificationKey.PLAN: 30,
    SheetClassificationKey.ELEVATION: 40,
    SheetClassificationKey.SECTION: 50,
    SheetClassificationKey.DETAIL: 60,
    SheetClassificationKey.SCHEDULE: 70,
    SheetClassificationKey.DIAGRAM: 80,
    SheetClassificationKey.TECHNICAL_NOTE: 90,
    SheetClassificationKey.UNKNOWN: 999,
}

_LEVEL_ALIASES = {
    "site": "site",
    "site plan": "site",
    "tapak": "site",
    "alignment": "alignment",
    "foundation": "foundation",
    "fondasi": "foundation",
    "substructure": "substructure",
    "sub struktur": "substructure",
    "ground": "ground",
    "ground floor": "ground",
    "lantai dasar": "ground",
    "mezzanine": "mezzanine",
    "mezanin": "mezzanine",
    "roof": "roof",
    "rooftop": "roof",
    "atap": "roof",
    "superstructure": "superstructure",
    "super structure": "superstructure",
    "detail": "detail",
    "section": "section",
    "potongan": "section",
    "elevation": "elevation",
    "tampak": "elevation",
    "schedule": "schedule",
    "table": "schedule",
    "tabel": "schedule",
    "document": "document",
    "unknown": "unknown",
    "unassigned": "unknown",
    "not assigned": "unknown",
    "n/a": "unknown",
    "none": "unknown",
}

_CANONICAL_LEVEL_RE = re.compile(r"^([LB])\s*[-_.:]?\s*(\d{1,3})$", re.I)
_NUMERIC_LEVEL_RE = re.compile(r"^(?:LANTAI|LT\.?|LEVEL|FLOOR)\s*[-_.:]?\s*(\d{1,3})$", re.I)
_BASEMENT_LEVEL_RE = re.compile(r"^(?:BASEMENT|B)\s*[-_.:]?\s*(\d{1,3})$", re.I)
_SAFE_LEVEL_RE = re.compile(r"[^a-z0-9]+")


def classification_key_for(drawing_type: DrawingType | str | None) -> SheetClassificationKey:
    """Map detailed deterministic drawing types to the user-facing taxonomy."""

    return _CLASSIFICATION_BY_DRAWING_TYPE.get(
        str(drawing_type or "unknown"), SheetClassificationKey.UNKNOWN
    )


def canonical_level_key(
    semantics: SheetSemanticProfile | None,
    classification_key: SheetClassificationKey,
) -> str:
    """Return a stable project-agnostic level bucket.

    Spatial evidence wins. Non-spatial sheets receive explicit document/detail/
    section/elevation/schedule buckets so they remain reachable in Level view.
    Unknown plan levels remain ``unknown`` and are reviewable rather than being
    guessed as L1.
    """

    raw = (semantics.level if semantics else None) or ""
    compact = " ".join(str(raw).strip().split())
    lowered = compact.casefold()
    if lowered in _LEVEL_ALIASES:
        return _LEVEL_ALIASES[lowered]

    canonical = _CANONICAL_LEVEL_RE.fullmatch(compact)
    if canonical:
        prefix, number = canonical.groups()
        value = int(number)
        if prefix.upper() == "L" and value == 0:
            return "ground"
        return f"{prefix.upper()}{value}"

    basement = _BASEMENT_LEVEL_RE.fullmatch(compact)
    if basement:
        return f"B{int(basement.group(1))}"

    numeric = _NUMERIC_LEVEL_RE.fullmatch(compact)
    if numeric:
        value = int(numeric.group(1))
        return "ground" if value == 0 else f"L{value}"

    if lowered.startswith(("unassigned", "unknown", "not assigned")):
        return "unknown"

    if compact:
        # Preserve an explicit novel level as a deterministic slug; this is not
        # an inferred floor number and therefore does not mutate source truth.
        slug = _SAFE_LEVEL_RE.sub("-", lowered).strip("-")
        if slug:
            return slug

    fallback = {
        SheetClassificationKey.COVER: "document",
        SheetClassificationKey.DRAWING_LIST: "document",
        SheetClassificationKey.SITE_PLAN: "site",
        SheetClassificationKey.ELEVATION: "elevation",
        SheetClassificationKey.SECTION: "section",
        SheetClassificationKey.DETAIL: "detail",
        SheetClassificationKey.SCHEDULE: "schedule",
        SheetClassificationKey.DIAGRAM: "document",
        SheetClassificationKey.TECHNICAL_NOTE: "document",
    }
    if classification_key in fallback:
        return fallback[classification_key]

    if semantics is not None:
        drawing_fallback = {
            "foundation_plan": "foundation",
            "roof_plan": "roof",
            "site_plan": "site",
            "road_plan_profile": "alignment",
        }.get(str(semantics.drawing_type))
        if drawing_fallback:
            return drawing_fallback

    return "unknown"


def level_sort_key(level_key: str) -> tuple[int, int, str]:
    """Natural vertical/document ordering without a fixed project template."""

    fixed = {
        "document": -10,
        "site": 0,
        "alignment": 5,
        "foundation": 10,
        "substructure": 12,
        "ground": 30,
        "mezzanine": 50,
        "roof": 60,
        "superstructure": 65,
        "detail": 70,
        "section": 80,
        "elevation": 90,
        "schedule": 100,
        "unknown": 999,
    }
    if level_key in fixed:
        return fixed[level_key], 0, level_key

    basement = re.fullmatch(r"B(\d+)", level_key, re.I)
    if basement:
        # Deepest basement first: B3, B2, B1, then ground.
        return 20, -int(basement.group(1)), level_key

    floor = re.fullmatch(r"L(\d+)", level_key, re.I)
    if floor:
        return 40, int(floor.group(1)), level_key

    # Explicit novel levels remain stable and appear before truly unknown rows.
    return 900, 0, level_key.casefold()


def _review_state(
    semantics: SheetSemanticProfile | None,
    classification_key: SheetClassificationKey,
    level_key: str,
) -> tuple[SheetViewStatus, str | None]:
    if semantics is None:
        return SheetViewStatus.NEEDS_REVIEW, "sheet_semantics_missing"
    if classification_key == SheetClassificationKey.UNKNOWN:
        return SheetViewStatus.NEEDS_REVIEW, "classification_unknown"
    if classification_key in {SheetClassificationKey.PLAN, SheetClassificationKey.SITE_PLAN} and level_key == "unknown":
        return SheetViewStatus.NEEDS_REVIEW, "level_unknown"
    return SheetViewStatus.CLASSIFIED, None


def _entry(page: PageIntelligence) -> SheetViewEntry:
    semantics = page.semantics
    semantic_identity_mismatch = (
        semantics is not None and semantics.page_index != page.profile.page_index
    )
    classification_key = classification_key_for(semantics.drawing_type if semantics else None)
    level_key = canonical_level_key(semantics, classification_key)
    status, review_reason = _review_state(semantics, classification_key, level_key)
    if semantic_identity_mismatch:
        # Never apply semantic metadata from another source page. Keep the PDF
        # page reachable and route the conflict to review instead.
        classification_key = SheetClassificationKey.UNKNOWN
        level_key = "unknown"
        status = SheetViewStatus.NEEDS_REVIEW
        review_reason = "semantic_page_identity_mismatch"
    evidence_refs = sorted(dict.fromkeys(semantics.evidence_refs if semantics else []))
    return SheetViewEntry(
        page_index=page.profile.page_index,
        page_number=page.profile.page_index + 1,
        level_key=level_key,
        classification_key=classification_key,
        evidence_refs=evidence_refs,
        status=status,
        review_reason=review_reason,
    )


def build_sheet_views(pages: Iterable[PageIntelligence]) -> SheetViews:
    """Build complete derived indexes while preserving each PDF page exactly once."""

    entries: list[SheetViewEntry] = []
    seen: set[int] = set()
    for page in pages:
        page_index = page.profile.page_index
        if page_index in seen:
            raise ValueError(f"duplicate page_index {page_index} in sheet view input")
        seen.add(page_index)
        entries.append(_entry(page))

    source = sorted(entries, key=lambda entry: entry.page_index)
    level = sorted(
        entries,
        key=lambda entry: (
            level_sort_key(entry.level_key),
            _CLASSIFICATION_RANK[entry.classification_key],
            entry.page_index,
        ),
    )
    classification = sorted(
        entries,
        key=lambda entry: (
            _CLASSIFICATION_RANK[entry.classification_key],
            level_sort_key(entry.level_key),
            entry.page_index,
        ),
    )
    return SheetViews(level=level, classification=classification, source=source)
