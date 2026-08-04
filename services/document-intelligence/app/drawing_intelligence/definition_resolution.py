from __future__ import annotations

"""Cross-sheet definition resolution, golden definition promotion, and
explicit conflict construction.

R1 (revision directive §3.3): ``promote_golden_definition_items`` promotes
K0 golden element labels (LINTEL, CG1, CB1, BL, GORDING, PIPA, TS, WF, H,
RAFTER, PEDESTAL, 1/2KD) to work items when evidence exists in JSON-1, even
when the sheet drawing type is a schedule/detail page that the occurrence
linker skips.
"""

from collections import defaultdict
import hashlib
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import DrawingConflict, PageIntelligence, SourceValue, VocabularyEntry, WorkItemCandidate
from .taxonomy import (
    category_from_code,
    label_looks_like_document_noise,
    resolve_golden_definition,
)
from .vocabulary import _dimension_value, canonical_key


def _dimension_tuple(attributes: dict[str, Any]) -> tuple[float, float, str] | None:
    value = attributes.get("dimensions")
    if not isinstance(value, dict):
        return None
    width = value.get("width", value.get("a"))
    depth = value.get("depth", value.get("b"))
    if width is None or depth is None:
        return None
    try:
        return float(width), float(depth), str(value.get("unit") or "mm")
    except (TypeError, ValueError):
        return None


def _authority(entry: VocabularyEntry, page: PageIntelligence | None) -> int:
    source_rank = {"schedule": 100, "legend": 95, "user": 120, "dem": 65}.get(entry.source, 70)
    if page and page.semantics:
        if page.semantics.drawing_type == "schedule":
            source_rank = max(source_rank, 100)
        elif page.semantics.drawing_type == "detail":
            source_rank = max(source_rank, 90)
    return source_rank


def resolve_definition_conflicts(
    *,
    work_items: list[WorkItemCandidate],
    vocabulary_candidates: list[VocabularyEntry],
    pages: list[PageIntelligence],
) -> tuple[list[DrawingConflict], dict[str, list[int]]]:
    page_map = {page.profile.page_index: page for page in pages}
    by_key_category: dict[tuple[str, str], list[VocabularyEntry]] = defaultdict(list)
    for entry in vocabulary_candidates:
        if _dimension_tuple(entry.attributes) is not None:
            by_key_category[(entry.canonical_key, entry.category)].append(entry)

    conflicts: list[DrawingConflict] = []
    definition_pages: dict[str, list[int]] = {}
    for item in work_items:
        candidates = by_key_category.get((item.code or "", item.category), [])
        definition_pages[item.work_item_id] = sorted({entry.page_index for entry in candidates})
        values: dict[tuple[float, float, str], list[VocabularyEntry]] = defaultdict(list)
        for entry in candidates:
            dimension = _dimension_tuple(entry.attributes)
            if dimension:
                values[dimension].append(entry)
        if len(values) <= 1:
            continue
        source_values: list[SourceValue] = []
        for dimension, entries in sorted(values.items()):
            for entry in entries:
                page = page_map.get(entry.page_index)
                title = page.semantics.title if page and page.semantics else None
                value_id = f"source-{hashlib.sha256((entry.entry_id+str(dimension)).encode()).hexdigest()[:16]}"
                source_values.append(SourceValue(
                    value_id=value_id,
                    field="dimensions",
                    value={"width": dimension[0], "depth": dimension[1]},
                    unit=dimension[2],
                    page_index=entry.page_index,
                    sheet_title=title,
                    bbox=entry.bbox,
                    evidence_refs=entry.evidence_refs,
                    source_channel=(entry.source if entry.source in {"schedule", "legend", "user"} else "dem"),
                    confidence=entry.confidence,
                    authority_rank=_authority(entry, page),
                ))
        signature = f"{item.work_item_id}:dimensions:" + ":".join(sorted(str(key) for key in values))
        conflict_id = f"conflict-{hashlib.sha256(signature.encode()).hexdigest()[:20]}"
        conflicts.append(DrawingConflict(
            conflict_id=conflict_id,
            work_item_id=item.work_item_id,
            field="dimensions",
            title=f"Ukuran {item.code or item.label} berbeda antarlembar",
            explanation=(
                "Sistem menemukan lebih dari satu ukuran untuk kode yang sama pada schedule/detail proyek. "
                "Pilih sumber yang berlaku, masukkan koreksi, atau minta lembar terkait diunggah ulang."
            ),
            source_values=source_values,
            affected_page_indices=sorted({value.page_index for value in source_values}),
        ))
    return conflicts, definition_pages


