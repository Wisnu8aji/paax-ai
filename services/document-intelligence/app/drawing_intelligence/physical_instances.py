from __future__ import annotations

"""Deterministic physical-instance reconstruction for countable drawing elements.

The engine does not infer quantities from prose.  It selects a class-specific
count-source sheet, prefers native vector text on vector/hybrid drawings,
deduplicates observations spatially, and only promotes a count when every
bounded constraint is satisfied.  DEM remains semantic corroboration and a
quality signal, never an additive count channel.
"""

from collections import defaultdict
from dataclasses import dataclass
import hashlib
from typing import Iterable

from .models import (
    CrossReferenceMatch,
    DrawingConflict,
    ElementMeasurementFact,
    PageIntelligence,
    PhysicalInstance,
    ReviewTask,
    WorkItemCandidate,
)

_COUNT_SOURCE_TYPES: dict[str, set[str]] = {
    "column": {"column_plan"},
    "beam": {"beam_plan"},
    "slab": {"slab_plan"},
    "foundation": {"foundation_plan"},
    "door": {"door_window_plan", "floor_plan"},
    "window": {"door_window_plan", "floor_plan"},
    "door_window_assembly": {"door_window_plan", "floor_plan"},
    "lighting_fixture": {"lighting_plan"},
    "electrical_fixture": {"power_plan", "lightning_protection"},
    "fire_safety_fixture": {"fire_safety_plan"},
    "hvac_fixture": {"hvac_plan"},
    "plumbing_fixture": {"plumbing_plan", "drainage_plan"},
}

# Auto-confirm thresholds are intentionally class-specific.  They are release
# calibration defaults, not a claim of universal accuracy.
_AUTO_CONFIRM_THRESHOLD: dict[str, float] = {
    "column": 0.88,
    "beam": 0.91,
    "slab": 0.94,
    "foundation": 0.90,
    "door": 0.92,
    "window": 0.92,
    "door_window_assembly": 0.93,
    "lighting_fixture": 0.94,
    "electrical_fixture": 0.94,
    "fire_safety_fixture": 0.95,
    "hvac_fixture": 0.95,
    "plumbing_fixture": 0.95,
}


@dataclass(frozen=True)
class ReconstructionResult:
    work_items: list[WorkItemCandidate]
    instances: list[PhysicalInstance]
    review_tasks: list[ReviewTask]
    metrics: dict[str, object]


def _iou(a, b) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    intersection = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    union = a.area + b.area - intersection
    return intersection / union if union else 0.0


def _near(a, b, tolerance: float = 0.012) -> bool:
    ax, ay = a.center
    bx, by = b.center
    return abs(ax - bx) <= tolerance and abs(ay - by) <= tolerance


def _deduplicate(matches: Iterable[CrossReferenceMatch]) -> list[CrossReferenceMatch]:
    ordered = sorted(matches, key=lambda item: (item.occurrence_page_index, -item.confidence, item.match_id))
    kept: list[CrossReferenceMatch] = []
    for match in ordered:
        duplicate = next(
            (
                current for current in kept
                if current.occurrence_page_index == match.occurrence_page_index
                and (_iou(current.occurrence_bbox, match.occurrence_bbox) >= 0.55
                     or _near(current.occurrence_bbox, match.occurrence_bbox))
            ),
            None,
        )
        if duplicate is None:
            kept.append(match)
            continue
        # Native vector text is the stronger count observation on a vector PDF.
        if match.source_channel == "native_pdf" and duplicate.source_channel != "native_pdf":
            kept[kept.index(duplicate)] = match
    return kept


def _count_source_pages(item: WorkItemCandidate, pages: dict[int, PageIntelligence]) -> list[int]:
    allowed = _COUNT_SOURCE_TYPES.get(item.category, set())
    return sorted(
        page_index for page_index in item.page_indices
        if page_index in pages
        and pages[page_index].semantics is not None
        and pages[page_index].semantics.drawing_type in allowed
    )


