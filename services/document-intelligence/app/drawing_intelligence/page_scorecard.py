from __future__ import annotations

from collections import Counter
from typing import Any

from .models import DrawingPackageAnalysis


def build_page_scorecard(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    cross_refs = Counter(item.occurrence_page_index for item in analysis.cross_references)
    reviews = Counter(item.page_index for item in analysis.review_queue)
    pages: list[dict[str, Any]] = []
    status_counts: Counter[str] = Counter()
    for page in analysis.pages:
        semantic = page.semantics
        checks = {
            "modality_identified": page.profile.modality in {"vector", "hybrid", "raster"},
            "drawing_type_identified": bool(semantic and semantic.drawing_type != "unknown"),
            "discipline_identified": bool(semantic and semantic.discipline != "unknown"),
            "drawing_zone_present": any(zone.type == "drawing" for zone in page.zones),
            "dem_bbox_valid": page.quality.dem_bbox_valid_ratio >= 0.95,
            "text_or_dem_tokens_present": bool(page.tokens),
        }
        blockers = [name for name, passed in checks.items() if not passed]
        if blockers:
            status = "fail"
        elif page.quality.readiness != "ready" or reviews[page.profile.page_index]:
            status = "review"
        else:
            status = "pass"
        status_counts[status] += 1
        pages.append(
            {
                "page_number": page.profile.page_index + 1,
                "page_index": page.profile.page_index,
                "title": semantic.title if semantic else None,
                "sheet_number": semantic.sheet_number if semantic else None,
                "discipline": semantic.discipline if semantic else "unknown",
                "drawing_type": semantic.drawing_type if semantic else "unknown",
                "level": semantic.level if semantic else None,
                "modality": page.profile.modality,
                "vector_paths": page.profile.vector_paths,
                "token_count": len(page.tokens),
                "zone_types": sorted({zone.type for zone in page.zones}),
                "cross_reference_count": cross_refs[page.profile.page_index],
                "review_task_count": reviews[page.profile.page_index],
                "quality_readiness": page.quality.readiness,
                "checks": checks,
                "blocking_checks": blockers,
                "status": status,
            }
        )
    return {
        "schema_version": "paax.drawing-intelligence.page-scorecard.v1",
        "document_name": analysis.document_name,
        "page_count": analysis.page_count,
        "status_counts": dict(status_counts),
        "all_pages_structurally_analyzed": len(pages) == analysis.page_count and status_counts["fail"] == 0,
        "pages": pages,
    }


def render_page_scorecard_markdown(scorecard: dict[str, Any]) -> str:
    counts = scorecard["status_counts"]
    lines = [
        "# Drawing Intelligence — PLHUT 88-Page Scorecard",
        "",
        f"- Pages: **{scorecard['page_count']}**",
        f"- Pass: **{counts.get('pass', 0)}**",
        f"- Review: **{counts.get('review', 0)}**",
        f"- Fail: **{counts.get('fail', 0)}**",
        "- A review status is not presented as an error: it means evidence or human confirmation is still required.",
        "",
        "| Page | Title | Discipline | Type | Level | Modality | Tokens | Xrefs | Reviews | Status |",
        "|---:|---|---|---|---|---|---:|---:|---:|---|",
    ]
    for page in scorecard["pages"]:
        title = str(page.get("title") or "—").replace("|", "/")
        lines.append(
            f"| {page['page_number']} | {title} | {page['discipline']} | {page['drawing_type']} | "
            f"{page.get('level') or '—'} | {page['modality']} | {page['token_count']} | "
            f"{page['cross_reference_count']} | {page['review_task_count']} | {page['status'].upper()} |"
        )
    return "\n".join(lines) + "\n"
