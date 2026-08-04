from __future__ import annotations

from collections import defaultdict
from typing import Any

import fitz

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import (
    CrossReferenceMatch,
    DetectionCandidate,
    PageIntelligence,
    PlanZone,
    SheetSemanticProfile,
    VocabularyEntry,
)
from .vector_index import VectorPageIndex
from .vocabulary import canonical_key, infer_category
from .taxonomy import label_looks_like_document_noise

_OCCURRENCE_DRAWING_TYPES = {
    "floor_plan", "roof_plan", "finish_plan", "ceiling_plan", "door_window_plan",
    "partition_plan", "foundation_plan", "column_plan", "beam_plan", "slab_plan",
    "lighting_plan", "power_plan", "lightning_protection", "fire_safety_plan",
    "hvac_plan", "plumbing_plan", "drainage_plan", "site_plan",
}


def _zone_for(box, zones: list[PlanZone]) -> PlanZone | None:
    cx, cy = box.center
    matches = [zone for zone in zones if zone.bbox.contains(cx, cy)]
    if not matches:
        return None
    matches.sort(key=lambda zone: (zone.type == "drawing", zone.bbox.area, -zone.confidence))
    return matches[0]


def _bbox_iou(a, b) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    intersection = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    union = a.area + b.area - intersection
    return intersection / union if union else 0.0


_STRUCTURAL_CATEGORIES = {
    "column", "beam", "slab", "foundation", "steel_profile",
    "gording", "kuda_kuda", "trekstang",
}
_ARCHITECTURAL_CATEGORIES = {"wall", "door", "window", "door_window_assembly", "ceiling_type"}


def _category_is_compatible(category: str, semantic: SheetSemanticProfile) -> bool:
    if category == "unknown":
        return True
    # Absence of sheet semantics is not evidence of incompatibility.  This
    # keeps vector-only/new-project candidates available for review while
    # still enforcing discipline gates whenever the sheet is identified.
    if semantic.discipline == "unknown" and semantic.drawing_type == "unknown":
        return True
    if category in _STRUCTURAL_CATEGORIES:
        return semantic.discipline == "structure" or semantic.drawing_type in {
            "floor_plan", "partition_plan", "foundation_plan", "column_plan",
            "beam_plan", "slab_plan", "roof_plan",
        }
    if category in _ARCHITECTURAL_CATEGORIES:
        return semantic.discipline == "architecture" or semantic.drawing_type in {
            "floor_plan", "door_window_plan", "partition_plan", "ceiling_plan",
            "finish_plan", "roof_plan",
        }
    if category == "concrete_grade":
        # Cycle-002 P1/P2: mutu beton (K-225/K-250/K-275) appears on
        # structural detail sheets (page-0035 DETAIL STANDARD UNTUK PEKERJAAN
        # STRUKTUR) and structural schedules — never on electrical plans.
        return semantic.discipline == "structure" or semantic.drawing_type in {
            "detail", "schedule", "column_plan", "beam_plan", "slab_plan",
            "foundation_plan",
        }
    if category == "door_frame":
        # Cycle-002 P1: kusen is architectural — DETAIL KUSEN sheets,
        # door/window plans, and finish plans.
        return semantic.discipline == "architecture" or semantic.drawing_type in {
            "door_window_plan", "detail", "finish_plan", "floor_plan",
        }
    if category == "floor_finish":
        # Cycle-002 P2: floor-finish labels (F1/F2 keramik) belong on
        # finish_plan ("Denah Pola Lantai") sheets only.  Without this gate a
        # correct floor_finish classification would be downgraded to unknown
        # by the compatibility check below.
        return semantic.drawing_type == "finish_plan" or semantic.discipline == "architecture"
    if category == "lighting_fixture":
        return semantic.drawing_type == "lighting_plan"
    if category == "electrical_fixture":
        return semantic.drawing_type in {"power_plan", "lightning_protection"}
    if category == "fire_safety_fixture":
        return semantic.drawing_type == "fire_safety_plan"
    if category == "hvac_fixture":
        return semantic.discipline == "mechanical" or semantic.drawing_type == "hvac_plan"
    if category in {"plumbing_fixture", "pipe"}:
        # R1: PIPA labels on plumbing/drainage plans are pipe work items, not
        # unclassifiable background (M3 golden check for PIPA → pipe).
        return semantic.discipline == "plumbing" or semantic.drawing_type in {"plumbing_plan", "drainage_plan"}
    return False


