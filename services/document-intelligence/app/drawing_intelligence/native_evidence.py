from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any, Literal

import fitz
from pydantic import BaseModel, Field

from .coordinates import normalized_bbox
from .models import BBox

EvidenceKind = Literal["text", "vector", "image"]


class PageTransform(BaseModel):
    page_index: int
    width_pt: float
    height_pt: float
    rotation: int
    media_box: tuple[float, float, float, float]
    crop_box: tuple[float, float, float, float]


class NativeEvidenceRecord(BaseModel):
    evidence_id: str
    page_index: int
    kind: EvidenceKind
    bbox: BBox
    text: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    source_channel: Literal["native_pdf"] = "native_pdf"


class NativeEvidenceIndex(BaseModel):
    page_index: int
    transform: PageTransform
    records: list[NativeEvidenceRecord]
    grid_size: int = 32
    grid: dict[str, list[int]] = Field(default_factory=dict)

    def query(self, bbox: BBox, kinds: set[EvidenceKind] | None = None) -> list[NativeEvidenceRecord]:
        candidate_ids: set[int] = set()
        for key in _grid_keys(bbox, self.grid_size):
            candidate_ids.update(self.grid.get(key, []))
        result: list[NativeEvidenceRecord] = []
        for idx in sorted(candidate_ids):
            record = self.records[idx]
            if kinds and record.kind not in kinds:
                continue
            if _intersects(record.bbox, bbox):
                result.append(record)
        return result


def _eid(page_index: int, kind: str, index: int, payload: str = "") -> str:
    digest = hashlib.sha1(f"{page_index}|{kind}|{index}|{payload}".encode()).hexdigest()[:16]
    return f"native-{kind}-p{page_index}-{digest}"


def build_native_evidence_index(page: fitz.Page, page_index: int, *, grid_size: int = 32) -> NativeEvidenceIndex:
    records: list[NativeEvidenceRecord] = []
    words = page.get_text("words", sort=True)
    for idx, word in enumerate(words):
        if len(word) < 5:
            continue
        text = str(word[4]).strip()
        if not text:
            continue
        records.append(NativeEvidenceRecord(
            evidence_id=_eid(page_index, "text", idx, text), page_index=page_index, kind="text",
            bbox=normalized_bbox(word[:4], page.rect), text=text,
            attributes={"block_no": int(word[5]) if len(word) > 5 else 0, "line_no": int(word[6]) if len(word) > 6 else 0,
                        "word_no": int(word[7]) if len(word) > 7 else 0},
        ))

    getter = getattr(page, "get_cdrawings", None)
    try:
        drawings = getter() if getter else page.get_drawings()
    except Exception:
        drawings = []
    for idx, item in enumerate(drawings):
        rect = item.get("rect")
        if not rect:
            continue
        records.append(NativeEvidenceRecord(
            evidence_id=_eid(page_index, "vector", idx), page_index=page_index, kind="vector",
            bbox=normalized_bbox(rect, page.rect),
            attributes={
                "type": item.get("type"), "fill": item.get("fill"), "color": item.get("color"),
                "width": item.get("width"), "close_path": item.get("closePath", item.get("close_path")),
                "items_count": len(item.get("items", [])), "layer": item.get("layer"),
            },
        ))

    for idx, image in enumerate(page.get_images(full=True)):
        xref = image[0]
        rects = page.get_image_rects(xref)
        for ridx, rect in enumerate(rects):
            records.append(NativeEvidenceRecord(
                evidence_id=_eid(page_index, "image", idx * 1000 + ridx, str(xref)), page_index=page_index,
                kind="image", bbox=normalized_bbox(rect, page.rect),
                attributes={"xref": xref, "width_px": image[2], "height_px": image[3]},
            ))

    grid: dict[str, list[int]] = defaultdict(list)
    for idx, record in enumerate(records):
        for key in _grid_keys(record.bbox, grid_size):
            grid[key].append(idx)

    return NativeEvidenceIndex(
        page_index=page_index,
        transform=PageTransform(
            page_index=page_index, width_pt=page.rect.width, height_pt=page.rect.height,
            rotation=page.rotation, media_box=tuple(page.mediabox), crop_box=tuple(page.cropbox),
        ),
        records=records, grid_size=grid_size, grid=dict(grid),
    )


def deduplicate_evidence(records: list[NativeEvidenceRecord]) -> list[NativeEvidenceRecord]:
    result: list[NativeEvidenceRecord] = []
    seen: set[tuple] = set()
    for record in records:
        text_key = (record.text or "").strip().upper()
        box_key = tuple(round(v, 4) for v in record.bbox.values)
        key = (record.kind, text_key, box_key)
        if key in seen:
            continue
        seen.add(key)
        result.append(record)
    return result


def _grid_keys(bbox: BBox, size: int) -> list[str]:
    x0 = max(0, min(size - 1, int(bbox.x0 * size)))
    y0 = max(0, min(size - 1, int(bbox.y0 * size)))
    x1 = max(0, min(size - 1, int(max(bbox.x1 - 1e-12, 0) * size)))
    y1 = max(0, min(size - 1, int(max(bbox.y1 - 1e-12, 0) * size)))
    return [f"{x}:{y}" for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def _intersects(a: BBox, b: BBox) -> bool:
    return not (a.x1 < b.x0 or b.x1 < a.x0 or a.y1 < b.y0 or b.y1 < a.y0)
