from __future__ import annotations


"""K4 — Work item deduplication and occurrence counting.

Master Plan §4.3 K4: one ``(category, canonical_key, level)`` is one item;
dedup across pages; ``occurrence_count_observed`` is the observed basis and
``verified_physical_count`` is set after instance verification.

This module is a deterministic safety net on top of ``build_work_items``:
- ``deduplicate_work_items`` merges any residual duplicates by the K4 key and
  unions evidence, pages, facts, and counts.
- ``count_occurrences`` counts DEM element-label observations per code as the
  observed-occurrence basis, then derives the verified count from an approved
  count fact (never invents a number).

Revision cycle-001 (R4): auto-confirm the verified count for strongly-signaled
items.  When an item is classified, coded, conflict-free, and its code has
multiple distinct DEM element-label observations — each carrying
``evidence_refs`` — on the item's count-source pages (the plan sheet types
``physical_instances`` already selected), the observed count is promoted to
``verified_physical_count`` with ``count_authority="engine_confirmed"`` and an
engine-verified count fact.  The number is never invented: it is the count of
real label observations in JSON-1 on the plan page.

The module never fabricates counts and never drops evidence.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import ElementMeasurementFact, WorkItemCandidate
from .vocabulary import canonical_key

_VERIFICATION_RANK = {
    "candidate": 0,
    "engine_verified": 1,
    "human_verified": 2,
    "superseded": -1,
}
_COUNT_AUTHORITY_RANK = {
    "candidate": 0,
    "engine_confirmed": 1,
    "human_confirmed": 2,
    "conflicting": -1,
}

# R4: a verified count requires at least this many distinct label observations
# on count-source pages.  A single label could be a legend/table entry, not a
# plan instance; two or more distinct plan labels are a strong signal.
_MIN_AUTO_CONFIRM_OBSERVATIONS = 2


@dataclass(frozen=True)
class DedupCountResult:
    work_items: list[WorkItemCandidate]
    metrics: dict[str, object]


def _level_of(item: WorkItemCandidate) -> str:
    level = item.attributes.get("level")
    return str(level) if level and level != "unknown" else "unknown"


def _canonical_key_of(item: WorkItemCandidate) -> str:
    code = (item.code or "").strip()
    if code:
        return code.upper()
    key = canonical_key(item.label)
    return (key or item.label or "unknown").upper()


def _fact_key(fact: ElementMeasurementFact) -> tuple[str, str, str, float]:
    return (fact.field, fact.source_method, fact.formula_input or "", float(fact.value))


def _merge_facts(groups: list[list[ElementMeasurementFact]]) -> list[ElementMeasurementFact]:
    best: dict[tuple[str, str, str, float], ElementMeasurementFact] = {}
    for facts in groups:
        for fact in facts:
            key = _fact_key(fact)
            current = best.get(key)
            if current is None or _VERIFICATION_RANK.get(fact.verification_status, 0) > _VERIFICATION_RANK.get(
                current.verification_status, 0
            ):
                best[key] = fact
    return sorted(best.values(), key=lambda fact: (fact.field, fact.source_method))


def deduplicate_work_items(work_items: list[WorkItemCandidate]) -> list[WorkItemCandidate]:
    """Merge items sharing (category, canonical_key, level) into one item."""
    groups: dict[tuple[str, str, str], list[WorkItemCandidate]] = defaultdict(list)
    for item in work_items:
        key = (item.category.strip().lower(), _canonical_key_of(item), _level_of(item))
        groups[key].append(item)

    merged: list[WorkItemCandidate] = []
    merged_duplicates = 0
    for key in sorted(groups):
        group = groups[key]
        if len(group) > 1:
            merged_duplicates += len(group) - 1
        primary = group[0]
        # Deterministic order so attribute merging is stable across runs.
        ordered = sorted(group, key=lambda item: (len(item.page_indices), item.work_item_id), reverse=True)

        page_indices = sorted({page for item in group for page in item.page_indices})
        evidence_refs = sorted({ref for item in group for ref in item.evidence_refs})
        source_candidate_ids = sorted({cid for item in group for cid in item.source_candidate_ids})
        review_task_ids = sorted({tid for item in group for tid in item.review_task_ids})
        physical_instance_ids = sorted({pid for item in group for pid in item.physical_instance_ids})
        conflict_ids = sorted({cid for item in group for cid in item.conflict_ids})
        count_source_pages = sorted({page for item in group for page in item.count_source_page_indices})
        definition_pages = sorted({page for item in group for page in item.definition_source_page_indices})

        attributes: dict[str, Any] = {}
        for item in group:
            for attr_key, value in item.attributes.items():
                if attr_key in attributes and attributes[attr_key] == value:
                    continue
                attributes[attr_key] = value
        # Keep the level from the key if any duplicate lost it.
        attributes["level"] = key[2] if key[2] != "unknown" else attributes.get("level")

        facts = _merge_facts([item.measurement_facts for item in group])

        occurrence = max(item.occurrence_count_observed for item in group)
        accepted = max(item.accepted_detection_count for item in group)
        verified = next((item.verified_physical_count for item in group if item.verified_physical_count is not None), None)
        count_authority = max(
            (item.count_authority for item in group),
            key=lambda value: _COUNT_AUTHORITY_RANK.get(value, 0),
        )

        # Merge missing_information (union) and keep the least mature maturity.
        missing = sorted({value for item in group for value in item.missing_information})
        maturity_rank = {"observed": 0, "classified": 1, "geometry_ready": 2, "review_ready": 3,
                         "system_confirmed": 4, "human_confirmed": 5, "ready_for_calculation": 6,
                         "calculated": 7, "accepted": 8, "blocked": 9}
        maturity = min(group, key=lambda item: maturity_rank.get(item.maturity, 9)).maturity

        merged.append(primary.model_copy(update={
            "category": key[0],
            "code": _canonical_key_of(primary) if primary.code else primary.code,
            "page_indices": page_indices,
            "maturity": maturity,
            "occurrence_count_observed": occurrence,
            "accepted_detection_count": accepted,
            "evidence_refs": evidence_refs,
            "source_candidate_ids": source_candidate_ids,
            "attributes": attributes,
            "missing_information": missing,
            "review_task_ids": review_task_ids,
            "verified_physical_count": verified,
            "count_authority": count_authority,
            "count_source_page_indices": count_source_pages,
            "definition_source_page_indices": definition_pages,
            "physical_instance_ids": physical_instance_ids,
            "conflict_ids": conflict_ids,
            "measurement_facts": facts,
        }, deep=True))

    return merged


def count_occurrences(
    work_items: list[WorkItemCandidate],
    dem_pages: dict[int, dict[str, Any]],
    _stats: dict[str, Any] | None = None,
) -> list[WorkItemCandidate]:
    """Set the observed-occurrence basis from DEM element labels and the
    verified count from an approved count fact or a strong auto-confirm signal.

    ``occurrence_count_observed`` is the number of distinct DEM element-label
    observations matching the item code (deduplicated by bbox); the existing
    pipeline value is kept when it is larger.  ``verified_physical_count`` is
    taken only from a ``count`` fact whose verification is engine/human
    verified, or — R4 — from multiple distinct, evidence-backed label
    observations on the item's count-source pages.  Never invented.

    ``_stats`` (optional) receives ``{"auto_confirmed_count": n}`` for
    observability without changing the public return contract.
    """
    # Index DEM element labels by canonical key: per-page distinct bbox sets,
    # the pages on which each bbox was observed, and whether every observation
    # carries evidence_refs.
    observed_by_code: dict[str, set[tuple[float, float, float, float]]] = defaultdict(set)
    observed_pages_by_code: dict[str, set[int]] = defaultdict(set)
    # code -> page -> set of bbox tuples (distinct plan instances per page)
    observed_by_code_page: dict[str, dict[int, set[tuple[float, float, float, float]]]] = defaultdict(lambda: defaultdict(set))
    # code -> page -> bbox -> evidence refs
    refs_by_code_page_box: dict[str, dict[int, dict[tuple[float, float, float, float], list[str]]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    for page_index, page in dem_pages.items():
        source = page.get("source", {})
        for category, _, row in iter_observations(page):
            if category != "element_labels":
                continue
            raw = str(row.get("raw") or row.get("normalized") or "")
            key = canonical_key(raw)
            if not key:
                continue
            box = normalize_dem_bbox(row.get("bbox"), source)
            if box is None:
                continue
            refs = [str(ref) for ref in row.get("evidence_refs", []) or []]
            observed_by_code[key.upper()].add(box.values)
            observed_pages_by_code[key.upper()].add(page_index)
            observed_by_code_page[key.upper()][page_index].add(box.values)
            # Union refs per (page, bbox); the same instance may appear once.
            existing_refs = refs_by_code_page_box[key.upper()][page_index].get(box.values, [])
            refs_by_code_page_box[key.upper()][page_index][box.values] = sorted({*existing_refs, *refs})

    updated: list[WorkItemCandidate] = []
    counted = 0
    verified = 0
    auto_confirmed = 0
    for item in work_items:
        code = _canonical_key_of(item)
        observed = len(observed_by_code.get(code, set()))
        observed_pages = sorted(observed_pages_by_code.get(code, set()))
        occurrence = max(item.occurrence_count_observed, observed)
        if observed:
            counted += 1

        count_facts = [fact for fact in item.measurement_facts if fact.field == "count"]
        approved_counts = [
            fact for fact in count_facts
            if fact.verification_status in {"engine_verified", "human_verified"}
            and fact.source_method != "written_dimension"
        ]
        verified_value: int | None = item.verified_physical_count
        count_authority = item.count_authority
        if approved_counts:
            fact_value = int(round(approved_counts[0].value))
            if verified_value is None or fact_value > verified_value:
                verified_value = fact_value
            if any(fact.verification_status == "human_verified" for fact in approved_counts):
                count_authority = "human_confirmed"
            elif count_authority in {"candidate", "conflicting"}:
                count_authority = "engine_confirmed"
            verified += 1

        # ── R4 + C2-3: auto-confirm strong count signal from plan labels ─────
        # A classified, coded, conflict-free item whose code has at least
        # `_MIN_AUTO_CONFIRM_OBSERVATIONS` distinct, evidence-backed DEM label
        # observations receives an engine-confirmed verified count.  The
        # number is the observed instance count — never an invention.
        #
        # Cycle-002 C2-3: when the item has plan-scoped count-source pages
        # (physical_instances selected them), only those pages are used —
        # expanding to every page would double-count section/detail labels for
        # cross-level items (e.g. RB3 on L2 vs roof).  When the category has no
        # plan-type (ceiling, pipe, trekstang, kuda_kuda, ...), count-source is
        # empty and the observation pool falls back to every DEM page where the
        # code's label was observed — a real, evidence-backed strong signal.
        # All R4 guards remain: evidence_refs on every instance, bbox-distinct
        # instances, approved count wins, no conflicts, no unknown category.
        if (
            verified_value is None
            and count_authority == "candidate"
            and item.category != "unknown"
            and item.code
            and not item.conflict_ids
        ):
            if item.count_source_page_indices:
                observation_pages = sorted(item.count_source_page_indices)
            else:
                observation_pages = sorted(observed_by_code_page.get(code, {}).keys())
            instances: set[tuple[int, tuple[float, float, float, float]]] = set()
            all_evidence = True
            evidence_refs: set[str] = set()
            for page_index in observation_pages:
                for box in observed_by_code_page.get(code, {}).get(page_index, set()):
                    instances.add((page_index, box))
                    refs = refs_by_code_page_box.get(code, {}).get(page_index, {}).get(box, [])
                    if not refs:
                        all_evidence = False
                    evidence_refs.update(refs)
            if len(instances) >= _MIN_AUTO_CONFIRM_OBSERVATIONS and all_evidence:
                verified_value = len(instances)
                count_authority = "engine_confirmed"
                evidence_refs_sorted = sorted(evidence_refs)
                # The promoted count is a verified-instances fact with the
                # exact evidence of the observed plan labels.
                facts = list(item.measurement_facts)
                facts.append(ElementMeasurementFact(
                    measurement_id=f"mf-{item.work_item_id}-count",
                    work_item_id=item.work_item_id,
                    field="count",
                    value=float(verified_value),
                    unit="unit",
                    source_method="verified_instances",
                    verification_status="engine_verified",
                    evidence_refs=evidence_refs_sorted,
                    source_page_indices=sorted({page for page, _ in instances}),
                    formula_input="count",
                ))
                missing = [value for value in item.missing_information if value not in {
                    "physical_count_verification", "human verification of physical-instance count",
                }]
                item = item.model_copy(update={"measurement_facts": facts, "missing_information": missing}, deep=True)
                verified += 1
                auto_confirmed += 1

        updated.append(item.model_copy(update={
            "occurrence_count_observed": occurrence,
            "verified_physical_count": verified_value,
            "count_authority": count_authority,
            "count_source_page_indices": sorted({*item.count_source_page_indices, *observed_pages}),
        }, deep=True))
    if _stats is not None:
        _stats["auto_confirmed_count"] = auto_confirmed
    return updated


def deduplicate_and_count(
    work_items: list[WorkItemCandidate],
    dem_pages: dict[int, dict[str, Any]],
) -> DedupCountResult:
    """Run the K4 pipeline: dedup by (category, canonical_key, level), then
    count occurrences and verified counts."""
    before = len(work_items)
    deduped = deduplicate_work_items(work_items)
    stats: dict[str, Any] = {}
    counted = count_occurrences(deduped, dem_pages, _stats=stats)
    return DedupCountResult(
        work_items=counted,
        metrics={
            "work_items_before_dedup": before,
            "work_items_after_dedup": len(counted),
            "duplicates_merged": before - len(counted),
            "items_with_observed_count": sum(1 for item in counted if item.occurrence_count_observed > 0),
            "items_with_verified_count": sum(1 for item in counted if item.verified_physical_count is not None),
            "items_with_auto_confirmed_count": stats.get("auto_confirmed_count", 0),
        },
    )
