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


# ─── R4: auto-confirm count from strong plan-page label evidence ─────────────

def _dem_page_with_labels_and_type(labels: list[dict], page_index: int = 0) -> dict:
    return {
        "source": {"page_index": page_index, "width_px": 2482, "height_px": 1755},
        "sheet_identity": {"title": {"value": "DENAH FOOTPLAT"}},
        "observations": {"element_labels": labels},
    }


def test_count_auto_confirms_strongly_signaled_item():
    """PC1 with 3 distinct evidence-backed labels on its count-source page
    (foundation plan) becomes engine_confirmed — no invented number."""
    page = _dem_page_with_labels_and_type([
        {"raw": "PC1", "normalized": "PC1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-pc1-1"]},
        {"raw": "PC1", "normalized": "PC1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-pc1-2"]},
        {"raw": "PC1", "normalized": "PC1", "bbox": [300.0, 100.0, 320.0, 120.0], "evidence_refs": ["ev-pc1-3"]},
    ])
    item = _candidate("w-PC1", "foundation", "PC1", "foundation")
    item.count_source_page_indices = [0]
    result = count_occurrences([item], {0: page})
    updated = result[0]
    assert updated.verified_physical_count == 3
    assert updated.count_authority == "engine_confirmed"
    count_facts = [f for f in updated.measurement_facts if f.field == "count"]
    assert len(count_facts) == 1
    assert count_facts[0].verification_status == "engine_verified"
    assert count_facts[0].evidence_refs == ["ev-pc1-1", "ev-pc1-2", "ev-pc1-3"]
    assert "physical_count_verification" not in updated.missing_information


def test_count_does_not_auto_confirm_single_label():
    """A single label could be a legend entry — never auto-confirmed."""
    page = _dem_page_with_labels_and_type([
        {"raw": "PC1", "normalized": "PC1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-pc1-1"]},
    ])
    item = _candidate("w-PC1", "foundation", "PC1", "foundation")
    item.count_source_page_indices = [0]
    result = count_occurrences([item], {0: page})
    assert result[0].verified_physical_count is None
    assert result[0].count_authority == "candidate"


def test_count_does_not_auto_confirm_without_evidence_refs():
    """Evidence-less labels are not a strong signal — never auto-confirmed."""
    page = _dem_page_with_labels_and_type([
        {"raw": "PC1", "normalized": "PC1", "bbox": [100.0, 100.0, 120.0, 120.0]},
        {"raw": "PC1", "normalized": "PC1", "bbox": [200.0, 100.0, 220.0, 120.0]},
        {"raw": "PC1", "normalized": "PC1", "bbox": [300.0, 100.0, 320.0, 120.0]},
    ])
    item = _candidate("w-PC1", "foundation", "PC1", "foundation")
    item.count_source_page_indices = [0]
    result = count_occurrences([item], {0: page})
    assert result[0].verified_physical_count is None
    assert result[0].count_authority == "candidate"


def test_count_does_not_auto_confirm_off_count_source_page():
    """Labels on a non-count-source page (e.g. a section/detail) are not plan
    instances — no auto-confirm."""
    page = _dem_page_with_labels_and_type([
        {"raw": "RB1", "normalized": "RB1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-rb1-1"]},
        {"raw": "RB1", "normalized": "RB1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-rb1-2"]},
    ])
    item = _candidate("w-RB1", "beam", "RB1", "roof")
    item.count_source_page_indices = [1]  # count source is another page
    result = count_occurrences([item], {0: page})
    assert result[0].verified_physical_count is None
    assert result[0].count_authority == "candidate"


def test_count_auto_confirm_respects_existing_approved_count():
    """An already-approved count fact wins; auto-confirm must not override it."""
    page = _dem_page_with_labels_and_type([
        {"raw": "K1", "normalized": "K1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
        {"raw": "K1", "normalized": "K1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-2"]},
    ])
    item = _candidate(
        "w-K1", "column", "K1", "L1",
        facts=[_fact("count", 4.0, verification="human_verified", method="verified_instances")],
    )
    item.count_source_page_indices = [0]
    result = count_occurrences([item], {0: page})
    assert result[0].verified_physical_count == 4  # human-approved, not 2
    assert result[0].count_authority == "human_confirmed"


