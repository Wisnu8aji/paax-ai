from __future__ import annotations


"""K3 — Spatial joiner and inline table parser.

Joins element labels, written dimensions, and page location via bounding-box
proximity and row-wise inline table parsing, producing typed
``ElementMeasurementFact`` records with ``source_method="written_dimension"``.

Design constraints (Master Plan §4.2, §4.3):
- Facts are only created when a written dimension observation (or an explicit
  table cell, or an inline dimension inside the element label itself) exists —
  the engine never fabricates numbers.
- A fact becomes ``engine_verified`` only when it has evidence references and
  a unique, close spatial association (bbox) or an explicit table row.
- Beams: a span length is attached only when a table explicitly provides a
  span/bentang/panjang column; otherwise the item is flagged
  ``missing_information: ["span_length"]`` (fallback, not blocked).

Revision cycle-001 (R2): the joiner additionally connects
- slab/wall thickness observations ("T=130mm", "t=120") near a label,
- inline dimensions embedded in the element label itself
  ("WF1 150X75X5X7", "H150X150X7X10", "Lintel 15X10", "K1 - 400 x 400 mm"),
and reflects joined width/depth facts into ``attributes["dimensions"]`` so
downstream confirmation logic (M8) sees the linked dimension.  Every fact
still traces to a written observation in JSON-1; nothing is invented.

Revision cycle-p1p2 (P3): the joiner additionally connects
- pipe/MEP diameters written on labels or dimension rows
  ("PIPA Ø8 INCHI" → Ø203 mm, "Trexstang Ø12mm" → Ø12 mm, "PVC O 4\""
  → Ø102 mm) as ``diameter`` facts for MEP families, and
- steel profile sections using the K0 golden order convention: the first
  profile number (b) is width and the second (h) is depth, so
  "Gording 150x50x20x2.3" renders 150 × 50 mm exactly like the golden set.
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import BBox, ElementMeasurementFact, WorkItemCandidate
from .taxonomy import parse_inline_dimensions, resolve_golden_definition
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
# R2: slab/wall thickness observations ("T=130mm", "t=120", "T=25MM").
_THICKNESS_RE = re.compile(r"\bT\s*=\s*(\d+(?:\.\d+)?)\s*(MM|CM|M)?\b", re.I)
# R2: an explicit parenthesized code inside a label, e.g. "WF 200X100X5.5X8
# (KD.1)" -> the label belongs to item code KD1.  A dot inside the code is
# tolerated ("KD.1") and normalized away.
_PAREN_CODE_RE = re.compile(r"\(([A-Z]{1,5}[.-]?\d{1,3}[A-Z]?)\)", re.I)

# Cycle-002 C2-2: golden-family code aliases.  The lintel sheet on page-0046
# is titled "TABEL BALOK LT.1" and the golden set names the family LINTEL;
# its labels ("Lintel 15X10") carry the canonical key LINTEL.  Item LT1 (from
# the sheet title) and item LINTEL (from the labels) are the same physical
# lintel family, so both must see the same written-dimension evidence.
_CODE_ALIASES: dict[str, set[str]] = {
    "LT1": {"LINTEL"},
    "LINTEL": {"LT1"},
}

# Cycle-002 C2-2: structural categories that may receive width/depth facts
# from the materials legend ("F1 = FLOOR ex.HOMOGENEOUS TILE 600x600mm").
# Only concrete-structural families are eligible so MEP/architectural codes
# (L2 = CERAMIC TILE, D1 = WALL PAINT, ...) are never mistaken for sections.
_MATERIAL_DIM_CATEGORIES = {"column", "beam", "foundation", "slab", "sloof"}

# P3: MEP/pipe families that receive a written diameter ("Ø25mm", "Ø8 INCHI",
# "3\"", "Trexstang Ø12mm") from their own label or a nearby dimension row.
_DIAMETER_CATEGORIES = {"pipe", "trekstang", "plumbing_fixture", "hvac_fixture", "water_tank"}


def _parenthesized_code(raw: str) -> str | None:
    """Extract an explicit parenthesized element code, e.g. '(KD.1)' -> 'KD1'."""
    match = _PAREN_CODE_RE.search(raw or "")
    if not match:
        return None
    return re.sub(r"[.\s]+", "", match.group(1)).upper()


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


def _parse_thickness(raw: str) -> dict[str, Any] | None:
    """Parse a slab/wall thickness observation ('T=130mm', 't=120') to mm.

    R2: slab (and wall) dimensions are expressed as thickness, not as a
    width×depth pair.  Returns None when no thickness marker is present.
    """
    if not raw:
        return None
    match = _THICKNESS_RE.search(raw)
    if not match:
        return None
    value = float(match.group(1))
    unit = (match.group(2) or "mm").lower()
    if unit == "cm":
        value *= 10
    elif unit == "m":
        value *= 1000
    return {"thickness": value, "unit": "mm"}


def _parse_diameter(raw: str) -> dict[str, Any] | None:
    """P3: parse a pipe/MEP diameter observation to mm.

    Written pipe sizes appear in element labels and dimension rows
    ("Ø25mm", "Ø8 INCHI", "PVC O 4\"", "3\"", "Trexstang Ø12mm").  The
    taxonomy parser only returns a diameter when a Ø/DIA/OD marker, an inch
    unit, or a pipe-family word is present — never for a bare metric number.
    """
    parsed = parse_inline_dimensions(raw or "")
    if parsed and parsed.get("diameter") is not None:
        return {
            "diameter": parsed["diameter"],
            "unit": str(parsed.get("unit") or "mm"),
            "source": parsed.get("source"),
        }
    return None


def _parse_material_dimension(raw: str) -> dict[str, Any] | None:
    """Parse a materials-legend row into (code, width, depth).

    Cycle-002 C2-2: materials rows such as
        "F1 = FLOOR ex.HOMOGENEOUS TILE 600x600mm"
        "F2 = FLOOR 250x250mm"
    are written observations for a structural code and its section size.  A
    row is used only when it starts with an element code (the canonical key
    pattern) followed by '=' and contains a clean WxH pair.  Returns
    ``{"code": "F1", "width": 600.0, "depth": 600.0, "unit": "mm"}`` or None.
    """
    if not raw:
        return None
    match = re.match(r"\s*([A-Z]{1,5}-?\d{1,3}[A-Z]?)\s*=\s*(.*)$", raw, re.I)
    if not match:
        return None
    code = match.group(1).upper()
    pair = _parse_dimension_pair(match.group(2))
    if not pair:
        return None
    return {"code": code, "width": pair["width"], "depth": pair["depth"], "unit": pair["unit"]}


def _parse_table_cell_dimension(line: str, code: str | None) -> dict[str, Any] | None:
    """Parse a table cell line (possibly pipe-separated columns) into a pair.

    P5: ``BAK KONTROL`` table cells on page-0086 are written as
    ``60x60 | 60x60 | 60x60`` — three column cells separated by pipes, each
    ``60x60`` in centimetres.  The DEM normalized the row to
    ``600x600 mm``; the engine mirrors that evidence: for the water_tank
    golden family a bare pair in the plausible centimetre range (≤ 200)
    without an explicit unit is centimetres → millimetres (×10).  Explicit
    units and larger values are left untouched — never invented.
    """
    if not line:
        return None
    golden = resolve_golden_definition(code) if code else None
    is_water_tank = bool(golden and golden[1] == "water_tank")
    for fragment in re.split(r"[|;]", line):
        fragment = fragment.strip()
        parsed = _parse_dimension_pair(fragment)
        if not parsed or ("X" not in fragment.upper() and "×" not in fragment):
            continue
        if is_water_tank and not re.search(r"\b(MM|CM|M)\b", fragment, re.I):
            if parsed["width"] <= 200 and parsed["depth"] <= 200:
                parsed = {
                    "width": parsed["width"] * 10,
                    "depth": parsed["depth"] * 10,
                    "unit": "mm",
                }
        return parsed
    return None


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

    P5: golden-definition element names (``BAK KONTROL``) are digitless codes
    like BL/GORDING and also start a row; their dimension cells follow the
    water_tank cm convention (see ``_parse_table_cell_dimension``).
    """
    lines = [line.strip() for line in raw.replace(";", "\n").splitlines() if line.strip()]
    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    header: list[str] = []
    for line in lines:
        golden = resolve_golden_definition(line)
        is_golden_code = bool(golden and golden[0] != "FRACTIONAL_KD")
        if _CODE_TOKEN_RE.match(line) or is_golden_code:
            if current is not None:
                records.append(current)
            code = line.upper() if _CODE_TOKEN_RE.match(line) else golden[0]  # type: ignore[index]
            current = {"code": code, "cells": [], "dimension": None, "span_length": None}
            if not records:
                current["header"] = list(header)
            continue
        if current is None:
            header.append(line.upper())
            continue
        current["cells"].append(line)
        if current["dimension"] is None:
            parsed = _parse_table_cell_dimension(line, current["code"])
            if parsed:
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
    materials: list[dict[str, Any]] = []
    for category, row_index, row in iter_observations(dem_page):
        box = normalize_dem_bbox(row.get("bbox"), source)
        if box is None:
            continue
        refs = [str(v) for v in row.get("evidence_refs", []) or []]
        raw = str(row.get("raw") or row.get("normalized") or "")
        if category == "element_labels":
            key = canonical_key(raw)
            if key:
                labels[key.upper()].append({
                    "bbox": box,
                    "refs": refs,
                    "raw": raw,
                    # R2: the label may itself carry the dimension
                    # ("WF1 150X75X5X7", "Lintel 15X10", "K1 - 400 x 400 mm").
                    "inline": parse_inline_dimensions(raw),
                })
            # R2: index the label under an explicit parenthesized code too, so
            # "WF 200X100X5.5X8 (KD.1)" is reachable from item code KD1.
            parenthetical = _parenthesized_code(raw)
            if parenthetical and parenthetical.upper() != (key or "").upper():
                labels[parenthetical.upper()].append({
                    "bbox": box,
                    "refs": refs,
                    "raw": raw,
                    "inline": parse_inline_dimensions(raw),
                })
        elif category == "dimensions":
            dims.append({
                "bbox": box,
                "refs": refs,
                "pair": _parse_dimension_pair(raw),
                # R2: slab/wall thickness ("T=130mm", "t=120").
                "thickness": _parse_thickness(raw),
                # P3: pipe/MEP diameter ("Ø25mm", "Ø8 INCHI", "3\"").
                "diameter": _parse_diameter(raw),
                "raw": raw,
                "numeric_value": row.get("numeric_value"),
                "unit": str(row.get("unit") or "").lower(),
            })
        elif category == "tables":
            tables.append({"bbox": box, "refs": refs, "raw": str(row.get("raw") or "")})
        elif category == "materials":
            material = _parse_material_dimension(raw)
            if material:
                materials.append({"bbox": box, "refs": refs, "raw": raw, **material})
    return {"labels": dict(labels), "dims": dims, "tables": tables, "materials": materials}


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


