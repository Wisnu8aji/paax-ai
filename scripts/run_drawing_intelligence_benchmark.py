#!/usr/bin/env python3
"""Run the deterministic PLHUT Drawing Intelligence regression benchmark."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SERVICE = REPO / "services" / "document-intelligence"
if str(SERVICE) not in sys.path:
    sys.path.insert(0, str(SERVICE))

from app.drawing_intelligence.benchmark import run_plhut_benchmark  # noqa: E402
from app.drawing_intelligence.page_scorecard import (  # noqa: E402
    build_page_scorecard,
    render_page_scorecard_markdown,
)
from app.drawing_intelligence.human_benchmark import evaluate_human_delivery  # noqa: E402
from app.drawing_intelligence.human_delivery import build_human_delivery  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=REPO / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf")
    parser.add_argument("--dem", type=Path, default=REPO / "dem_extraction_88pages" / "pages")
    parser.add_argument("--mode", choices=["fast", "balanced", "deep"], default="fast")
    parser.add_argument("--output", type=Path, default=REPO / "report" / "report_drawing_intelligence")
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"PDF fixture not found: {args.pdf}")
    if len(list(args.dem.glob("page-*.json"))) != 88:
        parser.error(f"Expected 88 DEM page files in {args.dem}")

    analysis, benchmark = run_plhut_benchmark(args.pdf, args.dem, mode=args.mode)
    scorecard = build_page_scorecard(analysis)
    human_delivery = build_human_delivery(analysis)
    human_benchmark = evaluate_human_delivery(analysis)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json").write_text(
        analysis.model_dump_json(indent=2) + "\n", encoding="utf-8"
    )
    (args.output / "DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json").write_text(
        json.dumps(benchmark, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (args.output / "DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.json").write_text(
        json.dumps(scorecard, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (args.output / "DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.md").write_text(
        render_page_scorecard_markdown(scorecard), encoding="utf-8"
    )
    (args.output / "DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_2026-07-21.json").write_text(
        json.dumps(human_delivery, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (args.output / "DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_2026-07-21.json").write_text(
        json.dumps(human_benchmark, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "benchmark": benchmark["status"],
        "passed": benchmark["passed"],
        "total": benchmark["total"],
        "pages": analysis.page_count,
        "page_scorecard": scorecard["status_counts"],
        "human_benchmark": human_benchmark["status"],
        "human_passed": human_benchmark["passed"],
        "human_total": human_benchmark["total"],
        "ai_provider_calls": analysis.metrics.get("ai_provider_calls"),
    }, indent=2))
    return 0 if benchmark["status"] == "PASS" and human_benchmark["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
