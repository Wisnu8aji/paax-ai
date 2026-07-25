from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

import fitz

from .coordinates import pdf_bbox
from .models import BBox, VectorDescriptor


class VectorPageIndex:
    """Small spatial index over native PDF vector paths.

    It avoids rescanning tens of thousands of paths for each symbol candidate.
    The descriptor is deliberately deterministic and lightweight; optional
    learned embeddings may be added later without replacing this evidence.
    """

    def __init__(self, page: fitz.Page, *, cells: int = 32) -> None:
        self.page = page
        self.cells = cells
        try:
            getter = getattr(page, "get_cdrawings", None)
            self.drawings = list(getter() if getter is not None else page.get_drawings())
        except Exception:
            self.drawings = []
        self.grid: dict[tuple[int, int], set[int]] = defaultdict(set)
        self.ignored_large_path_count = 0
        for index, drawing in enumerate(self.drawings):
            rect = drawing.get("rect")
            if rect is None:
                continue
            rect = fitz.Rect(rect)
            normalized = BBox(
                x0=max(0.0, min(1.0, (rect.x0 - page.rect.x0) / max(page.rect.width, 1e-9))),
                y0=max(0.0, min(1.0, (rect.y0 - page.rect.y0) / max(page.rect.height, 1e-9))),
                x1=max(0.0, min(1.0, (rect.x1 - page.rect.x0) / max(page.rect.width, 1e-9))),
                y1=max(0.0, min(1.0, (rect.y1 - page.rect.y0) / max(page.rect.height, 1e-9))),
            )
            x0, y0, x1, y1 = self._cell_bounds(normalized)
            cell_count = (x1 - x0 + 1) * (y1 - y0 + 1)
            # Decide before materialising a potentially huge list of cells.
            # Page-sized CAD paths are normally clipping/background paths and
            # are intentionally excluded from local symbol descriptors.
            if cell_count > 64 or normalized.area > 0.12:
                self.ignored_large_path_count += 1
                continue
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    self.grid[(x, y)].add(index)

    def _cell_bounds(self, box: BBox) -> tuple[int, int, int, int]:
        return (
            max(0, min(self.cells - 1, int(box.x0 * self.cells))),
            max(0, min(self.cells - 1, int(box.y0 * self.cells))),
            max(0, min(self.cells - 1, int(box.x1 * self.cells))),
            max(0, min(self.cells - 1, int(box.y1 * self.cells))),
        )

    def _cells(self, box: BBox):
        x0, y0, x1, y1 = self._cell_bounds(box)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                yield x, y

    def describe(self, box: BBox, *, padding: float = 0.0125) -> VectorDescriptor:
        expanded = BBox(
            x0=max(0.0, box.x0 - padding),
            y0=max(0.0, box.y0 - padding),
            x1=min(1.0, box.x1 + padding),
            y1=min(1.0, box.y1 + padding),
        )
        region = pdf_bbox(expanded, self.page.rect)
        indices = sorted({index for cell in self._cells(expanded) for index in self.grid.get(cell, set())})
        segment_count = curve_count = rectangle_count = closed_count = fill_count = stroke_count = 0
        histogram = [0.0] * 8
        for index in indices:
            drawing = self.drawings[index]
            rect = drawing.get("rect")
            if rect is None or not fitz.Rect(rect).intersects(region):
                continue
            if drawing.get("fill") is not None:
                fill_count += 1
            if drawing.get("color") is not None:
                stroke_count += 1
            if drawing.get("closePath"):
                closed_count += 1
            for item in drawing.get("items", []):
                kind = item[0] if item else None
                if kind == "l" and len(item) >= 3:
                    segment_count += 1
                    p1, p2 = item[1], item[2]
                    x1, y1 = _xy(p1); x2, y2 = _xy(p2)
                    angle = math.atan2(y2 - y1, x2 - x1) % math.pi
                    bucket = min(7, int(angle / math.pi * 8))
                    histogram[bucket] += 1
                elif kind == "c":
                    curve_count += 1
                elif kind == "re":
                    rectangle_count += 1
                elif kind in {"qu", "q"}:
                    curve_count += 1
        total = sum(histogram)
        if total:
            histogram = [round(value / total, 6) for value in histogram]
        return VectorDescriptor(
            width=expanded.width,
            height=expanded.height,
            aspect_ratio=expanded.width / max(expanded.height, 1e-9),
            segment_count=segment_count,
            curve_count=curve_count,
            rectangle_count=rectangle_count,
            closed_path_count=closed_count,
            fill_count=fill_count,
            stroke_count=stroke_count,
            orientation_histogram=histogram,
        )


def _xy(point) -> tuple[float, float]:
    if hasattr(point, "x") and hasattr(point, "y"):
        return float(point.x), float(point.y)
    return float(point[0]), float(point[1])
