from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from .models import DrawingPackageAnalysis
from .pipeline import analyze_drawing_package


def evaluate_plhut_analysis(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    pages = {page.profile.page_index: page for page in analysis.pages}
    work_items = {(item.category, item.code, item.attributes.get("level")): item for item in analysis.work_items}
    checks: list[dict[str, Any]] = []

    def check(check_id: str, description: str, condition: bool, detail: Any) -> None:
        checks.append({"id": check_id, "description": description, "passed": bool(condition), "detail": detail})

    check("B01", "All 88 PDF pages are analyzed", analysis.page_count == 88, analysis.page_count)
    check("B02", "All 88 DEM pages are fused", analysis.metrics.get("dem_page_count") == 88, analysis.metrics.get("dem_page_count"))
    check("B03", "Every page has semantic identity", all(page.semantics for page in analysis.pages), sum(bool(page.semantics) for page in analysis.pages))
    check(
        "B04", "At least 95% of pages have a known drawing type",
        sum(page.semantics and page.semantics.drawing_type != "unknown" for page in analysis.pages) / 88 >= 0.95,
        Counter(page.semantics.drawing_type for page in analysis.pages if page.semantics),
    )
    check(
        "B05", "At least 95% of DEM bounding boxes are valid on every page",
        all(page.quality.dem_bbox_valid_ratio >= 0.95 for page in analysis.pages),
        min(page.quality.dem_bbox_valid_ratio for page in analysis.pages),
    )
    check("B06", "Project vocabulary is non-empty", len(analysis.vocabulary) >= 20, len(analysis.vocabulary))
    check("B07", "Cross-sheet references are produced", len(analysis.cross_references) >= 50, len(analysis.cross_references))
    check("B08", "Work-item candidates are produced", len(analysis.work_items) >= 20, len(analysis.work_items))
    check(
        "B09", "High-confidence vector instances are system-confirmed",
        (analysis.metrics.get("physical_counts_auto_accepted") or 0) > 0,
        analysis.metrics.get("physical_counts_auto_accepted"),
    )
    check("B10", "No final quantity is calculated by Drawing Intelligence", analysis.metrics.get("final_quantities_calculated") == 0, analysis.metrics.get("final_quantities_calculated"))

    page42 = pages.get(42)
    check(
        "B11", "Page 43 is classified as second-floor column plan",
        bool(page42 and page42.semantics and page42.semantics.drawing_type == "column_plan" and page42.semantics.level == "L2"),
        page42.semantics.model_dump() if page42 and page42.semantics else None,
    )
    k2 = next((entry for entry in analysis.vocabulary if entry.canonical_key == "K2" and entry.category == "column"), None)
    k3 = next((entry for entry in analysis.vocabulary if entry.canonical_key == "K3" and entry.category == "column"), None)
    check("B12", "K2 column definition resolves 250x600 mm", bool(k2 and k2.attributes.get("dimensions", {}).get("width") == 250 and k2.attributes.get("dimensions", {}).get("depth") == 600), k2.model_dump() if k2 else None)
    check("B13", "K3 column definition resolves 250x400 mm", bool(k3 and k3.attributes.get("dimensions", {}).get("width") == 250 and k3.attributes.get("dimensions", {}).get("depth") == 400), k3.model_dump() if k3 else None)
    k1a_l2 = work_items.get(("column", "K1A", "L2"))
    k2_l2 = work_items.get(("column", "K2", "L2"))
    k3_l2 = work_items.get(("column", "K3", "L2"))
    check(
        "B14", "K2 resolves to four physical columns on L2 from the native vector plan",
        bool(k2_l2 and k2_l2.verified_physical_count == 4 and k2_l2.count_authority == "engine_confirmed"),
        k2_l2.model_dump() if k2_l2 else None,
    )
    check(
        "B15", "K3 resolves to five physical columns on L2 from the native vector plan",
        bool(k3_l2 and k3_l2.verified_physical_count == 5 and k3_l2.count_authority == "engine_confirmed"),
        k3_l2.model_dump() if k3_l2 else None,
    )
    check(
        "B16", "K2 L2 has authoritative count, dimensions, and effective height",
        bool(
            k2_l2
            and k2_l2.calculation_readiness == "ready"
            and {fact.field for fact in k2_l2.measurement_facts} >= {"count", "width", "depth", "height"}
        ),
        k2_l2.model_dump() if k2_l2 else None,
    )
    check("B17", "All twenty development phases are represented", len(analysis.phase_status) == 20, analysis.phase_status)
    check(
        "B18", "K1A resolves to eight physical columns on L2 from the native vector plan",
        bool(k1a_l2 and k1a_l2.verified_physical_count == 8 and k1a_l2.count_authority == "engine_confirmed"),
        k1a_l2.model_dump() if k1a_l2 else None,
    )
    door_pages = [page for page in analysis.pages if page.semantics and page.semantics.drawing_type == "door_window_plan"]
    check(
        "B19", "Door/window plan levels come from their titles rather than unrelated roof notes",
        {(page.profile.page_index, page.semantics.level) for page in door_pages} >= {(20, "L1"), (21, "L2")},
        [(page.profile.page_index, page.semantics.title, page.semantics.level) for page in door_pages],
    )

    k2_height = next((fact for fact in (k2_l2.measurement_facts if k2_l2 else []) if fact.field == "height"), None)
    check(
        "B20", "K2 L2 effective height resolves to 3900 mm from a section interval",
        bool(k2_height and k2_height.value == 3900 and k2_height.unit == "mm"),
        k2_height.model_dump() if k2_height else None,
    )

    passed = sum(item["passed"] for item in checks)
    return {
        "schema_version": "paax.drawing-intelligence.benchmark.v1",
        "benchmark": "PLHUT-88-pages",
        "passed": passed,
        "total": len(checks),
        "score": passed / max(len(checks), 1),
        "status": "PASS" if passed == len(checks) else "FAIL",
        "checks": checks,
        "metrics": analysis.metrics,
    }


def run_plhut_benchmark(
    pdf_path: str | Path, dem_directory: str | Path, *, mode: str = "fast"
) -> tuple[DrawingPackageAnalysis, dict[str, Any]]:
    # The benchmark validates package-wide indexing and semantic linking.  It
    # deliberately defaults to fast mode so CI does not eagerly build heavy
    # vector descriptors for all 88 sheets; balanced/deep are tested on scoped
    # sheets by the interactive-tool tests.
    analysis = analyze_drawing_package(pdf_path, dem_directory=dem_directory, mode=mode)
    return analysis, evaluate_plhut_analysis(analysis)