def _find_near_thickness(
    label_box: BBox, dims: list[dict[str, Any]], *, max_distance: float = 0.05
) -> dict[str, Any] | None:
    """R2: nearest dimension observation carrying an explicit thickness."""
    candidates = [
        d for d in dims
        if d.get("thickness") and _distance(label_box, d["bbox"]) <= max_distance
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda d: (_distance(label_box, d["bbox"]), -len(d["refs"])))
    return candidates[0]


def _find_near_diameter(
    label_box: BBox, dims: list[dict[str, Any]], *, max_distance: float = 0.05
) -> dict[str, Any] | None:
    """P3: nearest dimension observation carrying a pipe diameter."""
    candidates = [
        d for d in dims
        if d.get("diameter") and _distance(label_box, d["bbox"]) <= max_distance
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda d: (_distance(label_box, d["bbox"]), -len(d["refs"])))
    return candidates[0]


# C2-2: span candidates must be plausible single-number beam spans in mm.
# Values below 1000 mm or above 15000 mm are grid totals/elevations, not
# beam spans; vertical dimension lines (height/elevation) have bbox height
# greater than width and must not be read as horizontal spans.
_MIN_SPAN_MM = 1000.0
_MAX_SPAN_MM = 15000.0


def _find_near_span(
    label_box: BBox, dims: list[dict[str, Any]], *, max_distance: float = 0.05
) -> dict[str, Any] | None:
    """C2-2: nearest single-number dimension usable as a beam span.

    A span observation is a dimension row with:
    - no width×depth pair and no thickness (a bare number),
    - numeric_value in the plausible span range,
    - a horizontal or square bbox (width >= height) — vertical elevation
      callouts are rejected,
    - a uniquely nearest association (ambiguity guard): the best candidate
      must be at least 1.5× closer than the runner-up, so a dimension that
      could equally belong to another label is never joined.
    """
    candidates: list[dict[str, Any]] = []
    for dim in dims:
        if dim.get("pair") or dim.get("thickness"):
            continue
        value = dim.get("numeric_value")
        if value is None:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if not (_MIN_SPAN_MM <= number <= _MAX_SPAN_MM):
            continue
        if dim["bbox"].width < dim["bbox"].height:
            continue  # vertical dimension line (height/elevation)
        if _distance(label_box, dim["bbox"]) <= max_distance:
            candidates.append(dim)
    if not candidates:
        return None
    candidates.sort(key=lambda d: (_distance(label_box, d["bbox"]), -len(d["refs"])))
    best = candidates[0]
    best_distance = _distance(label_box, best["bbox"])
    if len(candidates) > 1:
        second_distance = _distance(label_box, candidates[1]["bbox"])
        if second_distance < best_distance * 1.5:
            # Ambiguous: another span observation is nearly as close.
            return None
    return {
        "value": float(best["numeric_value"]),
        "refs": best["refs"],
        "bbox": best["bbox"],
        "distance": best_distance,
    }


