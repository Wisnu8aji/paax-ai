"""WP5 metrics — AI-assist trigger + "perlu konfirmasi" area on the real 88-page PLHUT dataset.

Master Plan §5.1 metric 8: proportion of items in the "perlu konfirmasi" area
(target ≤10%) and the AI-assist trigger load (engine gap only).

NO live AI call is made: `client=None` is the graceful no-key path (every
triggered item records an honest provider_error audit).  Live proposals are
produced only when PAAX_TEST_API_KEY is provisioned in 00_governance/.env.

Usage:
    python scripts/quantities_wp5_metrics.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from app.drawing_intelligence.benchmark import run_plhut_benchmark
from app.drawing_intelligence.quantities_ai_assist import (
    load_golden_set,
    measure_confirmation_area,
    run_quantities_ai_assist,
    should_trigger_ai_assist,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
PDF_PATH = REPO_ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
DEM_PATH = REPO_ROOT / "dem_extraction_88pages" / "pages"
DEFAULT_GOLDEN = Path(
    r"D:\PAAX-Orchestration\00_projects\2026-08-04-perbaikan-blur-quantities"
    r"\04_execution\01_orion-f2\artifacts\k0_golden_set.json"
)


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

    print(f"Running engine on 88 pages (mode={args.mode}) …")
    analysis, _score = run_plhut_benchmark(PDF_PATH, DEM_PATH, mode=args.mode)
    work_items = analysis.work_items
    print(f"work_items = {len(work_items)}")

    golden_items = load_golden_set(args.golden)
    print(f"golden items loaded = {len(golden_items)}")

    # Metric 8 — "perlu konfirmasi" area (engine-only, before AI proposals).
    confirmation = measure_confirmation_area(work_items, target_ratio=0.10)

    # AI-assist trigger load (no live call: client=None → honest audits).
    assist = run_quantities_ai_assist(
        work_items,
        golden_items=golden_items,
        client=None,
        page_contexts={},
    )
    trigger_breakdown: dict[str, int] = {"abstain": 0, "ambiguous": 0}
    for item in work_items:
        trigger, _reason = should_trigger_ai_assist(item)
        if trigger:
            trigger_breakdown[trigger] = trigger_breakdown.get(trigger, 0) + 1

    artifact = {
        "schema": "paax.quantities.wp5-metrics.v1",
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode,
        "source": {
            "pdf": str(PDF_PATH),
            "dem_pages": str(DEM_PATH),
            "golden_set": str(args.golden),
        },
        "engine": {
            "total_work_items": len(work_items),
            "ai_provider_calls": analysis.metrics.get("ai_provider_calls", 0),
        },
        "confirmation_area": confirmation,
        "ai_assist_trigger": {
            "triggered_count": assist.triggered_count,
            "skipped_confident_count": assist.skipped_confident_count,
            "trigger_breakdown": trigger_breakdown,
            "audit_records": len(assist.audits),
            "audits_all_unapproved": assist.metrics["ai_proposals_all_unapproved"],
            "note": "client=None (no PAAX_TEST_API_KEY in env): every triggered item "
                    "recorded an honest provider_error audit; no live model call.",
        },
        "sample_confirmation_items": confirmation["items"][:10],
    }

    out_path = Path(args.out) if args.out else (
        Path(__file__).resolve().parents[2] / "artifacts" / "wp5_metrics.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(
        {
            "total_work_items": len(work_items),
            "needs_confirmation_count": confirmation["needs_confirmation_count"],
            "needs_confirmation_ratio": confirmation["needs_confirmation_ratio"],
            "within_target": confirmation["within_target"],
            "belum_dihitung": confirmation["belum_dihitung_count"],
            "belum_didukung": confirmation["belum_didukung_count"],
            "ai_triggered": assist.triggered_count,
            "ai_skipped_confident": assist.skipped_confident_count,
        },
        indent=2,
    ))
    print(f"artifact written: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