def _definition_for(
    key: str, by_key: dict[str, list[VocabularyEntry]], semantic: SheetSemanticProfile,
) -> VocabularyEntry | None:
    definitions = [
        item for item in by_key.get(key, [])
        if _category_is_compatible(item.category, semantic)
    ]
    preferred_category = {
        "lighting_plan": "lighting_fixture",
        "power_plan": "electrical_fixture",
        "fire_safety_plan": "fire_safety_fixture",
        "hvac_plan": "hvac_fixture",
        "plumbing_plan": "plumbing_fixture",
        "drainage_plan": "plumbing_fixture",
        "foundation_plan": "foundation",
        "column_plan": "column",
        "beam_plan": "beam",
        "slab_plan": "slab",
        "door_window_plan": "door_window_assembly",
        "ceiling_plan": "ceiling_type",
        # Cycle-002 P2: finish_plan sheet-context outranks the bare-F
        # foundation prefix — F1/F2 on "Denah Pola Lantai" is floor finish.
        "finish_plan": "floor_finish",
    }.get(semantic.drawing_type)
    definitions.sort(
        key=lambda item: (
            item.category == preferred_category,
            item.category != "unknown",
            "dimensions" in item.attributes,
            item.confidence,
        ),
        reverse=True,
    )
    return definitions[0] if definitions else None