def _attach_width_depth_facts(
    *,
    item: WorkItemCandidate,
    facts: list[ElementMeasurementFact],
    existing_fields: set[str],
    page_index: int,
    width: float,
    depth: float,
    unit: str,
    refs: list[str],
    attributes: dict[str, Any],
) -> int:
    """Attach engine-verified width/depth facts and mirror into attributes.

    R2: joined written dimensions are reflected in ``attributes["dimensions"]``
    (same dict shape the vocabulary path uses) so the confirmation-area logic
    (M8) sees the linked dimension.  Existing stronger evidence is preserved.
    """
    if "width" in existing_fields and "depth" in existing_fields:
        return 0
    added = 0
    if "width" not in existing_fields:
        facts.append(ElementMeasurementFact(
            measurement_id=f"mf-{item.work_item_id}-width",
            work_item_id=item.work_item_id,
            field="width",
            value=float(width),
            unit=unit,
            source_method="written_dimension",
            verification_status="engine_verified",
            evidence_refs=refs,
            source_page_indices=[page_index],
            formula_input="width",
        ))
        existing_fields.add("width")
        added += 1
    if "depth" not in existing_fields:
        facts.append(ElementMeasurementFact(
            measurement_id=f"mf-{item.work_item_id}-depth",
            work_item_id=item.work_item_id,
            field="depth",
            value=float(depth),
            unit=unit,
            source_method="written_dimension",
            verification_status="engine_verified",
            evidence_refs=refs,
            source_page_indices=[page_index],
            formula_input="depth",
        ))
        existing_fields.add("depth")
        added += 1
    # Mirror into attributes["dimensions"] only when width+depth both present.
    if "width" in existing_fields and "depth" in existing_fields:
        current = attributes.get("dimensions")
        if not isinstance(current, dict):
            current = {}
        current.setdefault("width", float(width))
        current.setdefault("depth", float(depth))
        current.setdefault("unit", unit)
        attributes["dimensions"] = current
    return added


