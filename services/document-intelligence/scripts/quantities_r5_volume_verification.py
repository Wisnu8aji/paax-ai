"""R5 — M7 volume verification through the real C1/C2 contract path (Cycle-002).

APOLLO Revision Directive Cycle-002 C2-1 (mandatory, first task): execute R5 —
run the C1 (column) / C2 (beam) Core Engine contracts THROUGH the 88-page
pipeline on fact-complete items (``calculation_readiness == "ready"``) and
record the actual volume in m3 per item as a separate verification artifact.

This script is a *verification* script: it does NOT change the C1/C2 contract,
does NOT lower any metric target, and never fabricates a number.  It:

1. Runs the deterministic 88-page pipeline (``run_plhut_benchmark``, mode fast,
   engine-only, 0% AI) exactly like ``quantities_loop_metrics.py``.
2. Selects every work item whose ``calculation_readiness == "ready"``
   (fact-complete: count + width + depth + height for columns; + span_length
   for beams — the readiness gate set by ``resolve_element_heights``).
3. For each ready item builds the EngineDispatch through the production
   ``build_engine_dispatch`` (C1/C2 boundary, unchanged) and executes the
   volume calculation in-process through the Core Engine ``calculate()``
   boundary (``services/core-engine/app/calculation_boundary.py``) using the
   exact same typed payload the HTTP bridge would send.
4. Records ``work_item_id`` + ``volume_m3`` + formula inputs + evidence refs.
5. For beams whose span_length is unavailable, records
   ``missing_information: ["span_length"]`` — the Master Plan §4.3 C2 fallback
   (NOT blocked, NOT fabricated).
6. Records the green bridge-test evidence (unit tests for the same contract).

Artifact schema: ``paax.quantities.r5-verification.v1``.

Usage:
    python scripts/quantities_r5_volume_verification.py \
        --out <artifact.json> [--mode fast] [--bridge-tests <summary.json>]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
# Order matters: both services expose an `app` package.  document-intelligence
# must win the `app` root so `app.drawing_intelligence` resolves; core-engine's
# `app.calculation_boundary` is then importable as a sibling (verified).
sys.path.insert(0, str(REPO_ROOT / "services" / "core-engine"))
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))

from app.drawing_intelligence.benchmark import run_plhut_benchmark  # noqa: E402
from app.drawing_intelligence.calculation_bridge import (  # noqa: E402
    CalculationNotReady,
    build_engine_dispatch,
)
from app.drawing_intelligence.models import WorkItemCandidate  # noqa: E402
from app.calculation_boundary import CalculationRequest, calculate  # noqa: E402

PDF_PATH = REPO_ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
DEM_PATH = REPO_ROOT / "dem_extraction_88pages" / "pages"


def fact_inputs(dispatch_payload: dict[str, Any]) -> dict[str, float]:
    """Return {formula_input: value_in_meters} for the dispatch payload inputs."""
    meters: dict[str, float] = {}
    for row in dispatch_payload.get("inputs", []):
        key = (row.get("formula_inputs") or ["?"])[0]
        value = float(row.get("value", 0.0))
        unit = str(row.get("unit") or "").lower()
        if unit == "mm":
            value = value / 1000.0
        elif unit == "cm":
            value = value / 100.0
        meters[key] = value
    return meters


def run_c1_c2_for_item(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
) -> dict[str, Any]:
    """Execute the C1/C2 contract for one fact-complete item.

    Returns a per-item record.  The dispatch is built with the production
    boundary (validates contract + approved facts + capability).  The volume
    is produced by the Core Engine ``calculate()`` on the typed payload —
    never by this script.
    """
    base = {
        "work_item_id": item.work_item_id,
        "category": item.category,
        "code": item.code,
        "label": item.label,
        "calculation_readiness": item.calculation_readiness,
        "page_indices": item.page_indices,
        "count_authority": item.count_authority,
        "verified_physical_count": item.verified_physical_count,
        "evidence_ref_count": len(item.evidence_refs),
    }
    try:
        dispatch = build_engine_dispatch(
            item, project_id=project_id, snapshot_id=snapshot_id, requested_by="orion-f3-r5",
        )
    except CalculationNotReady as exc:
        # C2 fallback: span_length missing on beams is missing_information,
        # NOT blocked and NOT fabricated.
        return {
            **base,
            "status": "missing_information",
            "missing_information": item.missing_information,
            "reason": str(exc),
            "volume_m3": None,
        }

    request = CalculationRequest.model_validate(dispatch.payload)
    response = calculate(request)
    inputs_m = fact_inputs(dispatch.payload)
    return {
        **base,
        "status": "complete" if response.status == "complete" else response.status,
        "calculation_type": dispatch.capability.calculation_type,
        "endpoint": dispatch.endpoint,
        "formula": response.formula,
        "substituted_formula": response.substituted_formula,
        "inputs_m": inputs_m,
        "volume_m3": response.result,
        "unit": response.unit,
        "warnings": response.warnings,
        "dispatch_capability_key": dispatch.capability.key,
        "dispatch_capability_source": dispatch.capability.source_authority,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=None, help="artifact JSON output path")
    parser.add_argument("--mode", default="fast", help="pipeline mode (fast/balanced/deep)")
    parser.add_argument("--bridge-tests", default=None, help="bridge test summary JSON path")
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

    ready = [item for item in work_items if item.calculation_readiness == "ready"]
    records = [
        run_c1_c2_for_item(
            item,
            project_id=f"paax-r5-{analysis.package_id}",
            snapshot_id="r5-cycle-002",
        )
        for item in sorted(ready, key=lambda i: i.work_item_id)
    ]
    # Beam fallback evidence: any beam with width/depth but no span_length.
    beam_fallback = [
        {
            "work_item_id": item.work_item_id,
            "code": item.code,
            "category": item.category,
            "missing_information": item.missing_information,
            "status": "missing_information",
            "volume_m3": None,
        }
        for item in sorted(work_items, key=lambda i: i.work_item_id)
        if item.category == "beam"
        and "span_length" in (item.missing_information or [])
        and any(f.field in {"width", "depth"} for f in item.measurement_facts)
    ][:5]

    bridge_tests: dict[str, Any] = {}
    if args.bridge_tests:
        bridge_path = Path(args.bridge_tests)
        if bridge_path.is_file():
            bridge_tests = json.loads(bridge_path.read_text(encoding="utf-8"))

    artifact = {
        "schema": "paax.quantities.r5-verification.v1",
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "project_id": "PAAX-2026-08-04-blur-quantities",
        "cycle": "cycle-002",
        "task": "C2-1 (R5 — M7 pipeline volume verification)",
        "source": {
            "pdf": str(PDF_PATH),
            "dem_pages": str(DEM_PATH),
            "pages": 88,
            "mode": args.mode,
            "engine_only": True,
            "ai_provider_calls": analysis.metrics.get("ai_provider_calls", 0),
        },
        "pipeline": {
            "total_work_items": len(work_items),
            "items_ready_for_calculation": len(ready),
            "calculation_readiness_distribution": analysis.metrics.get(
                "work_items_ready_for_calculation", 0
            ),
            "final_quantities_calculated_by_di": analysis.metrics.get("final_quantities_calculated", 0),
        },
        "contract_note": (
            "C1/C2 contracts are NOT modified. Volumes are produced by the Core "
            "Engine calculate() boundary from engine-verified measurement facts "
            "(count, width, depth, height / span_length) observed in JSON-1. "
            "No number is fabricated; beams without span_length are recorded as "
            "missing_information (Master Plan 4.3 C2 fallback)."
        ),
        "volume_per_item": records,
        "beam_span_fallback_evidence": beam_fallback,
        "master_plan_m7_note": (
            "Master Plan 5.1 M7 example: column K1 = count x 0.3 x 0.6 x h; beam = "
            "b x d x panjang_total. The example section 0.3x0.6 is illustrative; "
            "the actual volume uses the real observed section of each item "
            "(e.g. K1 400x400 mm -> width 0.4 m, depth 0.4 m)."
        ),
        "bridge_test_evidence": bridge_tests,
    }

    out_path = Path(args.out) if args.out else (
        REPO_ROOT / "services" / "document-intelligence" / "artifacts" / "r5_volume_verification.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=" * 74)
    print("R5 — M7 VOLUME VERIFICATION (88 pages, engine-only, 0% AI)")
    print("=" * 74)
    print(f"total work items              : {len(work_items)}")
    print(f"ready (fact-complete) items   : {len(ready)}")
    for record in records:
        vol = record.get("volume_m3")
        if vol is not None:
            print(f"  {record['work_item_id']:40} -> {vol:.4f} m3  ({record.get('calculation_type')})")
        else:
            print(f"  {record['work_item_id']:40} -> missing_information ({record.get('reason','')[:60]})")
    print(f"beam span fallback (sample)   : {len(beam_fallback)} items")
    print(f"artifact                      : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
