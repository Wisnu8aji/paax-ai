from __future__ import annotations

"""Cross-sheet definition resolution and explicit conflict construction."""

from collections import defaultdict
import hashlib
from typing import Any

from .models import DrawingConflict, PageIntelligence, SourceValue, VocabularyEntry, WorkItemCandidate


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