def reconstruct_physical_instances(
    *,
    work_items: list[WorkItemCandidate],
    matches: list[CrossReferenceMatch],
    pages: list[PageIntelligence],
    conflicts: list[DrawingConflict],
) -> ReconstructionResult:
    page_map = {page.profile.page_index: page for page in pages}
    matches_by_key_level: dict[tuple[str, str], list[CrossReferenceMatch]] = defaultdict(list)
    for match in matches:
        semantic = page_map.get(match.occurrence_page_index)
        level = semantic.semantics.level if semantic and semantic.semantics else None
        matches_by_key_level[(match.canonical_key, level or "unknown")].append(match)
    conflicts_by_item: dict[str, list[DrawingConflict]] = defaultdict(list)
    for conflict in conflicts:
        conflicts_by_item[conflict.work_item_id].append(conflict)

    updated: list[WorkItemCandidate] = []
    instances: list[PhysicalInstance] = []
    review_tasks: list[ReviewTask] = []
    channel_differences: list[dict[str, object]] = []
    confirmed_items = 0

    for item in work_items:
        level = str(item.attributes.get("level") or "unknown")
        group = matches_by_key_level.get((item.code or "", level), [])
        count_pages = _count_source_pages(item, page_map)
        scoped = [match for match in group if match.occurrence_page_index in count_pages]
        native = [match for match in scoped if match.source_channel == "native_pdf"]
        dem = [match for match in scoped if match.source_channel == "dem"]
        # Vector-first authority; DEM is used only when the count-source sheet
        # has no native text occurrences (scan/raster or unavailable extraction).
        authoritative = native if native else dem
        authoritative = _deduplicate(authoritative)
        native_count = len(_deduplicate(native))
        dem_count = len(_deduplicate(dem))
        if native and dem and native_count != dem_count:
            channel_differences.append({
                "work_item_id": item.work_item_id,
                "code": item.code,
                "level": level,
                "native_pdf_count": native_count,
                "dem_count": dem_count,
                "meaning": "model_quality_audit_not_drawing_conflict",
            })

        item_conflicts = [value for value in conflicts_by_item.get(item.work_item_id, []) if value.status == "open"]
        min_confidence = min((match.confidence for match in authoritative), default=0.0)
        threshold = _AUTO_CONFIRM_THRESHOLD.get(item.category, 0.99)
        dimensions_ready = bool(item.attributes.get("dimensions")) or item.category not in {
            "column", "beam", "foundation", "door", "window", "door_window_assembly"
        }
        vector_page = bool(count_pages) and all(
            page_map[index].profile.modality in {"vector", "hybrid"} for index in count_pages
        )
        evidence_ready = bool(authoritative) and all(match.evidence_refs for match in authoritative)
        system_confirmed = bool(
            authoritative
            and count_pages
            and dimensions_ready
            and evidence_ready
            and not item_conflicts
            and min_confidence >= threshold
            and (bool(native) if vector_page else True)
        )

        instance_ids: list[str] = []
        for ordinal, match in enumerate(authoritative, start=1):
            fingerprint = f"{item.work_item_id}:{match.occurrence_page_index}:{match.occurrence_bbox.values}:{ordinal}"
            instance_id = f"instance-{hashlib.sha256(fingerprint.encode()).hexdigest()[:20]}"
            instance_ids.append(instance_id)
            instances.append(PhysicalInstance(
                instance_id=instance_id,
                work_item_id=item.work_item_id,
                category=item.category,
                code=item.code or "",
                level=None if level == "unknown" else level,
                page_index=match.occurrence_page_index,
                bbox=match.occurrence_bbox,
                evidence_refs=match.evidence_refs,
                source_channel=("native_pdf" if match.source_channel == "native_pdf" else match.source_channel),
                confidence=match.confidence,
                authority="engine_confirmed" if system_confirmed else "candidate",
            ))

        review_ids = [] if system_confirmed else list(item.review_task_ids)
        missing = [value for value in item.missing_information if value not in {
            "physical_count_verification", "human verification of physical-instance count"
        }]
        count_authority = "engine_confirmed" if system_confirmed else ("conflicting" if item_conflicts else "candidate")
        verified_count = len(authoritative) if system_confirmed else None
        measurement_facts = list(item.measurement_facts)
        if system_confirmed:
            confirmed_items += 1
            measurement_facts.append(ElementMeasurementFact(
                measurement_id=f"mf-{item.work_item_id}-count",
                work_item_id=item.work_item_id,
                field="count",
                value=float(verified_count or 0),
                unit="unit",
                source_method="verified_instances",
                verification_status="engine_verified",
                evidence_refs=sorted({ref for match in authoritative for ref in match.evidence_refs}),
                source_page_indices=count_pages,
                formula_input="count",
            ))
        else:
            if item.category in _COUNT_SOURCE_TYPES:
                if not count_pages:
                    missing.append("authoritative_count_source")
                elif not authoritative:
                    missing.append("physical_instances")
                elif not dimensions_ready:
                    missing.append("type_dimensions")
                elif not evidence_ready:
                    missing.append("count_evidence")
                elif min_confidence < threshold:
                    missing.append("count_confidence_below_threshold")
                if item_conflicts:
                    missing.append("open_drawing_conflict")
                task_id = f"review-physical-{item.work_item_id}"
                review_tasks.append(ReviewTask(
                    task_id=task_id,
                    page_index=count_pages[0] if count_pages else min(item.page_indices or [0]),
                    task_type="work_item",
                    title=f"Konfirmasi jumlah fisik {item.code or item.label}",
                    reason="; ".join(sorted(dict.fromkeys(missing))) or "jumlah fisik belum memenuhi constraint",
                    candidate_ids=item.source_candidate_ids,
                    evidence_refs=item.evidence_refs,
                    severity="blocking" if item_conflicts else "review",
                ))
                review_ids = sorted({*item.review_task_ids, task_id})
            else:
                review_ids = item.review_task_ids

        updated.append(item.model_copy(update={
            "maturity": "system_confirmed" if system_confirmed else ("blocked" if item_conflicts else item.maturity),
            "accepted_detection_count": verified_count or 0,
            "verified_physical_count": verified_count,
            "count_authority": count_authority,
            "count_source_page_indices": count_pages,
            "physical_instance_ids": instance_ids,
            "conflict_ids": [conflict.conflict_id for conflict in item_conflicts],
            "measurement_facts": measurement_facts,
            "missing_information": sorted(dict.fromkeys(missing)),
            "review_task_ids": review_ids,
        }, deep=True))

    return ReconstructionResult(
        work_items=updated,
        instances=instances,
        review_tasks=review_tasks,
        metrics={
            "physical_instance_candidates": len(instances),
            "physical_instances_engine_confirmed": sum(item.authority == "engine_confirmed" for item in instances),
            "work_items_count_engine_confirmed": confirmed_items,
            "count_channel_differences": channel_differences,
        },
    )
