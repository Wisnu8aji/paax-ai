from __future__ import annotations

from collections.abc import Iterable

import fitz

from .models import BBox


def normalized_bbox(rect: fitz.Rect | tuple[float, float, float, float], page_rect: fitz.Rect) -> BBox:
    r = fitz.Rect(rect)
    width = max(float(page_rect.width), 1e-9)
    height = max(float(page_rect.height), 1e-9)
    return BBox(
        x0=max(0.0, min(1.0, (r.x0 - page_rect.x0) / width)),
        y0=max(0.0, min(1.0, (r.y0 - page_rect.y0) / height)),
        x1=max(0.0, min(1.0, (r.x1 - page_rect.x0) / width)),
        y1=max(0.0, min(1.0, (r.y1 - page_rect.y0) / height)),
        space="normalized",
    )


def pdf_bbox(box: BBox, page_rect: fitz.Rect) -> fitz.Rect:
    if box.space == "pdf_point":
        return fitz.Rect(box.values)
    if box.space != "normalized":
        raise ValueError(f"cannot convert {box.space} without source pixel dimensions")
    return fitz.Rect(
        page_rect.x0 + box.x0 * page_rect.width,
        page_rect.y0 + box.y0 * page_rect.height,
        page_rect.x0 + box.x1 * page_rect.width,
        page_rect.y0 + box.y1 * page_rect.height,
    )


def union_rect(rects: Iterable[fitz.Rect]) -> fitz.Rect | None:
    iterator = iter(rects)
    try:
        result = fitz.Rect(next(iterator))
    except StopIteration:
        return None
    for rect in iterator:
        result.include_rect(rect)
    return result


def intersection_ratio(a: BBox, b: BBox) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    intersection = (x1 - x0) * (y1 - y0)
    return intersection / max(a.area, 1e-12)


def point_in_bbox(point: tuple[float, float], box: BBox) -> bool:
    return box.contains(*point)
