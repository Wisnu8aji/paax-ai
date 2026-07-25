#!/usr/bin/env python3
"""Run the deterministic PAAX Drawing Intelligence benchmark.

No AI-provider credential is read or required.  The script fuses native PDF
geometry/text with already committed DEM evidence, then writes inspectable
artifacts for engineering review and regression tracking.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
for path in (SERVICE_ROOT, REPO_ROOT / "packages" / "schemas" / "python"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app.drawing_intelligence.benchmark import run_plhut_benchmark
from app.drawing_intelligence.delivery import build_user_delivery
from app.drawing_intelligence.page_scorecard import build_page_scorecard, render_page_scorecard_markdown


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=REPO_ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf")
    parser.add_argument("--dem", type=Path, default=REPO_ROOT / "dem_extraction_88pages" / "pages")
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "report" / "report_drawing_intelligence" / "kreo_adaptation_2026-07-21",
    )
    parser.add_argument("--mode", choices=("fast", "balanced", "deep"), default="fast")
    args = parser.parse_args()

    if not args.pdf.is_file():
        parser.error(f"PDF fixture does not exist: {args.pdf}")
    if len(list(args.dem.glob("page-*.json"))) != 88:
        parser.error(f"Expected 88 DEM page files in: {args.dem}")

    started = time.perf_counter()
    analysis, benchmark = run_plhut_benchmark(args.pdf, args.dem, mode=args.mode)
    elapsed = time.perf_counter() - started
    benchmark["elapsed_seconds"] = round(elapsed, 6)
    benchmark["ai_provider_calls"] = analysis.metrics.get("ai_provider_calls", 0)

    page_scorecard = build_page_scorecard(analysis)
    delivery = build_user_delivery(analysis)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "package-analysis.json").write_text(
        analysis.model_dump_json(indent=2), encoding="utf-8"
    )
    (args.output / "benchmark-scorecard.json").write_text(
        json.dumps(benchmark, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (args.output / "page-scorecard.json").write_text(
        json.dumps(page_scorecard, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (args.output / "page-scorecard.md").write_text(
        render_page_scorecard_markdown(page_scorecard), encoding="utf-8"
    )
    (args.output / "user-delivery.json").write_text(
        json.dumps(delivery, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({
        "status": benchmark["status"],
        "checks": f"{benchmark['passed']}/{benchmark['total']}",
        "elapsed_seconds": benchmark["elapsed_seconds"],
        "pages": analysis.page_count,
        "work_items": len(analysis.work_items),
        "review_tasks": len(analysis.review_queue),
        "output": str(args.output),
    }, indent=2))
    return 0 if benchmark["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
