from __future__ import annotations

from collections import defaultdict
from typing import Any

from .models import (
    CrossReferenceMatch,
    DetectionCandidate,
    ReviewTask,
    SheetSemanticProfile,
    VocabularyEntry,
    WorkItemCandidate,
)


def build_work_items(
    *,
    matches: list[CrossReferenceMatch],
    detections: list[DetectionCandidate],
    vocabulary: list[VocabularyEntry],
    semantics: dict[int, SheetSemanticProfile],
) -> tuple[list[WorkItemCandidate], list[ReviewTask]]:
    vocab_by_id = {entry.entry_id: entry for entry in vocabulary}
    detection_by_match = {
        detection.candidate_id.removeprefix("candidate-"): detection for detection in detections
    }
    grouped: dict[tuple[str, str, str], list[CrossReferenceMatch]] = defaultdict(list)
    for match in matches:
        detection = detection_by_match.get(match.match_id)
        category = detection.category if detection else "unknown"
        level = semantics.get(match.occurrence_page_index).level if semantics.get(match.occurrence_page_index) else None
        grouped[(category, match.canonical_key, level or "unknown")].append(match)

    work_items: list[WorkItemCandidate] = []
    review_tasks: list[ReviewTask] = []
    for (category, key, level), group in sorted(grouped.items()):
        source_candidates = [detection_by_match[match.match_id] for match in group if match.match_id in detection_by_match]
        definition = next(
            (vocab_by_id[match.definition_entry_id] for match in group if match.definition_entry_id in vocab_by_id),
            None,
        )
        attributes: dict[str, Any] = {
            "level": level,
            "count_semantics": "drawing_label_observation",
            "definition_entry_id": definition.entry_id if definition else None,
            "definition_page_index": definition.page_index if definition else None,
        }
        if definition:
            attributes.update(definition.attributes)
        missing: list[str] = []
        if definition is None:
            missing.append("legend_or_schedule_definition")
        if definition and "dimensions" not in definition.attributes and category in {"column", "beam", "door", "window"}:
            missing.append("type_dimensions")
        if level == "unknown":
            missing.append("level")
        if category in {"column", "beam", "door", "window", "lighting_fixture", "electrical_fixture"}:
            missing.extend(["physical_count_verification", "human verification of physical-instance count"])
        vector_ready = bool(source_candidates) and all(
            candidate.descriptor is not None
            and (candidate.descriptor.segment_count + candidate.descriptor.curve_count + candidate.descriptor.rectangle_count) > 0
            for candidate in source_candidates
        )
        if definition and vector_ready:
            maturity = "review_ready"
        elif definition:
            maturity = "classified"
        else:
            maturity = "observed"
        task_ids: list[str] = []
        if missing or any(candidate.status == "needs_review" for candidate in source_candidates):
            task_id = f"review-{category}-{key}-{level}"
            task_ids.append(task_id)
            review_tasks.append(
                ReviewTask(
                    task_id=task_id,
                    page_index=min(match.occurrence_page_index for match in group),
                    task_type="work_item",
                    title=f"Review {key} on {level}",
                    reason="; ".join(missing or ["one or more detections need review"]),
                    candidate_ids=[candidate.candidate_id for candidate in source_candidates],
                    evidence_refs=sorted({ref for match in group for ref in match.evidence_refs}),
                    severity="blocking" if definition is None else "review",
                )
            )
        work_items.append(
            WorkItemCandidate(
                work_item_id=f"work-{category}-{key}-{level}",
                category=category,
                code=key,
                label=definition.description if definition and definition.description else key,
                page_indices=sorted({match.occurrence_page_index for match in group}),
                maturity=maturity,  # type: ignore[arg-type]
                occurrence_count_observed=len(group),
                accepted_detection_count=0,
                geometry_kind="count",
                evidence_refs=sorted({ref for match in group for ref in match.evidence_refs}),
                source_candidate_ids=[candidate.candidate_id for candidate in source_candidates],
                attributes=attributes,
                missing_information=missing,
                review_task_ids=task_ids,
                user_accepted=False,
            )
        )
    return work_items, review_tasks
