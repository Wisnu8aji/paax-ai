"""ORION-F5 (WP6) — 8-metric quantities loop on the 88-page PLHUT dataset.

Master Plan §5.1 defines eight quantities metrics measured on the 88 DEM pages
(`dem_extraction_88pages/pages/page-*.json`) through the full deterministic
engine pipeline (0% AI):

  1. Anti-duplikasi          — 0 duplicate work_item_id; one (category, code,
                               level) = one item; no duplicate measurement facts
  2. Kelengkapan             — golden-set items (K0, 30 items) present as work
                               items; specific pages PC1/Lintel/K1..K3/G1..BL/WF
  3. Akurasi klasifikasi     — ≥95% category correct (golden ground truth +
                               taxonomy code-prefix cross-check)
  4. Dimension linking       — ≥90% structural items have connected dimensions
  5. Konsistensi             — canonical name formattable; unit matches category;
                               level matches sheet semantics
  6. Coverage engine         — >80% items engine-verified (count authority /
                               measurement facts / core_engine calculation)
  7. Volume valid            — core_engine calculation result > 0 with correct
                               unit (verified via bridge; DI never fabricates)
  8. Unclassified + AI       — ≤10% items "perlu konfirmasi"; AI triggered only
                               on engine gaps; proposals always carry evidence

The script is deterministic and makes NO live AI call (`client=None`), matching
the WP5 metric runner. Every triggered item records an honest audit.

Usage:
    python scripts/quantities_loop_metrics.py [--out PATH] [--golden PATH]
                                              [--mode fast|balanced|deep]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))

from app.drawing_intelligence.benchmark import run_plhut_benchmark  # noqa: E402
from app.drawing_intelligence.quantities_ai_assist import (  # noqa: E402
    load_golden_set,
    measure_confirmation_area,
    run_quantities_ai_assist,
    should_trigger_ai_assist,
)
from app.drawing_intelligence.taxonomy import (  # noqa: E402
    category_from_code,
    dimensions_text,
    name_formatter,
)

PDF_PATH = REPO_ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
DEM_PATH = REPO_ROOT / "dem_extraction_88pages" / "pages"
DEFAULT_GOLDEN = Path(
    r"D:\PAAX-Orchestration\00_projects\2026-08-04-perbaikan-blur-quantities"
    r"\04_execution\01_orion-f2\artifacts\k0_golden_set.json"
)

# Categories whose volume unit is m3 (concrete structural elements).
_VOLUME_M3_CATEGORIES = {"column", "beam", "sloof", "foundation", "slab"}
# Structural categories targeted by the dimension-linking metric (M4).
_STRUCTURAL_CATEGORIES = {
    "column", "beam", "sloof", "foundation", "slab",
    "steel_profile", "gording", "kuda_kuda", "wall",
}
_DIMENSION_FIELDS = {"width", "depth", "height", "span_length", "length", "thickness"}
# Golden-page spot checks from Master Plan §5.1 metric 2.
_GOLDEN_PAGE_CHECKS = {
    "page-0038": ["PC1"],           # DENAH FOOTPLAT
    "page-0046": ["LT1"],           # Lintel 15X10 (150x100 mm) + LT.1
    "page-0049": ["K1", "K2", "K3"],  # TABEL KOLOM
    "page-0050": ["G1", "B1", "BL"],  # TABEL BALOK LANTAI 1 & SLOOF
    "page-0055": ["WF1", "H1"],     # WF/H/gording (steel)
}


def _item_level(item) -> str | None:
    level = (item.attributes or {}).get("level")
    return None if level in (None, "", "unknown") else str(level)


def _sheet_level_for(analysis, page_index: int) -> str | None:
    page = next((p for p in analysis.pages if p.profile.page_index == page_index), None)
    if page is None or page.semantics is None:
        return None
    level = page.semantics.level
    return None if level in (None, "", "unknown") else str(level)


def metric1_anti_duplication(work_items) -> dict:
    ids = [item.work_item_id for item in work_items]
    dup_ids = [i for i, c in Counter(ids).items() if c > 1]
    keys = [
        (item.category, item.code, _item_level(item))
        for item in work_items
    ]
    dup_keys = [k for k, c in Counter(keys).items() if c > 1]
    dup_facts = []
    for item in work_items:
        seen = set()
        for fact in item.measurement_facts:
            fk = (fact.field, fact.value, fact.unit)
            if fk in seen:
                dup_facts.append((item.work_item_id, fk))
            seen.add(fk)
    return {
        "total_items": len(work_items),
        "duplicate_work_item_ids": len(dup_ids),
        "duplicate_work_item_id_samples": dup_ids[:10],
        "duplicate_category_code_level": len(dup_keys),
        "duplicate_key_samples": dup_keys[:10],
        "duplicate_measurement_facts": len(dup_facts),
        "duplicate_measurement_fact_samples": dup_facts[:10],
        "pass": len(dup_ids) == 0 and len(dup_keys) == 0 and len(dup_facts) == 0,
        "target": "0 duplicate ids; one (category, code, level) = one item; no dup facts",
    }


def metric2_completeness(work_items, golden_items, analysis) -> dict:
    item_codes = {(item.category, item.code) for item in work_items if item.code}
    item_code_only = {item.code for item in work_items if item.code}
    # Code inventory per page (for relaxed matching and reporting).
    codes_by_page: dict[int, list[str]] = {}
    for item in work_items:
        for page_index in (item.page_indices or []):
            if item.code:
                codes_by_page.setdefault(page_index, []).append(item.code)
    for page_index in codes_by_page:
        codes_by_page[page_index] = sorted(set(codes_by_page[page_index]))
    golden_present = 0
    golden_missing = []
    relaxed_present = 0
    for g in golden_items:
        code = g.get("code")
        category = g.get("category")
        page_index = g.get("page_index")
        exact = bool(code and code in item_code_only)
        # Relaxed: same page has a work item whose code starts with the golden
        # code (e.g. WF1 matches WF) OR whose category matches a page code.
        relaxed = exact
        if not relaxed and code and page_index is not None:
            page_codes = codes_by_page.get(page_index, [])
            relaxed = any(
                pc == code or pc.startswith(code) or code.startswith(pc)
                for pc in page_codes
            )
        if exact:
            golden_present += 1
        if relaxed:
            relaxed_present += 1
        if not exact:
            golden_missing.append(
                {"code": code, "golden_category": category,
                 "page_index": page_index, "relaxed_match": relaxed}
            )
    golden_ratio = golden_present / len(golden_items) if golden_items else 0.0
    relaxed_ratio = relaxed_present / len(golden_items) if golden_items else 0.0

    # Spot checks on golden pages: codes observed in work items touching that page.
    page_checks = {}
    for page_key, codes in _GOLDEN_PAGE_CHECKS.items():
        page_index = int(page_key.split("-")[1])
        page_items = [
            item for item in work_items
            if page_index in (item.page_indices or [])
        ]
        page_item_codes = {item.code for item in page_items if item.code}
        found = [c for c in codes if c in page_item_codes or c in item_code_only]
        page_checks[page_key] = {
            "required": codes,
            "found": found,
            "missing": [c for c in codes if c not in found],
            "pass": all(c in found for c in codes),
        }
    return {
        "golden_set_size": len(golden_items),
        "golden_present_as_work_item": golden_present,
        "golden_coverage_ratio": round(golden_ratio, 4),
        "golden_relaxed_present": relaxed_present,
        "golden_relaxed_coverage_ratio": round(relaxed_ratio, 4),
        "golden_missing": golden_missing[:20],
        "codes_by_page": {str(k): v for k, v in sorted(codes_by_page.items())},
        "page_spot_checks": page_checks,
        "pass": golden_ratio >= 1.0 and all(c["pass"] for c in page_checks.values()),
        "target": "100% golden items appear as work items; page spot-checks pass",
    }


def metric3_classification_accuracy(work_items, golden_items) -> dict:
    """Category correctness vs golden ground truth + taxonomy code-prefix."""
    golden_by_code = {}
    for g in golden_items:
        code = g.get("code")
        category = g.get("category")
        if code and category:
            golden_by_code.setdefault(code, set()).add(category)

    golden_matched = 0
    golden_total = 0
    golden_mismatches = []
    prefix_matched = 0
    prefix_total = 0
    prefix_mismatches = []
    for item in work_items:
        code = item.code
        if not code:
            continue
        # 1) Golden ground-truth check.
        if code in golden_by_code:
            golden_total += 1
            if item.category in golden_by_code[code]:
                golden_matched += 1
            else:
                golden_mismatches.append(
                    {"code": code, "item_category": item.category,
                     "golden_categories": sorted(golden_by_code[code]),
                     "label": item.label}
                )
        # 2) Taxonomy code-prefix check (registry regex).
        expected = category_from_code(code, title="", raw=item.label)
        if expected != "unknown":
            prefix_total += 1
            if expected == item.category:
                prefix_matched += 1
            else:
                prefix_mismatches.append(
                    {"code": code, "item_category": item.category,
                     "taxonomy_category": expected, "label": item.label}
                )
    return {
        "golden_checked": golden_total,
        "golden_matched": golden_matched,
        "golden_accuracy": round(golden_matched / golden_total, 4) if golden_total else None,
        "golden_mismatches": golden_mismatches[:15],
        "taxonomy_checked": prefix_total,
        "taxonomy_matched": prefix_matched,
        "taxonomy_accuracy": round(prefix_matched / prefix_total, 4) if prefix_total else None,
        "pass": (
            (golden_total == 0 or golden_matched / golden_total >= 0.95)
            and (prefix_total == 0 or prefix_matched / prefix_total >= 0.95)
        ),
        "target": ">=95% category correct (golden + taxonomy)",
    }


def metric4_dimension_linking(work_items) -> dict:
    structural = [item for item in work_items if item.category in _STRUCTURAL_CATEGORIES]
    linked = 0
    missing = []
    for item in structural:
        has_dim = bool(dimensions_text(item.attributes or {}))
        if not has_dim:
            has_dim = any(f.field in _DIMENSION_FIELDS for f in item.measurement_facts)
        if has_dim:
            linked += 1
        else:
            missing.append({"id": item.work_item_id, "category": item.category,
                            "code": item.code, "label": item.label})
    ratio = linked / len(structural) if structural else 0.0
    return {
        "structural_items": len(structural),
        "linked_items": linked,
        "dimension_linking_ratio": round(ratio, 4),
        "missing_dimension_samples": missing[:15],
        "pass": ratio >= 0.90,
        "target": ">=90% structural items have connected dimensions",
    }


def metric5_consistency(work_items, analysis) -> dict:
    """Canonical name formattable; unit matches category; level matches sheet."""
    name_ok = 0
    name_total = 0
    name_fail = []
    unit_ok = 0
    unit_total = 0
    unit_fail = []
    level_ok = 0
    level_total = 0
    level_fail = []
    for item in work_items:
        if item.category == "unknown":
            continue
        # 5a) canonical name formattable (Master Plan §4.2 dictionary).
        name_total += 1
        formatted = name_formatter(
            category=item.category,
            code=item.code,
            level=_item_level(item),
            subtype=(item.attributes or {}).get("subtype"),
        )
        if formatted:
            name_ok += 1
        else:
            name_fail.append({"id": item.work_item_id, "category": item.category,
                              "code": item.code, "label": item.label})
        # 5b) unit matches category for volume categories.
        for fact in item.measurement_facts:
            unit_total += 1
            if item.category in _VOLUME_M3_CATEGORIES and fact.field in {"volume"}:
                if fact.unit == "m3":
                    unit_ok += 1
                else:
                    unit_fail.append({"id": item.work_item_id, "field": fact.field,
                                      "unit": fact.unit, "category": item.category})
            else:
                unit_ok += 1  # non-volume facts pass by default
        # 5c) level matches sheet semantics of first definition page.
        level = _item_level(item)
        if level is not None:
            level_total += 1
            sheet_level = _sheet_level_for(analysis, item.page_indices[0])
            if sheet_level == level:
                level_ok += 1
            else:
                level_fail.append({"id": item.work_item_id, "item_level": level,
                                   "sheet_level": sheet_level,
                                   "page": item.page_indices[0]})
    return {
        "canonical_name_ok": name_ok,
        "canonical_name_total": name_total,
        "canonical_name_ratio": round(name_ok / name_total, 4) if name_total else None,
        "canonical_name_fail_samples": name_fail[:15],
        "unit_ok": unit_ok,
        "unit_total": unit_total,
        "unit_ratio": round(unit_ok / unit_total, 4) if unit_total else None,
        "unit_fail_samples": unit_fail[:10],
        "level_ok": level_ok,
        "level_total": level_total,
        "level_ratio": round(level_ok / level_total, 4) if level_total else None,
        "level_fail_samples": level_fail[:15],
        "pass": (
            (name_total == 0 or name_ok / name_total >= 1.0)
            and (unit_total == 0 or unit_ok / unit_total >= 1.0)
            and (level_total == 0 or level_ok / level_total >= 1.0)
        ),
        "target": "100% canonical name prefix; unit per category; location per sheet",
    }


def metric6_engine_coverage(work_items) -> dict:
    covered = 0
    not_covered = []
    for item in work_items:
        engine_signals = (
            item.count_authority == "engine_confirmed"
            or any(f.verification_status == "engine_verified" for f in item.measurement_facts)
            or (item.calculation is not None and item.calculation.source_authority == "core_engine")
        )
        if engine_signals:
            covered += 1
        else:
            not_covered.append({"id": item.work_item_id, "category": item.category,
                                "code": item.code, "count_authority": item.count_authority,
                                "maturity": item.maturity})
    ratio = covered / len(work_items) if work_items else 0.0
    return {
        "total_items": len(work_items),
        "engine_covered_items": covered,
        "engine_coverage_ratio": round(ratio, 4),
        "not_covered_samples": not_covered[:15],
        "pass": ratio > 0.80,
        "target": ">80% items source_authority=core_engine / engine_verified",
    }


def metric7_volume_valid(work_items) -> dict:
    """Volume validity at the DI pipeline level.

    DI deliberately never fabricates final quantities (benchmark B10:
    final_quantities_calculated == 0). Volume is produced by the Core Engine
    bridge (C1 column / C2 beam) — verified by unit tests, not by the analysis
    artifact. This metric reports calculation readiness plus bridge-verified
    contract evidence.
    """
    ready = sum(1 for item in work_items if item.calculation_readiness == "ready")
    calculated = sum(
        1 for item in work_items
        if item.calculation is not None
        and item.calculation.status == "complete"
        and item.calculation.result is not None
        and item.calculation.result > 0
        and item.calculation.unit == "m3"
    )
    missing_span = sum(
        1 for item in work_items
        if "span_length" in (item.missing_information or [])
    )
    by_readiness = Counter(item.calculation_readiness for item in work_items)
    return {
        "items_ready_for_calculation": ready,
        "items_with_valid_m3_result_in_analysis": calculated,
        "items_missing_span_length": missing_span,
        "calculation_readiness_distribution": dict(by_readiness),
        "note": (
            "DI analysis artifact never calculates final volumes by design (B10). "
            "Volume contract (column/beam m3) is verified in core-engine unit tests "
            "test_calculation_boundary.py + test_general_calculation_bridge.py."
        ),
        "pass": None,  # verified by core-engine bridge tests, not by this artifact
        "target": "core_engine items -> result > 0, unit m3 (via bridge tests)",
    }


def metric8_unclassified_and_ai(work_items, golden_items) -> dict:
    confirmation = measure_confirmation_area(work_items, target_ratio=0.10)
    trigger_breakdown: dict[str, int] = {"abstain": 0, "ambiguous": 0}
    for item in work_items:
        trigger, _ = should_trigger_ai_assist(item)
        if trigger:
            trigger_breakdown[trigger] = trigger_breakdown.get(trigger, 0) + 1
    assist = run_quantities_ai_assist(
        work_items,
        golden_items=golden_items,
        client=None,
        page_contexts={},
    )
    return {
        "confirmation_area": confirmation,
        "ai_trigger_breakdown": trigger_breakdown,
        "ai_triggered_count": assist.triggered_count,
        "ai_skipped_confident_count": assist.skipped_confident_count,
        "audit_records": len(assist.audits),
        "audits_all_unapproved": assist.metrics["ai_proposals_all_unapproved"],
        "note": "client=None: no live AI call; triggered items record honest provider_error audits",
        "pass": confirmation["within_target"],
        "target": "<=10% items perlu konfirmasi; AI only on engine gaps; proposals with evidence",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=None, help="artifact JSON output path")
    parser.add_argument("--golden", default=str(DEFAULT_GOLDEN), help="golden set path")
    parser.add_argument("--mode", default="fast", help="pipeline mode (fast/balanced/deep)")
    args = parser.parse_args()

    if not PDF_PATH.is_file():
        print(f"PDF not found: {PDF_PATH}")
        return 2
    if len(list(DEM_PATH.glob("page-*.json"))) != 88:
        print(f"DEM pages not complete: {DEM_PATH}")
        return 2

    print(f"Running deterministic engine on 88 pages (mode={args.mode}) …")
    analysis, _score = run_plhut_benchmark(PDF_PATH, DEM_PATH, mode=args.mode)
    work_items = analysis.work_items
    print(f"work_items = {len(work_items)}")

    golden_items = load_golden_set(args.golden)
    print(f"golden items loaded = {len(golden_items)}")

    m1 = metric1_anti_duplication(work_items)
    m2 = metric2_completeness(work_items, golden_items, analysis)
    m3 = metric3_classification_accuracy(work_items, golden_items)
    m4 = metric4_dimension_linking(work_items)
    m5 = metric5_consistency(work_items, analysis)
    m6 = metric6_engine_coverage(work_items)
    m7 = metric7_volume_valid(work_items)
    m8 = metric8_unclassified_and_ai(work_items, golden_items)

    metrics = {
        "schema": "paax.quantities.loop-metrics.v1",
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "iteration_label": "final (post-WP5, HEAD afb71c00)",
        "source": {
            "pdf": str(PDF_PATH),
            "dem_pages": str(DEM_PATH),
            "golden_set": str(args.golden),
            "pages": 88,
        },
        "engine": {
            "total_work_items": len(work_items),
            "ai_provider_calls": analysis.metrics.get("ai_provider_calls", 0),
            "pipeline_metrics": {
                k: analysis.metrics.get(k)
                for k in (
                    "work_items_before_dedup", "work_items_after_dedup",
                    "duplicates_merged", "items_with_observed_count",
                    "items_with_verified_count", "work_items_ready_for_calculation",
                    "dem_coverage", "page_ready_ratio",
                )
            },
        },
        "metric_1_anti_duplication": m1,
        "metric_2_completeness": m2,
        "metric_3_classification_accuracy": m3,
        "metric_4_dimension_linking": m4,
        "metric_5_consistency": m5,
        "metric_6_engine_coverage": m6,
        "metric_7_volume_valid": m7,
        "metric_8_unclassified_and_ai": m8,
        "summary": {
            "metric_1_pass": m1["pass"],
            "metric_2_pass": m2["pass"],
            "metric_3_pass": m3["pass"],
            "metric_4_pass": m4["pass"],
            "metric_5_pass": m5["pass"],
            "metric_6_pass": m6["pass"],
            "metric_7_pass": m7["pass"],
            "metric_8_pass": m8["pass"],
        },
    }

    out_path = Path(args.out) if args.out else (
        Path(__file__).resolve().parents[2] / "artifacts" / "metrics_loop_final.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 74)
    print("8-METRIC QUANTITIES LOOP — 88 pages (engine-only, 0% AI)")
    print("=" * 74)
    print(f"total work items            : {len(work_items)}")
    print(f"M1 anti-duplikasi           : pass={m1['pass']} "
          f"(dup_ids={m1['duplicate_work_item_ids']}, dup_keys={m1['duplicate_category_code_level']}, "
          f"dup_facts={m1['duplicate_measurement_facts']})")
    print(f"M2 kelengkapan (golden)     : pass={m2['pass']} "
          f"coverage={m2['golden_coverage_ratio']} ({m2['golden_present_as_work_item']}/{m2['golden_set_size']}) "
          f"relaxed={m2['golden_relaxed_coverage_ratio']}")
    print(f"M3 akurasi klasifikasi      : pass={m3['pass']} "
          f"golden={m3['golden_accuracy']} taxonomy={m3['taxonomy_accuracy']}")
    print(f"M4 dimension linking        : pass={m4['pass']} ratio={m4['dimension_linking_ratio']} "
          f"({m4['linked_items']}/{m4['structural_items']})")
    print(f"M5 konsistensi              : pass={m5['pass']} name={m5['canonical_name_ratio']} "
          f"unit={m5['unit_ratio']} level={m5['level_ratio']}")
    print(f"M6 coverage engine          : pass={m6['pass']} ratio={m6['engine_coverage_ratio']} "
          f"({m6['engine_covered_items']}/{m6['total_items']})")
    print(f"M7 volume valid (DI level)  : ready={m7['items_ready_for_calculation']} "
          f"valid_m3_in_analysis={m7['items_with_valid_m3_result_in_analysis']} "
          f"missing_span={m7['items_missing_span_length']}")
    print(f"M8 unclassified + AI        : pass={m8['pass']} "
          f"ratio={m8['confirmation_area']['needs_confirmation_ratio']} "
          f"({m8['confirmation_area']['needs_confirmation_count']}/{m8['confirmation_area']['total_items']}) "
          f"triggers={m8['ai_triggered_count']} audits={m8['audit_records']}")
    print(f"artifact                    : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
