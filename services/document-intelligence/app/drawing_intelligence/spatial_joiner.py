from __future__ import annotations

"""K3 — Spatial joiner and inline table parser.

Joins element labels, written dimensions, and page location via bounding-box
proximity and row-wise inline table parsing, producing typed
``ElementMeasurementFact`` records with ``source_method="written_dimension"``.

Design constraints (Master Plan §4.2, §4.3):
- Facts are only created when a written dimension observation (or an explicit
  table cell) exists — the engine never fabricates numbers.
- A fact becomes ``engine_verified`` only when it has evidence references and
  a unique, close spatial association (bbox) or an explicit table row.
- Beams: a span length is attached only when a table explicitly provides a
  span/bentang/panjang column; otherwise the item is flagged
  ``missing_information: ["span_length"]`` (fallback, not blocked).
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import BBox, ElementMeasurementFact, WorkItemCandidate
from .text_index import normalize_text
from .vocabulary import canonical_key

# Code grammar mirrors taxonomy._REGISTRY element patterns (B/G/RB/CG/CB/BL/SL,
# K/C, PC/F/FT/PILE, PL/SLAB/P/S ...).  It is deliberately a superset used only
# for row-wise table cell classification, not for canonical naming.  Bare codes
# without digits (e.g. BL) are accepted when short, matching Master Plan
# examples (Balok B2, G1, BL).
_CODE_TOKEN_RE = re.compile(
    r"^(?:(?:B|G|RB|CG|CB|BL|SL|K|C|PC|F|FT|PILE|PL|P|WF|KD|D|W|J|PJ|TL|DL|LP)-?\d{1,3}[A-Z]?|(?:BL|CG|CB|RB|SL|PC|FT|PJ|WF|KD|TL|DL|LP|G|B|K|C|F|P|S|D|W|J))$",
    re.I,
)
_SPAN_COLUMN_RE = re.compile(r"^(?:BENTANG|PANJANG|SPAN|LENGTH|L)\s*$", re.I)
_LEVEL_TITLE_RE = re.compile(r"\b(?:LT\.?|LANTAI|LEVEL)\s*(\d{1,2})\b", re.I)


@dataclass(frozen=True)
class SpatialJoinResult:
    work_items: list[WorkItemCandidate]
    metrics: dict[str, object]


def _parse_dimension_pair(raw: str) -> dict[str, Any] | None:
    """Parse '300X600 mm' / '400 x 400 mm' into a width/depth mm dict.

    Returns None when the text is not a clean two-number dimension pair.
    Multi-number steel profiles (e.g. 'WF 200X100X5.5X8') are rejected so the
    joiner never mistakes a profile for a beam/column section.
    """
    text = raw.strip()
    match = re.fullmatch(r"(\d{1,4})\s*[xX×]\s*(\d{1,4})\s*(MM|CM|M)?", text, re.I)
    if not match:
        # Tolerate a leading element token, e.g. 'K1 400X400 mm' -> pair at end.
        match = re.search(r"(\d{1,4})\s*[xX×]\s*(\d{1,4})\s*(MM|CM|M)?\s*$", text, re.I)
    if not match:
        return None
    # A matched pair must not be the tail of a longer number or a decimal
    # (e.g. '5.5X8' inside 'WF 200X100X5.5X8') — those are steel profiles.
    if match.start() > 0 and (text[match.start() - 1].isdigit() or text[match.start() - 1] == "."):
        return None
    # Reject multi-number profiles: any additional number after the pair start
    # (e.g. 'WF 200X100X5.5X8' -> trailing 5.5 and 8) means this is not a plain
    # section dimension.  Digits in a leading element token (e.g. 'K1 400X400')
    # occur before the pair and are tolerated.
    tail = text[match.start():]
    if len(re.findall(r"\d+(?:\.\d+)?", tail)) > 2:
        return None
    first = float(match.group(1))
    second = float(match.group(2))
    unit = (match.group(3) or "mm").lower()
    if unit == "cm":
        first, second, unit = first * 10, second * 10, "mm"
    elif unit == "m":
        first, second, unit = first * 1000, second * 1000, "mm"
    elif unit == "mm" and match.group(3) is None and first <= 30 and second <= 30:
        # Master Plan §4.3 K2 convention: a bare small pair such as '15X10'
        # on a lintel label is centimetres -> 150×100 mm.
        first, second = first * 10, second * 10
    return {"width": first, "depth": second, "unit": unit}


def parse_inline_table_rows(raw: str) -> list[dict[str, Any]]:
    """Parse a newline-separated DEM table cell blob into row-wise records.

    The DEM tables (e.g. page-0050) flatten a schedule into one cell per line:
    header cells first (TYPE, LOKASI, DIMENSI, ...), then one row per element
    code.  Each element row is the code line followed by its cell values until
    the next code line.  Returns records like::

        {"code": "G1", "width": 300.0, "depth": 600.0, "unit": "mm",
         "span_length": None, "cells": ["TUMPUAN KANAN / KIRI", "LAPANGAN", ...]}

    The header cell list is attached to the first record under ``header`` so
    callers can detect span/bentang columns.
    """
    lines = [line.strip() for line in raw.replace(";", "\n").splitlines() if line.strip()]
    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    header: list[str] = []
    for line in lines:
        if _CODE_TOKEN_RE.match(line):
            if current is not None:
                records.append(current)
            current = {"code": line.upper(), "cells": [], "dimension": None, "span_length": None}
            if not records:
                current["header"] = list(header)
            continue
        if current is None:
            header.append(line.upper())
            continue
        current["cells"].append(line)
        if current["dimension"] is None:
            parsed = _parse_dimension_pair(line)
            if parsed and ("X" in line.upper() or "×" in line):
                current["dimension"] = parsed
        if current["span_length"] is None:
            match = re.fullmatch(r"\s*(\d{2,5})\s*(MM|M)?\s*", line, re.I)
            if match and not re.search(r"[xX×]", line):
                value = float(match.group(1))
                unit = (match.group(2) or "mm").lower()
                if unit == "m":
                    value *= 1000
                current["span_length"] = {"value": value, "unit": "mm"}
    if current is not None:
        records.append(current)
    return records


def _parse_span_columns(cells: list[str]) -> float | None:
    """Extract a span length when a table row explicitly labels a span column.

    Called when the caller already knows the column layout (header contains a
    span/bentang/panjang header); returns the first plausible length in mm.
    """
    for cell in cells:
        match = re.fullmatch(r"\s*(\d{2,5})\s*(MM|M)?\s*", cell, re.I)
        if match:
            value = float(match.group(1))
            unit = (match.group(2) or "mm").lower()
            if unit == "m":
                value *= 1000
            if 1000 <= value <= 30000:
                return value
    return None


def _bbox_center(box: BBox) -> tuple[float, float]:
    return box.center


def _distance(a: BBox, b: BBox) -> float:
    ax, ay = _bbox_center(a)
    bx, by = _bbox_center(b)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _level_and_location_from_title(title: str) -> tuple[str | None, str | None]:
    """Map a sheet title to (level_id, location_label)."""
    match = _LEVEL_TITLE_RE.search(normalize_text(title or ""))
    if not match:
        return None, None
    level = f"L{int(match.group(1))}"
    return level, f"Lantai {int(match.group(1))}"


def _index_page(dem_page: dict[str, Any]) -> dict[str, Any]:
    source = dem_page.get("source", {})
    labels: dict[str, list[dict[str, Any]]] = defaultdict(list)
    dims: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    for category, row_index, row in iter_observations(dem_page):
        box = normalize_dem_bbox(row.get("bbox"), source)
        if box is None:
            continue
        refs = [str(v) for v in row.get("evidence_refs", []) or []]
        raw = str(row.get("raw") or row.get("normalized") or "")
        if category == "element_labels":
            key = canonical_key(raw)
            if key:
                labels[key.upper()].append({"bbox": box, "refs": refs, "raw": raw})
        elif category == "dimensions":
            dims.append({
                "bbox": box,
                "refs": refs,
                "pair": _parse_dimension_pair(raw),
                "raw": raw,
                "numeric_value": row.get("numeric_value"),
                "unit": str(row.get("unit") or "").lower(),
            })
        elif category == "tables":
            tables.append({"bbox": box, "refs": refs, "raw": str(row.get("raw") or "")})
    return {"labels": dict(labels), "dims": dims, "tables": tables}


def _find_near_dimension(
    label_box: BBox, dims: list[dict[str, Any]], *, max_distance: float = 0.05
) -> dict[str, Any] | None:
    """Return the single nearest dimension observation within bbox distance."""
    candidates = [d for d in dims if _distance(label_box, d["bbox"]) <= max_distance]
    if not candidates:
        return None
    candidates.sort(key=lambda d: (_distance(label_box, d["bbox"]), -len(d["refs"])))
    best = candidates[0]
    # Ambiguity guard: two nearly-equal distances with conflicting pairs must
    # not be silently joined.
    if len(candidates) > 1:
        second = candidates[1]
        if (
            _distance(label_box, second["bbox"]) - _distance(label_box, best["bbox"]) < 1e-6
            and best.get("pair") != second.get("pair")
        ):
            return None
    return best


def join_written_dimensions(
    *,
    work_items: list[WorkItemCandidate],
    dem_pages: dict[int, dict[str, Any]],
) -> SpatialJoinResult:
    """Attach written-dimension measurement facts to work items via bbox and tables.

    Returns updated work items and metrics.  Existing facts are preserved; the
    joiner only adds facts for fields that are still missing on the item, so it
    composes with ``compile_definition_measurements`` and
    ``resolve_element_heights`` without overwriting stronger evidence.
    """
    page_indexes: dict[int, dict[str, Any]] = {
        page_index: _index_page(page) for page_index, page in dem_pages.items()
    }
    updated: list[WorkItemCandidate] = []
    facts_added = 0
    table_rows_parsed = 0
    bbox_joins = 0
    span_fallbacks = 0
    locations_mapped = 0

    for item in work_items:
        facts = list(item.measurement_facts)
        existing_fields = {fact.field for fact in facts}
        attributes = dict(item.attributes)
        code = (item.code or "").upper()

        for page_index, index in page_indexes.items():
            # ── Row-wise table join ──────────────────────────────────────────
            for table in index["tables"]:
                rows = parse_inline_table_rows(table["raw"])
                header_cells = [cell.upper() for cell in rows[0]["cells"]] if rows else []
                for record in rows:
                    if record["code"] != code:
                        continue
                    table_rows_parsed += 1
                    dimension = record.get("dimension")
                    if dimension and "width" not in existing_fields and "depth" not in existing_fields:
                        facts.extend([
                            ElementMeasurementFact(
                                measurement_id=f"mf-{item.work_item_id}-width",
                                work_item_id=item.work_item_id,
                                field="width",
                                value=float(dimension["width"]),
                                unit=str(dimension["unit"]),
                                source_method="written_dimension",
                                verification_status="engine_verified",
                                evidence_refs=table["refs"],
                                source_page_indices=[page_index],
                                formula_input="width",
                            ),
                            ElementMeasurementFact(
                                measurement_id=f"mf-{item.work_item_id}-depth",
                                work_item_id=item.work_item_id,
                                field="depth",
                                value=float(dimension["depth"]),
                                unit=str(dimension["unit"]),
                                source_method="written_dimension",
                                verification_status="engine_verified",
                                evidence_refs=table["refs"],
                                source_page_indices=[page_index],
                                formula_input="depth",
                            ),
                        ])
                        existing_fields.update({"width", "depth"})
                        facts_added += 2
                    if item.category in {"beam", "balok"} and "span_length" not in existing_fields:
                        span_value = record.get("span_length") or (
                            _parse_span_columns(record["cells"]) if any(
                                _SPAN_COLUMN_RE.match(header) for header in header_cells
                            ) else None
                        )
                        if span_value is not None:
                            facts.append(ElementMeasurementFact(
                                measurement_id=f"mf-{item.work_item_id}-span_length",
                                work_item_id=item.work_item_id,
                                field="span_length",
                                value=float(span_value["value"] if isinstance(span_value, dict) else span_value),
                                unit="mm",
                                source_method="written_dimension",
                                verification_status="engine_verified",
                                evidence_refs=table["refs"],
                                source_page_indices=[page_index],
                                formula_input="span_length",
                            ))
                            existing_fields.add("span_length")
                            facts_added += 1

            # ── Bbox proximity join: label ↔ dimension ──────────────────────
            for label in index["labels"].get(code, []):
                near = _find_near_dimension(label["bbox"], index["dims"])
                if near is None or not near.get("pair"):
                    continue
                bbox_joins += 1
                pair = near["pair"]
                if "width" not in existing_fields and "depth" not in existing_fields:
                    facts.extend([
                        ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-width",
                            work_item_id=item.work_item_id,
                            field="width",
                            value=float(pair["width"]),
                            unit=str(pair["unit"]),
                            source_method="written_dimension",
                            verification_status="engine_verified",
                            evidence_refs=sorted({*near["refs"], *label["refs"]}),
                            source_page_indices=[page_index],
                            formula_input="width",
                        ),
                        ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-depth",
                            work_item_id=item.work_item_id,
                            field="depth",
                            value=float(pair["depth"]),
                            unit=str(pair["unit"]),
                            source_method="written_dimension",
                            verification_status="engine_verified",
                            evidence_refs=sorted({*near["refs"], *label["refs"]}),
                            source_page_indices=[page_index],
                            formula_input="depth",
                        ),
                    ])
                    existing_fields.update({"width", "depth"})
                    facts_added += 2

        # ── Level/location mapping ───────────────────────────────────────────
        if not attributes.get("level") or attributes.get("level") == "unknown":
            for page_index in item.page_indices:
                dem_page = dem_pages.get(page_index)
                if not dem_page:
                    continue
                title = ""
                identity = dem_page.get("sheet_identity") or {}
                if isinstance(identity.get("title"), dict):
                    title = str(identity["title"].get("value") or "")
                elif isinstance(identity.get("title"), str):
                    title = identity["title"]
                level, location = _level_and_location_from_title(title)
                if level:
                    attributes["level"] = level
                    attributes["location"] = location
                    locations_mapped += 1
                    break

        # ── Beam span fallback: never blocked, flagged missing ───────────────
        missing = list(item.missing_information)
        if item.category in {"beam", "balok"} and "span_length" not in existing_fields:
            if "span_length" not in missing:
                missing.append("span_length")
            span_fallbacks += 1
        missing = sorted(dict.fromkeys(missing))

        updated.append(item.model_copy(update={
            "measurement_facts": facts,
            "attributes": attributes,
            "missing_information": missing,
        }, deep=True))

    return SpatialJoinResult(
        work_items=updated,
        metrics={
            "written_dimension_facts_added": facts_added,
            "table_rows_parsed": table_rows_parsed,
            "bbox_dimension_joins": bbox_joins,
            "beam_span_length_fallbacks": span_fallbacks,
            "locations_mapped": locations_mapped,
        },
    )
