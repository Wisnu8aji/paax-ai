from __future__ import annotations

"""Resolve project level/element height facts from section/elevation evidence.

This module deliberately separates a level datum from an element effective
height.  For an element code shown in a section, the closest explicit vertical
dimension is a candidate; it becomes engine-verified only when the association
is unique, close, evidence-backed, and conflict-free.
"""

from dataclasses import dataclass
from collections import defaultdict
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import DrawingConflict, ElementMeasurementFact, PageIntelligence, SourceValue, WorkItemCandidate


@dataclass(frozen=True)
class SpatialResolutionResult:
    work_items: list[WorkItemCandidate]
    conflicts: list[DrawingConflict]
    metrics: dict[str, object]


def _height_candidates(page_data: dict[str, Any]) -> list[tuple[float, Any, list[str], float]]:
    source = page_data.get("source", {})
    result = []
    for category, _, row in iter_observations(page_data):
        if category != "dimensions":
            continue
        value = row.get("numeric_value")
        unit = str(row.get("unit") or "mm").lower()
        try:
            numeric = float(value if value is not None else str(row.get("raw") or "").replace(",", "."))
        except (TypeError, ValueError):
            continue
        if unit not in {"mm", "millimeter", "millimetre"} or not 2500 <= numeric <= 6000:
            continue
        bbox = normalize_dem_bbox(row.get("bbox"), source)
        if bbox is None:
            continue
        # Storey-height dimensions on sections are predominantly vertical.
        # Horizontal grid/span dimensions (e.g. 3000, 7000) must never become
        # an element height merely because their number is plausible.
        if bbox.height <= bbox.width * 1.35:
            continue
        # Store in millimetres; bbox center/range provides association to section labels.
        result.append((numeric, bbox, [str(v) for v in row.get("evidence_refs", []) or []], float(row.get("confidence", 0.5))))
    return result


def resolve_element_heights(
    *,
    work_items: list[WorkItemCandidate],
    pages: list[PageIntelligence],
    dem_pages: dict[int, dict[str, Any]],
    existing_conflicts: list[DrawingConflict],
) -> SpatialResolutionResult:
    section_pages = {
        page.profile.page_index: page
        for page in pages
        if page.semantics and page.semantics.drawing_type in {"section", "elevation"}
    }
    candidates_by_code: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for page_index, page in section_pages.items():
        height_candidates = _height_candidates(dem_pages.get(page_index, {}))
        if not height_candidates:
            continue
        for token in page.tokens:
            code = token.normalized.upper().replace(" ", "")
            if not code or token.source != "native_pdf":
                continue
            if not any(item.code == code and item.category == "column" for item in work_items):
                continue
            _, token_y = token.bbox.center
            ranked = sorted(
                (
                    (abs(token_y - bbox.center[1]), value, bbox, refs, confidence)
                    for value, bbox, refs, confidence in height_candidates
                ),
                key=lambda row: (row[0], -row[4], row[1]),
            )
            if not ranked:
                continue
            distance, value, bbox, refs, confidence = ranked[0]
            # The code label must lie inside, or very close to, the vertical
            # interval marker.  Nearest-number matching alone is unsafe on
            # dense detail sheets.
            if not (bbox.y0 - 0.04 <= token_y <= bbox.y1 + 0.04):
                continue
            candidates_by_code[code].append({
                "page_index": page_index,
                "value": value,
                "bbox": bbox,
                "evidence_refs": sorted({token.token_id, *refs}),
                "confidence": min(token.confidence, confidence) * max(0.0, 1.0 - distance),
                "distance": distance,
                "sheet_title": page.semantics.title,
            })

    updated: list[WorkItemCandidate] = []
    new_conflicts: list[DrawingConflict] = []
    confirmed = 0
    for item in work_items:
        facts = list(item.measurement_facts)
        missing = list(item.missing_information)
        if item.category == "column" and item.code:
            candidates = sorted(candidates_by_code.get(item.code, []), key=lambda row: (-row["confidence"], row["distance"]))
            if candidates:
                best = candidates[0]
                competing_values = {
                    int(row["value"]) for row in candidates
                    if row["confidence"] >= best["confidence"] - 0.08
                }
                if len(competing_values) == 1 and best["confidence"] >= 0.70:
                    facts.append(ElementMeasurementFact(
                        measurement_id=f"mf-{item.work_item_id}-height",
                        work_item_id=item.work_item_id,
                        field="height",
                        value=float(best["value"]),
                        unit="mm",
                        source_method="written_dimension",
                        verification_status="engine_verified",
                        evidence_refs=best["evidence_refs"],
                        source_page_indices=[best["page_index"]],
                        formula_input="height",
                    ))
                    missing = [value for value in missing if value not in {"element_height", "height"}]
                    confirmed += 1
                elif len(competing_values) > 1:
                    source_values = [SourceValue(
                        value_id=f"height-{item.work_item_id}-{row['page_index']}-{int(row['value'])}",
                        field="height", value=row["value"], unit="mm",
                        page_index=row["page_index"], sheet_title=row["sheet_title"], bbox=row["bbox"],
                        evidence_refs=row["evidence_refs"], source_channel="section",
                        confidence=row["confidence"], authority_rank=100,
                    ) for row in candidates if int(row["value"]) in competing_values]
                    new_conflicts.append(DrawingConflict(
                        conflict_id=f"conflict-{item.work_item_id}-height",
                        work_item_id=item.work_item_id, field="height",
                        title=f"Tinggi efektif {item.code} berbeda pada potongan",
                        explanation="Lebih dari satu tinggi efektif memiliki dukungan potongan yang setara.",
                        source_values=source_values,
                        affected_page_indices=sorted({v.page_index for v in source_values}),
                    ))
                    missing.append("height_conflict")
            elif item.verified_physical_count is not None:
                missing.append("element_height")
        updated.append(item.model_copy(update={
            "measurement_facts": facts,
            "missing_information": sorted(dict.fromkeys(missing)),
        }, deep=True))

    all_conflicts = [*existing_conflicts, *new_conflicts]
    open_by_item = defaultdict(list)
    for conflict in all_conflicts:
        if conflict.status == "open":
            open_by_item[conflict.work_item_id].append(conflict)
    final_items = []
    for item in updated:
        conflict_ids = sorted({*item.conflict_ids, *(c.conflict_id for c in open_by_item.get(item.work_item_id, []))})
        fields = {fact.field for fact in item.measurement_facts if fact.verification_status in {"engine_verified", "human_verified"}}
        ready = item.category == "column" and {"count", "width", "depth", "height"}.issubset(fields) and not conflict_ids
        final_items.append(item.model_copy(update={
            "conflict_ids": conflict_ids,
            "calculation_readiness": "ready" if ready else "needs_input",
            "maturity": "ready_for_calculation" if ready else ("blocked" if conflict_ids else item.maturity),
        }, deep=True))
    return SpatialResolutionResult(
        work_items=final_items,
        conflicts=all_conflicts,
        metrics={"element_heights_engine_confirmed": confirmed, "height_conflicts": len(new_conflicts)},
    )
