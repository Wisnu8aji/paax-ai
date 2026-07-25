from __future__ import annotations

import re
from collections import defaultdict

import fitz

from .coordinates import normalized_bbox, union_rect
from .models import PlanZone


_KEYWORDS: dict[str, tuple[str, ...]] = {
    "legend": ("LEGEND", "KETERANGAN", "NOTASI", "SIMBOL"),
    "schedule": ("SCHEDULE", "TABEL", "DAFTAR PINTU", "DAFTAR JENDELA", "TABEL KOLOM", "TABEL BALOK"),
    "notes": ("CATATAN", "NOTES", "GENERAL NOTES", "SPESIFIKASI"),
    "title_block": ("SKALA", "NO. GAMBAR", "LEMBAR", "DRAWING NO", "PEKERJAAN", "KONSULTAN", "DIPERIKSA"),
}


def _expanded(rect: fitz.Rect, page_rect: fitz.Rect, x_pad: float, y_pad: float) -> fitz.Rect:
    return fitz.Rect(
        max(page_rect.x0, rect.x0 - x_pad),
        max(page_rect.y0, rect.y0 - y_pad),
        min(page_rect.x1, rect.x1 + x_pad),
        min(page_rect.y1, rect.y1 + y_pad),
    )


def _text_blocks(page: fitz.Page) -> list[tuple[fitz.Rect, str]]:
    result = []
    for block in page.get_text("blocks", sort=True):
        if len(block) < 5:
            continue
        text = str(block[4] or "").strip()
        if not text:
            continue
        result.append((fitz.Rect(block[:4]), re.sub(r"\s+", " ", text).upper()))
    return result


def _candidate_from_keywords(
    blocks: list[tuple[fitz.Rect, str]], keywords: tuple[str, ...], page_rect: fitz.Rect
) -> tuple[fitz.Rect | None, list[str]]:
    matched = [(rect, text) for rect, text in blocks if any(keyword in text for keyword in keywords)]
    if not matched:
        return None, []
    seed = union_rect(rect for rect, _ in matched)
    if seed is None:
        return None, []
    # Include nearby blocks. This catches the body of a legend/table after its heading.
    expanded = _expanded(seed, page_rect, page_rect.width * 0.05, page_rect.height * 0.08)
    nearby = [(rect, text) for rect, text in blocks if rect.intersects(expanded)]
    merged = union_rect(rect for rect, _ in nearby) or seed
    return _expanded(merged, page_rect, 4.0, 4.0), [text[:160] for _, text in nearby[:12]]


def _table_zones(page: fitz.Page, page_index: int) -> list[PlanZone]:
    zones: list[PlanZone] = []
    finder = getattr(page, "find_tables", None)
    if finder is None:
        return zones
    try:
        tables = finder().tables
    except Exception:
        return zones
    for i, table in enumerate(tables):
        bbox = getattr(table, "bbox", None)
        if not bbox:
            continue
        zones.append(
            PlanZone(
                zone_id=f"p{page_index}-schedule-table-{i}",
                page_index=page_index,
                type="schedule",
                bbox=normalized_bbox(bbox, page.rect),
                confidence=0.93,
                source_text=[],
            )
        )
    return zones


def detect_plan_zones(page: fitz.Page, page_index: int, *, detect_tables: bool = True, drawings: list | None = None) -> list[PlanZone]:
    """Detect conservative semantic page zones using native PDF evidence.

    Zones may overlap. Smaller semantic zones take precedence over the broad
    drawing zone when tokens are assigned. A low-confidence zone is kept and
    marked for review instead of silently inventing a precise boundary.
    """
    blocks = _text_blocks(page)
    zones: list[PlanZone] = []

    if detect_tables:
        zones.extend(_table_zones(page, page_index))

    for zone_type in ("legend", "schedule", "notes", "title_block"):
        rect, texts = _candidate_from_keywords(blocks, _KEYWORDS[zone_type], page.rect)
        if rect is None:
            continue
        box = normalized_bbox(rect, page.rect)
        # Do not duplicate a native table zone almost entirely.
        if zone_type == "schedule" and any(
            z.type == "schedule" and z.bbox.area > 0 and _overlap(box, z.bbox) > 0.8 for z in zones
        ):
            continue
        zones.append(
            PlanZone(
                zone_id=f"p{page_index}-{zone_type}-{len(zones)}",
                page_index=page_index,
                type=zone_type,  # type: ignore[arg-type]
                bbox=box,
                confidence=0.88 if zone_type != "title_block" else 0.82,
                source_text=texts,
                needs_review=box.area > 0.45,
            )
        )

    # Broad drawing zone. Use the page's vector drawing envelope, but fall back
    # to the whole page if the PDF contains only raster content.
    if drawings is None:
        try:
            getter = getattr(page, "get_cdrawings", None)
            drawings = getter() if getter is not None else page.get_drawings()
        except Exception:
            drawings = []
    drawing_rects = [fitz.Rect(item["rect"]) for item in drawings if item.get("rect")]
    envelope = union_rect(drawing_rects)
    if envelope is None or envelope.is_empty:
        envelope = fitz.Rect(page.rect)
        drawing_confidence = 0.55
    else:
        envelope.intersect(page.rect)
        drawing_confidence = 0.86
    zones.insert(
        0,
        PlanZone(
            zone_id=f"p{page_index}-drawing-0",
            page_index=page_index,
            type="drawing",
            bbox=normalized_bbox(envelope, page.rect),
            confidence=drawing_confidence,
            needs_review=drawing_confidence < 0.7,
        ),
    )

    # Deduplicate same-type boxes while preserving independently detected
    # schedules when they do not overlap.
    result: list[PlanZone] = []
    for zone in sorted(zones, key=lambda z: (z.type == "drawing", z.bbox.area)):
        duplicate = next(
            (
                existing
                for existing in result
                if existing.type == zone.type and _overlap(existing.bbox, zone.bbox) >= 0.9
            ),
            None,
        )
        if duplicate is None:
            result.append(zone)
        elif zone.confidence > duplicate.confidence:
            result[result.index(duplicate)] = zone
    result.sort(key=lambda z: (z.type != "drawing", z.zone_id))
    return result


def _overlap(a, b) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / max(min(a.area, b.area), 1e-12)
