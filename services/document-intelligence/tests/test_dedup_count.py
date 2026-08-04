"""K4 — work item deduplication and occurrence counting tests."""

from __future__ import annotations

import json
from pathlib import Path

from app.drawing_intelligence.dedup_count import (
    count_occurrences,
    deduplicate_and_count,
    deduplicate_work_items,
)
from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PAGES = _REPO_ROOT / "dem_extraction_88pages" / "pages"


def _fact(field: str, value: float = 1.0, *, verification: str = "engine_verified", method: str = "written_dimension"):
    return ElementMeasurementFact(
        measurement_id=f"mf-{field}", work_item_id="WI", field=field, value=value, unit="unit" if field == "count" else "mm",
        source_method=method, verification_status=verification, evidence_refs=[f"EV-{field}"], source_page_indices=[0],
        formula_input=field,
    )


def _candidate(
    work_item_id: str,
    category: str,
    code: str | None,
    level: str | None = "L1",
    *,
    count: int | None = None,
    facts: list[ElementMeasurementFact] | None = None,
    pages: list[int] | None = None,
):
    return WorkItemCandidate(
        work_item_id=work_item_id,
        category=category,
        code=code,
        label=code or work_item_id,
        page_indices=pages or [0],
        maturity="observed",
        occurrence_count_observed=0,
        attributes={"level": level} if level else {},
        measurement_facts=facts or [],
        verified_physical_count=count,
    )


# ─── Dedup by (category, canonical_key, level) ───────────────────────────────

def test_dedup_merges_same_key_across_pages():
    a = _candidate("w-K1-1", "column", "K1", "L1", pages=[0, 1], facts=[_fact("width", 400.0), _fact("depth", 400.0)])
    b = _candidate("w-K1-2", "column", "K1", "L1", pages=[2], facts=[_fact("width", 400.0), _fact("depth", 400.0)])
    result = deduplicate_work_items([a, b])
    assert len(result) == 1
    merged = result[0]
    assert merged.page_indices == [0, 1, 2]
    widths = [fact for fact in merged.measurement_facts if fact.field == "width"]
    assert len(widths) == 1  # facts deduplicated by (field, source_method, value)


def test_dedup_keeps_different_levels_separate():
    a = _candidate("w-K1-L1", "column", "K1", "L1")
    b = _candidate("w-K1-L2", "column", "K1", "L2")
    assert len(deduplicate_work_items([a, b])) == 2


def test_dedup_keeps_different_categories_separate():
    a = _candidate("w-K1-col", "column", "K1", "L1")
    b = _candidate("w-K1-beam", "beam", "K1", "L1")
    assert len(deduplicate_work_items([a, b])) == 2


def test_dedup_unions_evidence_and_preserves_stronger_fact():
    weak = _fact("width", 399.0, verification="candidate")
    strong = _fact("width", 400.0, verification="human_verified")
    a = _candidate("w-A", "column", "K1", "L1", facts=[weak], pages=[0])
    b = _candidate("w-B", "column", "K1", "L1", facts=[strong], pages=[1])
    result = deduplicate_work_items([a, b])
    widths = [fact for fact in result[0].measurement_facts if fact.field == "width"]
    assert len(widths) == 2  # different values kept (different evidence)
    assert any(fact.verification_status == "human_verified" for fact in widths)


def test_dedup_sums_occurrence_and_keeps_max_accepted():
    a = _candidate("w-A", "column", "K1", "L1", pages=[0])
    a.occurrence_count_observed = 3
    b = _candidate("w-B", "column", "K1", "L1", pages=[1])
    b.occurrence_count_observed = 4
    result = deduplicate_work_items([a, b])
    assert result[0].occurrence_count_observed == 4


# ─── Occurrence counting from DEM pages ──────────────────────────────────────

def _dem_page_with_labels(labels: list[dict]) -> dict:
    return {
        "source": {"page_index": 0, "width_px": 2482, "height_px": 1755},
        "observations": {"element_labels": labels},
    }


def test_count_occurrences_from_dem_labels():
    page = _dem_page_with_labels([
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
        {"raw": "K1", "normalized": "K1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-2"]},
        {"raw": "K2", "normalized": "K2", "bbox": [300.0, 100.0, 320.0, 120.0], "evidence_refs": ["ev-3"]},
    ])
    item = _candidate("w-K1", "column", "K1", "L1")
    result = count_occurrences([item], {0: page})
    assert result[0].occurrence_count_observed == 2
    assert result[0].count_source_page_indices == [0]


def test_count_occurrences_dedupes_bbox_on_same_page():
    page = _dem_page_with_labels([
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-2"]},
    ])
    item = _candidate("w-K1", "column", "K1", "L1")
    result = count_occurrences([item], {0: page})
    assert result[0].occurrence_count_observed == 1  # same bbox is one observation


def test_count_keeps_existing_larger_observed_basis():
    page = _dem_page_with_labels([
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
    ])
    item = _candidate("w-K1", "column", "K1", "L1")
    item.occurrence_count_observed = 5  # pipeline observed more (native vector)
    result = count_occurrences([item], {0: page})
    assert result[0].occurrence_count_observed == 5


def test_count_verified_from_approved_count_fact():
    item = _candidate("w-K1", "column", "K1", "L1", facts=[_fact("count", 4.0, verification="engine_verified", method="verified_instances")])
    result = count_occurrences([item], {})
    assert result[0].verified_physical_count == 4
    assert result[0].count_authority == "engine_confirmed"


def test_count_does_not_invent_verified_count():
    item = _candidate("w-K1", "column", "K1", "L1")
    result = count_occurrences([item], {})
    assert result[0].verified_physical_count is None
    assert result[0].count_authority == "candidate"


def test_deduplicate_and_count_metrics():
    page = _dem_page_with_labels([
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
    ])
    a = _candidate("w-A", "column", "K1", "L1", pages=[0])
    b = _candidate("w-B", "column", "K1", "L1", pages=[1])
    result = deduplicate_and_count([a, b], {0: page})
    assert result.metrics["duplicates_merged"] == 1
    assert result.metrics["work_items_after_dedup"] == 1
    assert result.metrics["items_with_observed_count"] == 1
