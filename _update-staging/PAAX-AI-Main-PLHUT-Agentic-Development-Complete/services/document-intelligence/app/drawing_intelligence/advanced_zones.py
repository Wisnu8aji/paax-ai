from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from typing import Literal

import fitz
from pydantic import BaseModel, Field

from .coordinates import normalized_bbox
from .models import BBox, PlanZone
from .plan_zones import detect_plan_zones

ViewType = Literal[
    "plan", "elevation", "section", "detail", "schematic", "schedule",
    "legend", "notes", "title_block", "revision", "stamp", "drawing", "unknown",
]


class ViewScaleCandidate(BaseModel):
    raw_text: str
    denominator: int = Field(gt=0)
    bbox: BBox
    confidence: float = Field(ge=0, le=1)
    source: Literal["native_text", "manual", "graphic"] = "native_text"


class HierarchicalViewZone(BaseModel):
    zone_id: str
    page_index: int
    type: ViewType
    bbox: BBox
    parent_zone_id: str | None = None
    title: str | None = None
    scale_candidates: list[ViewScaleCandidate] = Field(default_factory=list)
    exclusion_for_physical_count: bool = False
    confidence: float = Field(ge=0, le=1)
    evidence_refs: list[str] = Field(default_factory=list)
    needs_review: bool = False


class SourceDocumentConflict(BaseModel):
    conflict_id: str
    page_index: int
    field: Literal["title", "scale", "discipline", "level", "revision"]
    content_value: str
    title_block_value: str
    status: Literal["open", "human_resolved", "superseded"] = "open"
    evidence_refs: list[str] = Field(default_factory=list)


class SheetViewAnalysis(BaseModel):
    page_index: int
    zones: list[HierarchicalViewZone]
    scales: list[ViewScaleCandidate]
    conflicts: list[SourceDocumentConflict]
    multi_scale: bool


_SCALE_RE = re.compile(r"(?:SKALA\s*)?1\s*[:/]\s*(\d{1,4})", re.I)
_VIEW_PATTERNS: list[tuple[ViewType, re.Pattern[str]]] = [
    ("plan", re.compile(r"\bDENAH\b|\bPLAN\b", re.I)),
    ("elevation", re.compile(r"\bTAMPAK\b|\bELEVATION\b", re.I)),
    ("section", re.compile(r"\bPOTONGAN\b|\bSECTION\b", re.I)),
    ("detail", re.compile(r"\bDETAIL\b|\bDET\.\b", re.I)),
    ("schematic", re.compile(r"\bSKEMATIK\b|\bSCHEMATIC\b|\bRISER\b", re.I)),
]


def _block_text(page: fitz.Page) -> list[tuple[fitz.Rect, str]]:
    result: list[tuple[fitz.Rect, str]] = []
    for block in page.get_text("blocks", sort=True):
        if len(block) < 5:
            continue
        text = re.sub(r"\s+", " ", str(block[4] or "")).strip()
        if text:
            result.append((fitz.Rect(block[:4]), text))
    return result


def _hash_id(*parts: object) -> str:
    raw = "|".join(str(p) for p in parts).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:14]


def _expand(rect: fitz.Rect, page: fitz.Rect, x: float, y: float) -> fitz.Rect:
    return fitz.Rect(
        max(page.x0, rect.x0 - x), max(page.y0, rect.y0 - y),
        min(page.x1, rect.x1 + x), min(page.y1, rect.y1 + y),
    )


def _distance(a: BBox, b: BBox) -> float:
    ax, ay = a.center
    bx, by = b.center
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _to_hierarchical(zone: PlanZone) -> HierarchicalViewZone:
    mapping: dict[str, ViewType] = {
        "drawing": "drawing", "title_block": "title_block", "legend": "legend",
        "schedule": "schedule", "notes": "notes", "stamp": "stamp", "unknown": "unknown",
        "image": "drawing",
    }
    ztype = mapping.get(zone.type, "unknown")
    return HierarchicalViewZone(
        zone_id=zone.zone_id,
        page_index=zone.page_index,
        type=ztype,
        bbox=zone.bbox,
        exclusion_for_physical_count=ztype in {"title_block", "legend", "schedule", "notes", "revision", "stamp", "detail"},
        confidence=zone.confidence,
        evidence_refs=[f"zone:{zone.zone_id}"],
        needs_review=zone.needs_review,
    )