def test_deduplicate_and_count_reports_auto_confirmed_metric():
    page = _dem_page_with_labels_and_type([
        {"raw": "PC1", "normalized": "PC1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-1"]},
        {"raw": "PC1", "normalized": "PC1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-2"]},
    ])
    item = _candidate("w-PC1", "foundation", "PC1", "foundation")
    item.count_source_page_indices = [0]
    result = deduplicate_and_count([item], {0: page})
    assert result.metrics["items_with_auto_confirmed_count"] == 1
    assert result.metrics["items_with_verified_count"] == 1


# ─── Cycle-002 C2-3: fallback observability for categories without plan type ─

def test_count_auto_confirms_ceiling_from_all_observed_pages_when_no_count_source():
    """C2-3: a ceiling code (no plan-type in physical_instances) has an empty
    count-source list; two evidence-backed labels across its pages are a real
    strong signal and become engine_confirmed."""
    page = _dem_page_with_labels_and_type([
        {"raw": "C1", "normalized": "C1", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-c1-1"]},
        {"raw": "C1", "normalized": "C1", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-c1-2"]},
    ])
    item = _candidate("w-C1", "ceiling_type", "C1", "L1")
    item.count_source_page_indices = []  # ceiling has no plan type
    result = count_occurrences([item], {0: page})
    updated = result[0]
    assert updated.verified_physical_count == 2
    assert updated.count_authority == "engine_confirmed"
    count_facts = [f for f in updated.measurement_facts if f.field == "count"]
    assert len(count_facts) == 1
    assert count_facts[0].verification_status == "engine_verified"
    assert count_facts[0].evidence_refs == ["ev-c1-1", "ev-c1-2"]


def test_count_plan_scoped_item_does_not_use_section_pages_for_count():
    """C2-3: an item WITH count-source pages keeps the plan-scoped pool; labels
    on a section page must NOT inflate the verified count (cross-level safety)."""
    plan = _dem_page_with_labels_and_type([
        {"raw": "RB3", "normalized": "RB3", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-rb3-plan"]},
        {"raw": "RB3", "normalized": "RB3", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-rb3-plan2"]},
    ])
    section = _dem_page_with_labels_and_type([
        {"raw": "RB3", "normalized": "RB3", "bbox": [50.0, 50.0, 70.0, 70.0], "evidence_refs": ["ev-rb3-sec"]},
        {"raw": "RB3", "normalized": "RB3", "bbox": [300.0, 50.0, 320.0, 70.0], "evidence_refs": ["ev-rb3-sec2"]},
        {"raw": "RB3", "normalized": "RB3", "bbox": [500.0, 50.0, 520.0, 70.0], "evidence_refs": ["ev-rb3-sec3"]},
    ])
    item = _candidate("w-RB3", "beam", "RB3", "L2")
    item.count_source_page_indices = [0]  # plan page only
    result = count_occurrences([item], {0: plan, 1: section})
    updated = result[0]
    # Section labels are not plan instances: verified count stays at the two
    # plan observations, never 5.
    assert updated.verified_physical_count == 2
    assert updated.count_authority == "engine_confirmed"


# ─── P5: cross-source / cross-context dedup (cycle-p1p2) ─────────────────────

def test_p5_unknown_fallback_merges_into_classified_item():
    """K-01 on page-0086: the classified column item and the detection-less
    unknown fallback of the same (code, level) become ONE item — the fallback
    must not duplicate a classified item."""
    column = _candidate("w-column-K-01", "column", "K-01", "L1", pages=[6])
    fallback = _candidate("w-unknown-K-01", "unknown", "K-01", "L1", pages=[86])
    result = deduplicate_work_items([column, fallback])
    assert len(result) == 1
    merged = result[0]
    assert merged.category == "column"
    assert merged.code == "K-01"
    assert merged.page_indices == [6, 86]
    assert merged.attributes["level"] == "L1"


def test_p5_unknown_fallback_stays_separate_when_two_classified_categories():
    """A genuinely ambiguous code (two classified categories claim the same
    (code, level)) keeps the unknown fallback separate — never a guess."""
    column = _candidate("w-col-K-01", "column", "K-01", "L1")
    beam = _candidate("w-beam-K-01", "beam", "K-01", "L1")
    fallback = _candidate("w-unknown-K-01", "unknown", "K-01", "L1")
    result = deduplicate_work_items([column, beam, fallback])
    assert len(result) == 3  # two classified + one unknown, no forced merge


def test_p5_lt1_lintel_merge_canonical_code_and_count():
    """LT1 (spurious sheet-title code) and LINTEL (golden code) are one lintel
    family: dedup merges them under the golden code LINTEL and the observed
    count comes from the real Lintel label observations."""
    lt1 = _candidate("w-beam-LT1", "beam", "LT1", "L1", pages=[46])
    lt1.occurrence_count_observed = 1
    lintel = _candidate("w-beam-LINTEL", "beam", "LINTEL", "L1", pages=[46])
    lintel.occurrence_count_observed = 22
    result = deduplicate_work_items([lt1, lintel])
    assert len(result) == 1
    merged = result[0]
    assert merged.code == "LINTEL"
    assert merged.category == "beam"
    assert merged.page_indices == [46]
    # Count basis: max observed (22 real Lintel labels) — no invented sum.
    assert merged.occurrence_count_observed == 22


def test_p5_lt1_lintel_count_merged_from_real_observations():
    """After the LT1→LINTEL merge, count_occurrences counts the real Lintel
    DEM labels once (the merged item carries the golden code)."""
    page = _dem_page_with_labels_and_type([
        {"raw": "Lintel 15X10", "normalized": "Lintel 15X10", "bbox": [100.0, 100.0, 120.0, 120.0], "evidence_refs": ["ev-lt-1"]},
        {"raw": "Lintel 15X10", "normalized": "Lintel 15X10", "bbox": [200.0, 100.0, 220.0, 120.0], "evidence_refs": ["ev-lt-2"]},
        {"raw": "Lintel 15X10", "normalized": "Lintel 15X10", "bbox": [300.0, 100.0, 320.0, 120.0], "evidence_refs": ["ev-lt-3"]},
    ])
    lt1 = _candidate("w-beam-LT1", "beam", "LT1", "L1", pages=[46])
    lintel = _candidate("w-beam-LINTEL", "beam", "LINTEL", "L1", pages=[46])
    deduped = deduplicate_work_items([lt1, lintel])
    counted = count_occurrences(deduped, {0: page})
    assert len(counted) == 1
    assert counted[0].code == "LINTEL"
    assert counted[0].occurrence_count_observed == 3


def test_p5_sl_beam_lighting_same_page_merges_to_lighting():
    """beam-SL1 and lighting-SL1 on the SAME page describe the same sheet
    occurrence; the sheet-context lighting interpretation wins."""
    beam = _candidate("w-beam-SL1", "beam", "SL1", "L1", pages=[56])
    lighting = _candidate("w-lighting-SL1", "lighting_fixture", "SL1", "L1", pages=[56])
    result = deduplicate_work_items([beam, lighting])
    assert len(result) == 1
    merged = result[0]
    assert merged.category == "lighting_fixture"
    assert merged.code == "SL1"
    assert merged.page_indices == [56]


def test_p5_sl_disjoint_pages_stay_separate():
    """beam-SL1 on a sloof plan (page 40) and lighting-SL1 on a lighting plan
    (page 56) are different physical items — never merged."""
    beam = _candidate("w-beam-SL1", "beam", "SL1", "foundation", pages=[40])
    lighting = _candidate("w-lighting-SL1", "lighting_fixture", "SL1", "L1", pages=[56])
    result = deduplicate_work_items([beam, lighting])
    assert len(result) == 2
    categories = {item.category for item in result}
    assert categories == {"beam", "lighting_fixture"}
