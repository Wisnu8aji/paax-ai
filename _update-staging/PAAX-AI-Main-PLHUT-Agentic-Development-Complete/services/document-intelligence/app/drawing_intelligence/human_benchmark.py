from __future__ import annotations

from typing import Any

from .human_delivery import build_human_delivery
from .models import DrawingPackageAnalysis


def evaluate_human_delivery(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    payload = build_human_delivery(analysis)
    items = payload["work_items"]
    checks: list[dict[str, Any]] = []

    def check(check_id: str, description: str, condition: bool, detail: Any) -> None:
        checks.append({"id": check_id, "description": description, "passed": bool(condition), "detail": detail})

    check("H01", "Human delivery contains recognized work items", len(items) >= 50, len(items))
    check("H02", "Title-block address is not shown as a work item", not any(row.get("code") == "NO115" for row in items), None)
    check("H03", "Every presented item has a known discipline", all(row["discipline"] != "unknown" for row in items), None)
    check("H04", "Every presented item has evidence", all(row["evidence_count"] > 0 for row in items), min((row["evidence_count"] for row in items), default=0))
    check(
        "H05", "Final physical counts always carry engine or human authority",
        all(
            (not row["count_is_final"])
            or row.get("count_authority") in {"engine_confirmed", "human_confirmed"}
            for row in items
        ),
        sorted({row.get("count_authority") for row in items if row["count_is_final"]}),
    )
    check("H06", "Every item provides a next action", all(row["recommended_actions"] for row in items), None)
    check("H07", "Every item links to at least one source sheet", all(row["source_sheets"] for row in items), None)
    check("H08", "K2 L2 is understandable and dimensioned", any(
        row["code"] == "K2" and row["level"] == "L2" and row["dimensions_text"] == "250 × 600 mm"
        and row["verified_physical_count"] == 4 and row["count_is_final"] is True
        and row["calculation_readiness"] in {"ready", "calculated"} for row in items
    ), None)
    check("H09", "No drawing object is auto-accepted", payload["summary"]["accepted_drawing_objects"] == 0, payload["summary"]["accepted_drawing_objects"])
    check("H10", "Clarification candidates remain auditable", len(payload["needs_clarification"]) > 0, len(payload["needs_clarification"]))

    passed = sum(item["passed"] for item in checks)
    return {
        "schema_version": "paax.drawing-intelligence.human-benchmark.v1",
        "benchmark": "PLHUT-88-pages-human-delivery",
        "passed": passed,
        "total": len(checks),
        "score": passed / max(len(checks), 1),
        "status": "PASS" if passed == len(checks) else "FAIL",
        "checks": checks,
        "summary": payload["summary"],
    }
