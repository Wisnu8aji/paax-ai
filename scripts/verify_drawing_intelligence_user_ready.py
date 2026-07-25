#!/usr/bin/env python3
"""Deterministic acceptance gate for PAAX Drawing Intelligence user delivery.

This script validates generated PLHUT artifacts only. It never calls an AI
provider and never converts observed drawing labels into physical quantities.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_REPORT_DIR = Path("report/report_drawing_intelligence")


def _load(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(path)
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected object in {path}")
    return value


def verify(report_dir: Path) -> dict[str, Any]:
    package = _load(report_dir / "DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_CONTINUED_2026-07-21.json")
    package_benchmark = _load(report_dir / "DRAWING_INTELLIGENCE_PACKAGE_BENCHMARK_88P_CONTINUED_2026-07-21.json")
    delivery = _load(report_dir / "DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_CONTINUED_2026-07-21.json")
    human_benchmark = _load(report_dir / "DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_CONTINUED_2026-07-21.json")

    items = list(delivery.get("work_items") or [])
    clarification = list(delivery.get("needs_clarification") or [])
    suppressed = list(delivery.get("suppressed_candidates") or [])
    summary = dict(delivery.get("summary") or {})
    visible_codes = {str(item.get("code") or "") for item in [*items, *clarification]}
    suppressed_codes = {str(item.get("code") or "") for item in suppressed}
    k2 = next((item for item in items if item.get("code") == "K2" and item.get("level") == "L2"), None)

    checks: list[dict[str, Any]] = []

    def check(check_id: str, description: str, passed: bool, detail: Any) -> None:
        checks.append({"id": check_id, "description": description, "passed": bool(passed), "detail": detail})

    check("U01", "All 88 pages are represented", package.get("page_count") == 88, package.get("page_count"))
    check("U02", "Package benchmark passes", package_benchmark.get("status") == "PASS", package_benchmark.get("status"))
    check("U03", "Human benchmark passes", human_benchmark.get("status") == "PASS", human_benchmark.get("status"))
    check("U04", "At least 60 user-presentable items are available", len(items) >= 60, len(items))
    check("U05", "Clarification queue remains bounded", len(clarification) <= 10, len(clarification))
    check("U06", "Audit noise is retained separately", len(suppressed) >= 1, len(suppressed))
    check("U07", "Known noise codes are hidden from user lists", not ({"LT1", "D-01", "E27"} & visible_codes), sorted(visible_codes & {"LT1", "D-01", "E27"}))
    check("U08", "Known noise codes remain auditable", {"LT1", "D-01", "E27", "K-01"}.issubset(suppressed_codes), sorted(suppressed_codes))
    check("U09", "Every item has a human name and explanation", all(item.get("technical_name") and item.get("plain_name") and item.get("plain_description") for item in items), None)
    check("U10", "Every item links to source evidence", all(item.get("evidence_count", 0) > 0 and item.get("source_sheets") for item in items), None)
    check("U11", "Every item has a recommended next action", all(item.get("recommended_actions") for item in items), None)
    check("U12", "No presented count is final by default", all(item.get("count_is_final") is False for item in items), None)
    check("U13", "No drawing object is auto-accepted", summary.get("accepted_drawing_objects") == 0, summary.get("accepted_drawing_objects"))
    check("U14", "K2 L2 remains correctly joined across sheets", bool(k2 and k2.get("observed_label_count") == 3 and k2.get("dimensions_text") == "250 × 600 mm"), k2)
    check("U15", "K2 count remains an observation, not physical quantity", bool(k2 and k2.get("count_is_final") is False and k2.get("verified_physical_count") is None), k2 and {"count_is_final": k2.get("count_is_final"), "verified_physical_count": k2.get("verified_physical_count")})
    check("U16", "Review tasks are grouped for humans", summary.get("review_batches", 0) <= 10 and summary.get("review_batches", 0) > 0, summary.get("review_batches"))
    check("U17", "No live AI call was used by benchmark", package.get("metrics", {}).get("ai_provider_calls", 0) == 0, package.get("metrics", {}).get("ai_provider_calls"))
    check("U18", "Drawing Intelligence calculates no final quantities", package.get("metrics", {}).get("final_quantities_calculated", 0) == 0, package.get("metrics", {}).get("final_quantities_calculated"))

    passed = sum(check["passed"] for check in checks)
    return {
        "schema_version": "paax.drawing-intelligence.user-ready-gate.v1",
        "status": "PASS" if passed == len(checks) else "FAIL",
        "passed": passed,
        "total": len(checks),
        "checks": checks,
        "summary": {
            "recognized_work_items": len(items),
            "needs_clarification": len(clarification),
            "suppressed_audit_candidates": len(suppressed),
            "review_tasks": summary.get("open_review_tasks"),
            "review_batches": summary.get("review_batches"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = verify(args.report_dir)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