# ─── R1: golden definition promotion (K1–K4 pipeline) ─────────────────────────

_COUNT_VERIFICATION_CATEGORIES = {
    "column", "beam", "door", "window", "lighting_fixture", "electrical_fixture",
}


def promote_golden_definition_items(
    *,
    work_items: list[WorkItemCandidate],
    dem_pages: dict[int, dict[str, Any]],
    semantics: dict[int, Any],
) -> list[WorkItemCandidate]:
    """Promote K0 golden element labels to work items when JSON-1 evidence exists.

    The occurrence linker (K1/K2) only processes sheets whose drawing type is a
    plan (floor_plan, beam_plan, …).  Golden definitions that live on schedule
    or detail sheets (page-0050 TABEL BALOK, page-0055 GORDING & PD) never reach
    ``build_work_items``, which is why M2 kelengkapan measured 50% at baseline.

    This stage (R1) scans ALL DEM pages for element labels, resolves the label
    through the deterministic golden definition vocabulary (or the §4.2 code
    grammar), and promotes it to a work item when:

      - the label is not document noise (title-block filter);
      - the row carries a bounding box and evidence_refs (JSON-1 evidence);
      - the label resolves to a known category (never ``unknown``);
      - no work item with the same (category, code) exists yet at any level.

    Promoted items are marked ``attributes["definition_resolution"] = "golden"``
    so downstream status logic (M8) treats them as coded/classified items
    ("belum dihitung"), never as unclassifiable confirmation material.
    The K4 dedup stage that follows merges any residual level-key duplicates.
    """
    existing: set[tuple[str, str]] = {
        (item.category, (item.code or "").upper()) for item in work_items
    }
    promoted: list[WorkItemCandidate] = []
    for page_index, dem_page in sorted(dem_pages.items()):
        semantic = semantics.get(page_index)
        title = semantic.title if semantic else ""
        level = semantic.level if semantic else None
        source = dem_page.get("source", {})
        for category_name, row_index, row in iter_observations(dem_page):
            if category_name not in {"element_labels", "symbols"}:
                continue
            raw = str(row.get("raw") or row.get("normalized") or "")
            key = canonical_key(raw)
            if not key:
                continue
            if label_looks_like_document_noise(raw, key):
                continue
            box = normalize_dem_bbox(row.get("bbox"), source)
            if box is None:
                continue
            refs = [str(ref) for ref in row.get("evidence_refs", []) or []]
            if not refs:
                continue
            golden = resolve_golden_definition(raw)
            if golden:
                code, category = golden
            else:
                category = category_from_code(key, title=title, raw=raw)
                code = key
                if category == "unknown":
                    continue
            if (category, code.upper()) in existing:
                continue
            existing.add((category, code.upper()))

            attributes: dict[str, Any] = {
                "level": level or "unknown",
                "raw": raw,
                "sheet_title": title,
                "definition_resolution": "golden",
                "definition_page_index": page_index,
            }
            dimensions = _dimension_value(row)
            if dimensions:
                attributes["dimensions"] = dimensions
            missing: list[str] = []
            if not level or level == "unknown":
                missing.append("level")
            if not dimensions:
                missing.append("type_dimensions")
            if category in _COUNT_VERIFICATION_CATEGORIES:
                missing.extend(
                    ["physical_count_verification", "human verification of physical-instance count"]
                )
            promoted.append(
                WorkItemCandidate(
                    work_item_id=f"work-{category}-{code}-{level or 'unknown'}",
                    category=category,
                    code=code,
                    label=raw,
                    page_indices=[page_index],
                    maturity="classified",  # type: ignore[arg-type]
                    occurrence_count_observed=1,
                    accepted_detection_count=0,
                    geometry_kind="count",
                    evidence_refs=refs,
                    source_candidate_ids=[
                        f"golden-{category_name}-p{page_index}-{row_index}-{key}"
                    ],
                    attributes=attributes,
                    missing_information=missing,
                    review_task_ids=[],
                    user_accepted=False,
                )
            )
    return [*work_items, *promoted]
