from __future__ import annotations

import hashlib
import re
from typing import Any

import fitz
from pydantic import BaseModel, Field

from .coordinates import normalized_bbox
from .models import BBox

_DIMENSION_RE = re.compile(r"(?<!\d)(\d{2,4})\s*[xX×]\s*(\d{2,4})(?:\s*[xX×]\s*(\d{2,4}))?")
_CODE_RE = re.compile(r"\b(?:K\d+[A-Z]?|B\d+[A-Z]?|G\d+[A-Z]?|RB\d+[A-Z]?|SL\d+[A-Z]?|PC\d+[A-Z]?|KP|K\.PD)\b", re.I)
_CODE_DIM_RE = re.compile(r"\b((?:K\d+[A-Z]?|B\d+[A-Z]?|G\d+[A-Z]?|RB\d+[A-Z]?|SL\d+[A-Z]?|PC\d+[A-Z]?|KP|K\.PD))\s*[-:=]?\s*(\d{2,4})\s*[xX×]\s*(\d{2,4})(?:\s*[xX×]\s*(\d{2,4}))?", re.I)


class TableCellEvidence(BaseModel):
    cell_id: str
    page_index: int
    row_index: int
    column_index: int
    text: str
    bbox: BBox | None = None
    header_path: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    evidence_refs: list[str] = Field(default_factory=list)


class DefinitionCandidate(BaseModel):
    definition_id: str
    code: str
    page_index: int
    width_mm: int | None = None
    depth_mm: int | None = None
    height_mm: int | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    cell_evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    status: str = "candidate"


class DefinitionResolution(BaseModel):
    code: str
    selected: DefinitionCandidate | None = None
    candidates: list[DefinitionCandidate]
    conflicts: list[str] = Field(default_factory=list)


def _id(*parts: object) -> str:
    return hashlib.sha1("|".join(str(x) for x in parts).encode()).hexdigest()[:16]


def extract_table_cells(page: fitz.Page, page_index: int) -> list[TableCellEvidence]:
    records: list[TableCellEvidence] = []
    finder = getattr(page, "find_tables", None)
    if finder:
        try:
            tables = finder().tables
        except Exception:
            tables = []
        for tindex, table in enumerate(tables):
            extracted = table.extract()
            cells = getattr(table, "cells", [])
            flat = 0
            for row_index, row in enumerate(extracted):
                for col_index, value in enumerate(row):
                    text = str(value or "").strip()
                    rect = cells[flat] if flat < len(cells) else None
                    flat += 1
                    if not text:
                        continue
                    cell_id = f"cell-p{page_index}-{tindex}-{row_index}-{col_index}-{_id(text)}"
                    records.append(TableCellEvidence(
                        cell_id=cell_id, page_index=page_index, row_index=row_index, column_index=col_index,
                        text=text, bbox=normalized_bbox(rect, page.rect) if rect else None,
                        confidence=0.94, evidence_refs=[f"native-table:p{page_index}:t{tindex}"],
                    ))
    if records:
        return records

    # Fallback for line-oriented native text. It preserves evidence even if grid extraction fails.
    for row_index, block in enumerate(page.get_text("blocks", sort=True)):
        text = re.sub(r"\s+", " ", str(block[4] or "")).strip() if len(block) >= 5 else ""
        if not text or not (_CODE_RE.search(text) or _DIMENSION_RE.search(text)):
            continue
        records.append(TableCellEvidence(
            cell_id=f"cell-p{page_index}-fallback-{row_index}-{_id(text)}", page_index=page_index,
            row_index=row_index, column_index=0, text=text, bbox=normalized_bbox(block[:4], page.rect),
            confidence=0.70, evidence_refs=[f"native-text-block:p{page_index}:{row_index}"],
        ))
    return records


def build_definition_candidates(cells: list[TableCellEvidence]) -> list[DefinitionCandidate]:
    by_row: dict[tuple[int, int], list[TableCellEvidence]] = {}
    for cell in cells:
        by_row.setdefault((cell.page_index, cell.row_index), []).append(cell)
    result: list[DefinitionCandidate] = []
    for (page_index, row_index), row_cells in by_row.items():
        text = " | ".join(c.text for c in sorted(row_cells, key=lambda c: c.column_index))
        exact_matches = list(_CODE_DIM_RE.finditer(text))
        if exact_matches:
            for match in exact_matches:
                code = match.group(1).upper().replace(".", "")
                width, depth = int(match.group(2)), int(match.group(3))
                height = int(match.group(4)) if match.group(4) else None
                result.append(DefinitionCandidate(
                    definition_id=f"def-{code}-{page_index}-{row_index}-{_id(text, match.start())}",
                    code=code, page_index=page_index, width_mm=width, depth_mm=depth, height_mm=height,
                    cell_evidence_ids=[c.cell_id for c in row_cells], confidence=min(c.confidence for c in row_cells),
                    attributes={"raw_row": text},
                ))
            continue
        codes = [m.group(0).upper().replace(".", "") for m in _CODE_RE.finditer(text)]
        dims = _DIMENSION_RE.search(text)
        if not codes or not dims or len(set(codes)) != 1:
            continue
        width, depth = int(dims.group(1)), int(dims.group(2))
        height = int(dims.group(3)) if dims.group(3) else None
        code = codes[0]
        result.append(DefinitionCandidate(
            definition_id=f"def-{code}-{page_index}-{row_index}-{_id(text)}",
            code=code, page_index=page_index, width_mm=width, depth_mm=depth, height_mm=height,
            cell_evidence_ids=[c.cell_id for c in row_cells], confidence=min(c.confidence for c in row_cells),
            attributes={"raw_row": text},
        ))
    return result


def resolve_definition(code: str, candidates: list[DefinitionCandidate]) -> DefinitionResolution:
    canonical = code.upper().replace(".", "").strip()
    exact = [c for c in candidates if c.code == canonical]
    if not exact:
        return DefinitionResolution(code=canonical, candidates=[])
    values = {(c.width_mm, c.depth_mm, c.height_mm) for c in exact}
    conflicts = [] if len(values) == 1 else [f"different dimensions across sources: {sorted(values)}"]
    selected = sorted(exact, key=lambda c: (-c.confidence, c.page_index))[0] if not conflicts else None
    if selected:
        selected.status = "resolved"
    return DefinitionResolution(code=canonical, selected=selected, candidates=exact, conflicts=conflicts)