def extract_scale_candidates(page: fitz.Page) -> list[ViewScaleCandidate]:
    candidates: list[ViewScaleCandidate] = []
    seen: set[tuple[int, tuple[float, float, float, float]]] = set()
    for rect, text in _block_text(page):
        for match in _SCALE_RE.finditer(text):
            denominator = int(match.group(1))
            box = normalized_bbox(rect, page.rect)
            key = (denominator, tuple(round(v, 4) for v in box.values))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(ViewScaleCandidate(
                raw_text=match.group(0), denominator=denominator, bbox=box,
                confidence=0.94 if "SKALA" in match.group(0).upper() else 0.86,
            ))
    return candidates


def analyze_hierarchical_zones(page: fitz.Page, page_index: int) -> SheetViewAnalysis:
    base = detect_plan_zones(page, page_index, detect_tables=True)
    zones = [_to_hierarchical(z) for z in base]
    drawing_parent = next((z for z in zones if z.type == "drawing"), None)
    blocks = _block_text(page)

    # Build focused view zones around headings. These remain proposals and are editable.
    for rect, text in blocks:
        for view_type, pattern in _VIEW_PATTERNS:
            if not pattern.search(text):
                continue
            # Expand a heading into a local view region while avoiding whole-sheet overreach.
            local = _expand(rect, page.rect, page.rect.width * 0.18, page.rect.height * 0.14)
            bbox = normalized_bbox(local, page.rect)
            if bbox.area > 0.6:
                continue
            zone_id = f"p{page_index}-{view_type}-{_hash_id(text, *bbox.values)}"
            zones.append(HierarchicalViewZone(
                zone_id=zone_id, page_index=page_index, type=view_type, bbox=bbox,
                parent_zone_id=drawing_parent.zone_id if drawing_parent else None,
                title=text[:180], exclusion_for_physical_count=view_type == "detail",
                confidence=0.78, evidence_refs=[f"native-text:p{page_index}:{_hash_id(text)}"],
                needs_review=True,
            ))
            break

    scales = extract_scale_candidates(page)
    for scale in scales:
        eligible = [z for z in zones if z.type in {"plan", "elevation", "section", "detail", "schematic", "drawing"}]
        if not eligible:
            continue
        nearest = min(eligible, key=lambda z: _distance(scale.bbox, z.bbox))
        nearest.scale_candidates.append(scale)

    # Deduplicate focused zones with same type and highly overlapping boxes.
    deduped: list[HierarchicalViewZone] = []
    for zone in sorted(zones, key=lambda z: (z.type == "drawing", z.bbox.area, z.zone_id)):
        duplicate = next((d for d in deduped if d.type == zone.type and _iou(d.bbox, zone.bbox) > 0.84), None)
        if duplicate is None:
            deduped.append(zone)
        elif zone.confidence > duplicate.confidence:
            deduped[deduped.index(duplicate)] = zone

    conflicts = detect_content_title_conflicts(deduped)
    return SheetViewAnalysis(
        page_index=page_index,
        zones=deduped,
        scales=scales,
        conflicts=conflicts,
        multi_scale=len({c.denominator for c in scales}) > 1,
    )


def detect_content_title_conflicts(zones: list[HierarchicalViewZone]) -> list[SourceDocumentConflict]:
    title = next((z for z in zones if z.type == "title_block" and z.title), None)
    content = [z for z in zones if z.type in {"plan", "elevation", "section", "schematic"} and z.title]
    if not title or not content:
        return []
    title_norm = title.title.upper()
    conflicts: list[SourceDocumentConflict] = []
    for zone in content:
        content_norm = (zone.title or "").upper()
        # Conservative: only flag when both explicitly use different drawing-family terms.
        families = ["DENAH", "TAMPAK", "POTONGAN", "SKEMATIK"]
        c_family = next((x for x in families if x in content_norm), None)
        t_family = next((x for x in families if x in title_norm), None)
        if c_family and t_family and c_family != t_family:
            conflicts.append(SourceDocumentConflict(
                conflict_id=f"src-conflict-{_hash_id(zone.page_index, c_family, t_family)}",
                page_index=zone.page_index,
                field="title",
                content_value=zone.title or c_family,
                title_block_value=title.title or t_family,
                evidence_refs=zone.evidence_refs + title.evidence_refs,
            ))
    return conflicts


def _iou(a: BBox, b: BBox) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / max(a.area + b.area - inter, 1e-12)