def _attach_diameter_fact(
    *,
    item: WorkItemCandidate,
    facts: list[ElementMeasurementFact],
    existing_fields: set[str],
    page_index: int,
    diameter: float,
    unit: str,
    refs: list[str],
    attributes: dict[str, Any],
) -> int:
    """P3: attach an engine-verified pipe/MEP diameter fact and mirror it
    into ``attributes[\"dimensions\"]`` so ``dimensions_text`` renders it."""
    if "diameter" in existing_fields:
        return 0
    facts.append(ElementMeasurementFact(
        measurement_id=f"mf-{item.work_item_id}-diameter",
        work_item_id=item.work_item_id,
        field="diameter",
        value=float(diameter),
        unit=unit,
        source_method="written_dimension",
        verification_status="engine_verified",
        evidence_refs=refs,
        source_page_indices=[page_index],
        formula_input="diameter",
    ))
    existing_fields.add("diameter")
    current = attributes.get("dimensions")
    if not isinstance(current, dict):
        current = {}
    current.setdefault("diameter", float(diameter))
    current.setdefault("unit", unit)
    attributes["dimensions"] = current
    return 1


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
    inline_label_joins = 0
    thickness_joins = 0
    pipe_diameter_joins = 0
    materials_joins = 0
    span_joins = 0
    span_fallbacks = 0
    locations_mapped = 0

    for item in work_items:
        facts = list(item.measurement_facts)
        existing_fields = {fact.field for fact in facts}
        attributes = dict(item.attributes)
        code = (item.code or "").upper()
        # C2-2: golden-family aliases — LT1 and LINTEL are the same lintel
        # family, so label evidence indexed under either code is reachable.
        lookup_codes = sorted({code, *_CODE_ALIASES.get(code, set())})

        for page_index, index in page_indexes.items():
            # ── Row-wise table join ──────────────────────────────────────────
            for table in index["tables"]:
                rows = parse_inline_table_rows(table["raw"])
                header_cells = [cell.upper() for cell in rows[0]["cells"]] if rows else []
                for record in rows:
                    if record["code"] not in lookup_codes:
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
                        current = attributes.get("dimensions")
                        if not isinstance(current, dict):
                            current = {}
                        current.setdefault("width", float(dimension["width"]))
                        current.setdefault("depth", float(dimension["depth"]))
                        current.setdefault("unit", str(dimension["unit"]))
                        attributes["dimensions"] = current
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

            # ── Inline label dimensions (R2) ────────────────────────────────
            # A label that itself contains the section/profile dimension
            # ("WF1 150X75X5X7", "H150X150X7X10", "Lintel 15X10",
            #  "K1 - 400 x 400 mm") is written evidence for that item.
            for lookup_code in lookup_codes:
                for label in index["labels"].get(lookup_code, []):
                    inline = label.get("inline")
                    if not inline:
                        continue
                    width = inline.get("width")
                    depth = inline.get("depth")
                    if width is None or depth is None and inline.get("profile"):
                        # Steel profile: "WF 200X100X5.5X8" — the K0 golden
                        # convention (page-0055) maps the first number (b) to
                        # width and the second (h) to depth: width=200,
                        # depth=100 (golden width_mm=200, depth_mm=100).
                        profile = inline
                        width = profile.get("b")
                        depth = profile.get("h")
                    if width is None or depth is None:
                        continue
                    if "width" in existing_fields and "depth" in existing_fields:
                        continue
                    added = _attach_width_depth_facts(
                        item=item,
                        facts=facts,
                        existing_fields=existing_fields,
                        page_index=page_index,
                        width=float(width),
                        depth=float(depth),
                        unit=str(inline.get("unit") or "mm"),
                        refs=label["refs"] or [],
                        attributes=attributes,
                    )
                    facts_added += added
                    if added:
                        inline_label_joins += 1

            # ── Bbox proximity join: label ↔ dimension ──────────────────────
            for lookup_code in lookup_codes:
                for label in index["labels"].get(lookup_code, []):
                    near = _find_near_dimension(label["bbox"], index["dims"])
                    if near is None or not near.get("pair"):
                        continue
                    bbox_joins += 1
                    pair = near["pair"]
                    if "width" not in existing_fields and "depth" not in existing_fields:
                        added = _attach_width_depth_facts(
                            item=item,
                            facts=facts,
                            existing_fields=existing_fields,
                            page_index=page_index,
                            width=float(pair["width"]),
                            depth=float(pair["depth"]),
                            unit=str(pair["unit"]),
                            refs=sorted({*near["refs"], *label["refs"]}),
                            attributes=attributes,
                        )
                        facts_added += added

            # ── Slab/wall thickness join (R2) ───────────────────────────────
            if item.category in {"slab", "wall"} and "thickness" not in existing_fields:
                for lookup_code in lookup_codes:
                    for label in index["labels"].get(lookup_code, []):
                        near = _find_near_thickness(label["bbox"], index["dims"])
                        if near is None:
                            continue
                        thickness = near["thickness"]
                        facts.append(ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-thickness",
                            work_item_id=item.work_item_id,
                            field="thickness",
                            value=float(thickness["thickness"]),
                            unit=str(thickness["unit"]),
                            source_method="written_dimension",
                            verification_status="engine_verified",
                            evidence_refs=sorted({*near["refs"], *label["refs"]}),
                            source_page_indices=[page_index],
                            formula_input="thickness",
                        ))
                        existing_fields.add("thickness")
                        current = attributes.get("dimensions")
                        if not isinstance(current, dict):
                            current = {}
                        current.setdefault("thickness", float(thickness["thickness"]))
                        current.setdefault("unit", str(thickness["unit"]))
                        attributes["dimensions"] = current
                        facts_added += 1
                        thickness_joins += 1
                        break

            # ── Pipe/MEP diameter join (P3) ─────────────────────────────────
            # Pipe sizes are written on the label itself ("PIPA Ø8 INCHI",
            # "Trexstang Ø12mm") or as a nearby dimension row ("Ø25mm").
            # A diameter is attached only for MEP/pipe families and only from
            # a real written observation — never invented.
            if item.category in _DIAMETER_CATEGORIES and "diameter" not in existing_fields:
                for lookup_code in lookup_codes:
                    for label in index["labels"].get(lookup_code, []):
                        inline = label.get("inline")
                        if inline and inline.get("diameter") is not None:
                            added = _attach_diameter_fact(
                                item=item,
                                facts=facts,
                                existing_fields=existing_fields,
                                page_index=page_index,
                                diameter=float(inline["diameter"]),
                                unit=str(inline.get("unit") or "mm"),
                                refs=label["refs"] or [],
                                attributes=attributes,
                            )
                            facts_added += added
                            if added:
                                pipe_diameter_joins += 1
                            break
                        near = _find_near_diameter(label["bbox"], index["dims"])
                        if near is None or near.get("diameter") is None:
                            continue
                        added = _attach_diameter_fact(
                            item=item,
                            facts=facts,
                            existing_fields=existing_fields,
                            page_index=page_index,
                            diameter=float(near["diameter"]["diameter"]),
                            unit=str(near["diameter"].get("unit") or "mm"),
                            refs=sorted({*near["refs"], *label["refs"]}),
                            attributes=attributes,
                        )
                        facts_added += added
                        if added:
                            pipe_diameter_joins += 1
                        break

            # ── Materials-legend section join (C2-2) ────────────────────────
            # "F1 = FLOOR ex.HOMOGENEOUS TILE 600x600mm" on the material legend
            # is a written section observation for a structural code.  Only
            # concrete-structural categories are eligible and only when the
            # item still lacks width/depth facts.
            if (
                item.category in _MATERIAL_DIM_CATEGORIES
                and "width" not in existing_fields
                and "depth" not in existing_fields
            ):
                for material in index["materials"]:
                    if material.get("code") not in lookup_codes:
                        continue
                    added = _attach_width_depth_facts(
                        item=item,
                        facts=facts,
                        existing_fields=existing_fields,
                        page_index=page_index,
                        width=float(material["width"]),
                        depth=float(material["depth"]),
                        unit=str(material["unit"]),
                        refs=material["refs"] or [],
                        attributes=attributes,
                    )
                    facts_added += added
                    if added:
                        materials_joins += 1

            # ── Beam span join from a nearby single-number dimension (C2-2) ─
            # A beam whose plan/section label sits next to a plausible bare
            # span number (1000–15000 mm, horizontal bbox, uniquely nearest)
            # receives an engine-verified span_length fact.  The ambiguity
            # guard prevents attaching a grid/elevation total to the beam.
            if (
                item.category in {"beam", "balok"}
                and "span_length" not in existing_fields
            ):
                for lookup_code in lookup_codes:
                    for label in index["labels"].get(lookup_code, []):
                        near = _find_near_span(label["bbox"], index["dims"])
                        if near is None:
                            continue
                        facts.append(ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-span_length",
                            work_item_id=item.work_item_id,
                            field="span_length",
                            value=float(near["value"]),
                            unit="mm",
                            source_method="written_dimension",
                            verification_status="engine_verified",
                            evidence_refs=sorted({*near["refs"], *label["refs"]}),
                            source_page_indices=[page_index],
                            formula_input="span_length",
                        ))
                        existing_fields.add("span_length")
                        span_joins += 1
                        break

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
            "inline_label_dimension_joins": inline_label_joins,
            "slab_wall_thickness_joins": thickness_joins,
            "pipe_diameter_joins": pipe_diameter_joins,
            "materials_section_joins": materials_joins,
            "beam_span_length_joins": span_joins,
            "beam_span_length_fallbacks": span_fallbacks,
            "locations_mapped": locations_mapped,
        },
    )
