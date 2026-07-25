from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import BBox, PageQuality, PlanZone, TableRecord, TextToken
from .text_index import normalize_text


def load_dem_pages(directory: Path | None) -> dict[int, dict[str, Any]]:
    if directory is None or not directory.exists():
        return {}
    pages_dir = directory / "pages" if (directory / "pages").is_dir() else directory
    result: dict[int, dict[str, Any]] = {}
    for path in sorted(pages_dir.glob("page-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        index = int(data.get("source", {}).get("page_index", len(result)))
        result[index] = data
    return result


def normalize_dem_bbox(raw: Any, source: dict[str, Any]) -> BBox | None:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        values = [float(value) for value in raw]
    except (TypeError, ValueError):
        return None
    x0, y0, x1, y1 = values
    if x1 < x0 or y1 < y0:
        return None
    if all(-1e-6 <= value <= 1.000001 for value in values):
        try:
            return BBox(x0=x0, y0=y0, x1=x1, y1=y1, space="normalized")
        except ValueError:
            return None
    width = float(source.get("width_px") or 0)
    height = float(source.get("height_px") or 0)
    if width <= 0 or height <= 0:
        return None
    try:
        return BBox(
            x0=max(0.0, min(1.0, x0 / width)),
            y0=max(0.0, min(1.0, y0 / height)),
            x1=max(0.0, min(1.0, x1 / width)),
            y1=max(0.0, min(1.0, y1 / height)),
            space="normalized",
        )
    except ValueError:
        return None


def _zone_id(box: BBox, zones: list[PlanZone]) -> str | None:
    cx, cy = box.center
    matches = [zone for zone in zones if zone.bbox.contains(cx, cy)]
    if not matches:
        return None
    matches.sort(key=lambda zone: (zone.type == "drawing", zone.bbox.area, -zone.confidence))
    return matches[0].zone_id


def iter_observations(dem_page: dict[str, Any]):
    observations = dem_page.get("observations", {})
    for category, rows in observations.items():
        if not isinstance(rows, list):
            continue
        for row_index, row in enumerate(rows):
            if isinstance(row, dict):
                yield category, row_index, row


def extract_dem_tokens(dem_page: dict[str, Any], zones: list[PlanZone]) -> list[TextToken]:
    source = dem_page.get("source", {})
    page_index = int(source.get("page_index", 0))
    tokens: list[TextToken] = []
    textual_categories = {
        "texts", "element_labels", "symbols", "materials", "notes", "levels", "spaces", "references"
    }
    for category, row_index, row in iter_observations(dem_page):
        if category not in textual_categories:
            continue
        raw = row.get("raw") or row.get("normalized")
        if not raw:
            continue
        box = normalize_dem_bbox(row.get("bbox"), source)
        if box is None:
            continue
        refs = row.get("evidence_refs", []) or []
        suffix = str(refs[0]) if refs else f"{category}-{row_index}"
        tokens.append(
            TextToken(
                token_id=f"dem-p{page_index}-{suffix}",
                page_index=page_index,
                text=str(raw),
                normalized=normalize_text(str(row.get("normalized") or raw)),
                bbox=box,
                block_no=10_000 + row_index,
                line_no=0,
                word_no=0,
                zone_id=_zone_id(box, zones),
                source="dem",
                confidence=float(row.get("confidence", 0.5)),
            )
        )
    return tokens


def extract_dem_tables(dem_page: dict[str, Any], zones: list[PlanZone]) -> list[TableRecord]:
    source = dem_page.get("source", {})
    page_index = int(source.get("page_index", 0))
    result: list[TableRecord] = []
    for category, row_index, row in iter_observations(dem_page):
        if category != "tables":
            continue
        raw = str(row.get("raw") or row.get("normalized") or "").strip()
        if not raw:
            continue
        box = normalize_dem_bbox(row.get("bbox"), source)
        cells = [cell.strip() for cell in raw.replace(";", "\n").splitlines() if cell.strip()]
        result.append(
            TableRecord(
                record_id=f"dem-p{page_index}-table-{row_index}",
                page_index=page_index,
                zone_id=_zone_id(box, zones) if box else None,
                cells=cells,
                bbox=box,
                source="dem",
                confidence=float(row.get("confidence", 0.5)),
            )
        )
    return result


def assess_dem_quality(dem_page: dict[str, Any] | None, *, native_token_count: int, zones: list[PlanZone]) -> PageQuality:
    if dem_page is None:
        return PageQuality(
            native_text_coverage=min(1.0, native_token_count / 40),
            zone_coverage=min(1.0, sum(zone.bbox.area for zone in zones)),
            dem_bbox_valid_ratio=0.0,
            evidence_coverage=0.0,
            readiness="review",
            reasons=["DEM page is not available"],
        )
    source = dem_page.get("source", {})
    rows = list(iter_observations(dem_page))
    with_bbox = sum(1 for _, _, row in rows if row.get("bbox") is not None)
    valid_bbox = sum(1 for _, _, row in rows if normalize_dem_bbox(row.get("bbox"), source) is not None)
    with_evidence = sum(1 for _, _, row in rows if row.get("evidence_refs"))
    bbox_ratio = valid_bbox / with_bbox if with_bbox else 1.0
    evidence_ratio = with_evidence / len(rows) if rows else 1.0
    reasons: list[str] = []
    readiness = "ready"
    if bbox_ratio < 0.95:
        readiness = "review"
        reasons.append(f"only {bbox_ratio:.1%} of DEM bounding boxes are valid")
    if evidence_ratio < 0.85:
        readiness = "review"
        reasons.append(f"only {evidence_ratio:.1%} of DEM observations have evidence references")
    if dem_page.get("completion", {}).get("status") not in {None, "complete"}:
        readiness = "blocked"
        reasons.append("DEM extraction did not complete")
    return PageQuality(
        native_text_coverage=min(1.0, native_token_count / 40),
        zone_coverage=min(1.0, sum(zone.bbox.area for zone in zones)),
        dem_bbox_valid_ratio=bbox_ratio,
        evidence_coverage=evidence_ratio,
        readiness=readiness,
        reasons=reasons,
    )