def link_cross_references(
    *,
    document: fitz.Document,
    dem_pages: dict[int, dict[str, Any]],
    semantics: dict[int, SheetSemanticProfile],
    zones_by_page: dict[int, list[PlanZone]],
    vocabulary: list[VocabularyEntry],
    pages_by_index: dict[int, PageIntelligence] | None = None,
    vector_indices: dict[int, VectorPageIndex] | None = None,
    include_vector_descriptors: bool = True,
) -> tuple[list[CrossReferenceMatch], list[DetectionCandidate]]:
    """Link plan occurrences to project legend/schedule definitions.

    Fast package indexing may defer vector descriptors. Deep analysis builds one
    vector index at a time and releases it at the end of each page, preventing
    memory growth on large CAD-exported drawing sets.
    """
    by_key: dict[str, list[VocabularyEntry]] = defaultdict(list)
    for entry in vocabulary:
        by_key[entry.canonical_key].append(entry)

    matches: list[CrossReferenceMatch] = []
    candidates: list[DetectionCandidate] = []
    supplied = vector_indices or {}

    # DEM-backed occurrences are the primary source because they retain model
    # evidence and classification. Process page-by-page to bound memory.
    for page_index, dem_page in sorted(dem_pages.items()):
        semantic = semantics.get(page_index)
        if semantic is None or semantic.drawing_type not in _OCCURRENCE_DRAWING_TYPES:
            continue
        if page_index >= document.page_count:
            continue
        source = dem_page.get("source", {})
        zones = zones_by_page.get(page_index, [])
        page_vector_index = supplied.get(page_index)

        for category_name, row_index, row in iter_observations(dem_page):
            if category_name not in {"element_labels", "symbols"}:
                continue
            raw = str(row.get("raw") or row.get("normalized") or "")
            # Cycle-002 P2: DEM symbols carry a descriptive `normalized` that
            # hides the compact code (page-0016 F1 → "Floor Homogeneous Tile
            # 600x600mm").  Prefer the normalized key, but fall back to the
            # raw label so F1/F2 still become floor-finish items.
            key = canonical_key(str(row.get("normalized") or raw)) or canonical_key(raw)
            if not key or label_looks_like_document_noise(raw, key):
                continue
            box = normalize_dem_bbox(row.get("bbox"), source)
            if box is None:
                continue
            zone = _zone_for(box, zones)
            if zone and zone.type in {"legend", "schedule", "title_block", "notes"}:
                continue

            definition = _definition_for(key, by_key, semantic)
            inferred_category = definition.category if definition else infer_category(
                key, title=semantic.title or "", raw=raw
            )
            if not _category_is_compatible(inferred_category, semantic):
                inferred_category = "unknown"
            evidence_refs = [str(ref) for ref in row.get("evidence_refs", []) or []]
            confidence = float(row.get("confidence", 0.5))
            if definition:
                confidence = min(0.99, confidence * 0.72 + definition.confidence * 0.28)
            excluded = zone.type if zone and zone.type != "drawing" else None
            match_id = f"xref-p{page_index}-{category_name}-{row_index}-{key}"
            match = CrossReferenceMatch(
                match_id=match_id,
                label=raw,
                canonical_key=key,
                occurrence_page_index=page_index,
                occurrence_bbox=box,
                definition_entry_id=definition.entry_id if definition else None,
                definition_page_index=definition.page_index if definition else None,
                definition_bbox=definition.bbox if definition else None,
                confidence=confidence,
                excluded_zone_type=excluded,
                evidence_refs=sorted({*evidence_refs, *(definition.evidence_refs if definition else [])}),
                source_channel="dem",
            )
            matches.append(match)

            descriptor = None
            if include_vector_descriptors:
                if page_vector_index is None:
                    page_vector_index = VectorPageIndex(document[page_index])
                descriptor = page_vector_index.describe(box)
            reasons = [
                f"sheet={semantic.title}",
                f"drawing_type={semantic.drawing_type}",
                f"level={semantic.level or 'unknown'}",
                (
                    f"native_paths={descriptor.segment_count + descriptor.curve_count + descriptor.rectangle_count}"
                    if descriptor else "vector_descriptor=deferred"
                ),
            ]
            status = "candidate" if definition and confidence >= 0.75 else "needs_review"
            if definition is None:
                reasons.append("no legend/schedule definition was resolved")
            candidates.append(
                DetectionCandidate(
                    candidate_id=f"candidate-{match_id}",
                    page_index=page_index,
                    category=inferred_category,
                    label=key,
                    bbox=box,
                    confidence=confidence,
                    status=status,
                    method=(
                        "vector_similarity"
                        if descriptor and (descriptor.segment_count or descriptor.curve_count)
                        else "text_exact"
                    ),
                    descriptor=descriptor,
                    evidence_refs=evidence_refs,
                    reasons=reasons,
                )
            )

    # Native PDF fallback handles vector drawings before a DEM exists. It is
    # deduplicated against DEM boxes and remains a drawing-label observation.
    existing_boxes: dict[tuple[int, str], list] = defaultdict(list)
    dem_keys_by_page: dict[int, set[str]] = defaultdict(set)
    for match in matches:
        existing_boxes[(match.occurrence_page_index, match.canonical_key)].append(match.occurrence_bbox)
        if not match.match_id.startswith("xref-native-"):
            dem_keys_by_page[match.occurrence_page_index].add(match.canonical_key)

    if pages_by_index:
        for page_index, intelligence in sorted(pages_by_index.items()):
            semantic = intelligence.semantics
            if semantic and semantic.drawing_type in {
                "cover", "legend", "schedule", "detail", "elevation", "section",
                "single_line_diagram", "schematic",
            }:
                continue
            zones = intelligence.zones
            page_vector_index = supplied.get(page_index)
            for token in intelligence.tokens:
                # DEM tokens are already processed above. Native fallback must
                # not double-count the same DEM observation.
                if token.source == "dem":
                    continue
                key = canonical_key(token.normalized)
                if not key or key not in by_key or label_looks_like_document_noise(token.text, key):
                    continue
                # Do not suppress the entire native-PDF key merely because DEM
                # found one occurrence.  Dense CAD plans commonly contain many
                # repeated labels; deduplicate per bbox below so native text can
                # complete an incomplete DEM without double-counting.
                box = token.bbox
                zone = _zone_for(box, zones)
                if zone is None or zone.type != "drawing":
                    continue
                existing_for_key = existing_boxes.get((page_index, key), [])
                if any(_bbox_iou(box, existing_box) > 0.65 for existing_box in existing_for_key):
                    continue
                definition = _definition_for(key, by_key, semantic)
                if definition is None:
                    continue
                confidence = min(0.96, token.confidence * 0.72 + definition.confidence * 0.28)
                match_id = f"xref-native-p{page_index}-{token.token_id}-{key}"
                match = CrossReferenceMatch(
                    match_id=match_id,
                    label=token.text,
                    canonical_key=key,
                    occurrence_page_index=page_index,
                    occurrence_bbox=box,
                    definition_entry_id=definition.entry_id,
                    definition_page_index=definition.page_index,
                    definition_bbox=definition.bbox,
                    confidence=confidence,
                    evidence_refs=sorted({token.token_id, *definition.evidence_refs}),
                    source_channel="native_pdf" if token.source == "native_pdf" else "ocr",
                )
                matches.append(match)
                existing_boxes[(page_index, key)].append(box)

                descriptor = None
                if include_vector_descriptors:
                    if page_vector_index is None:
                        page_vector_index = VectorPageIndex(document[page_index])
                    descriptor = page_vector_index.describe(box)
                candidates.append(
                    DetectionCandidate(
                        candidate_id=f"candidate-{match_id}",
                        page_index=page_index,
                        category=definition.category,
                        label=key,
                        bbox=box,
                        confidence=confidence,
                        status="candidate" if confidence >= 0.75 else "needs_review",
                        method=(
                            "vector_similarity"
                            if descriptor and (descriptor.segment_count or descriptor.curve_count)
                            else "text_exact"
                        ),
                        descriptor=descriptor,
                        evidence_refs=[token.token_id],
                        reasons=[
                            "native PDF token matched project vocabulary",
                            f"drawing_type={semantic.drawing_type if semantic else 'unknown'}",
                            "count semantics remain drawing-label observation",
                        ],
                    )
                )

    return matches, candidates
