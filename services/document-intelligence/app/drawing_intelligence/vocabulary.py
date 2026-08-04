from __future__ import annotations

import math
import re
from collections import defaultdict
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .models import PageIntelligence, SheetSemanticProfile, VocabularyEntry
from .taxonomy import (
    _DIGITLESS_CODE_CATEGORY,
    category_from_code,
    label_looks_like_document_noise,
    parse_inline_dimensions,
    resolve_golden_definition,
)
from .text_index import normalize_text

_CODE_RE = re.compile(r"\b([A-Z]{1,5}(?:[.-]?[A-Z0-9]{0,5})?\d[A-Z0-9.-]*|[A-Z]{1,4}\d{1,3}[A-Z]?)\b", re.I)
_DIMENSION_RE = re.compile(r"\b(\d{2,5})\s*[X×]\s*(\d{2,5})\s*(MM|CM|M)?\b", re.I)


def canonical_key(value: str | None) -> str | None:
    if not value:
        return None
    upper = normalize_text(value)
    # R1 definition resolution: golden element labels whose code is not
    # expressible by the §4.2 grammar ("Lintel 15X10" → LINTEL,
    # "WF 200X100X5.5X8" → WF, "1/2KD" → 1/2KD, "H 150X150X7X10" → H,
    # "Kolom Rafter" → RAFTER) resolve through the golden vocabulary FIRST so a
    # suffix such as "(KD.1)" on a WF profile never hijacks the key.
    golden = resolve_golden_definition(value)
    if golden:
        return golden[0]
    match = _CODE_RE.search(upper)
    if match:
        return re.sub(r"[.\s]+", "", match.group(1).upper())
    # Cycle-002 P1: digitless MEP/structural codes (CU, CO, CG, PAH, KUSEN,
    # BL, WF, …) are real element type codes when the label IS exactly the
    # code.  Free text ("JALAN", "DENAH") never matches because the taxonomy
    # dictionary only registers the bounded element family.
    stripped = upper.strip(" ():[]-.")
    if stripped in _DIGITLESS_CODE_CATEGORY:
        return stripped
    return None


def infer_category(key: str, *, title: str = "", raw: str = "") -> str:
    title_context = normalize_text(title)
    raw_context = normalize_text(raw)
    context = normalize_text(f"{title} {raw}")

    # R1 definition resolution takes precedence over keyword heuristics: a
    # golden definition label such as "Kolom Rafter" must resolve to
    # steel_profile (RAFTER), never to column via the incidental "KOLOM" word,
    # and "1/2KD.1" must resolve to kuda_kuda, not unknown.
    golden = resolve_golden_definition(raw or key)
    if golden and golden[0].upper() == str(key).upper():
        return golden[1]

    # Explicit construction words in the actual label/definition outrank code
    # grammar.  The title is used only to disambiguate a plausible domain code;
    # it must not turn every background label on an MEP sheet into an MEP item.
    if any(word in context for word in ("FOOTPLAT", "FONDASI", "PILE CAP")):
        if re.fullmatch(r"(?:PC|F|FT|PILE)-?\d+[A-Z]?", key):
            return "foundation"
    if "KOLOM" in raw_context:
        return "column"
    if any(word in raw_context for word in ("BALOK", "SLOOF", "SLOOP", "LINTEL")):
        return "beam"
    if any(word in raw_context for word in ("PELAT", "SLAB")):
        return "slab"
    if any(word in raw_context for word in ("PLAFON", "PLAFOND")) and re.fullmatch(r"C-?\d+[A-Z]?", key):
        return "ceiling_type"
    if re.fullmatch(r"PJ-?\d+[A-Z]?", key) or "PINTU JENDELA" in raw_context:
        return "door_window_assembly"
    if "PINTU" in raw_context or re.search(r"\bDOOR\b", raw_context):
        return "door"
    if any(word in raw_context for word in ("JENDELA", "KUSEN")) or re.search(r"\bWINDOW\b", raw_context):
        return "window"

    if any(word in raw_context for word in ("LAMPU", "LIGHT", "DOWNLIGHT", "SPOT", "ARMATUR")):
        return "lighting_fixture"
    if re.fullmatch(r"(?:TL|DL|LP|SL)-?\d+[A-Z]?", key) and "LAMPU" in title_context:
        return "lighting_fixture"
    if any(word in raw_context for word in ("STOP KONTAK", "SOCKET", "SAKLAR")):
        return "electrical_fixture"
    if re.fullmatch(r"STK-?\d+[A-Z]?", key) and any(word in title_context for word in ("STOP KONTAK", "POWER")):
        return "electrical_fixture"
    if any(word in raw_context for word in ("APAR", "DETECTOR", "ALARM", "HYDRANT")):
        return "fire_safety_fixture"
    if re.fullmatch(r"(?:APAR|FA|HD|HYD)-?\d*[A-Z]?", key) and any(word in title_context for word in ("APAR", "ALARM", "DETECTOR")):
        return "fire_safety_fixture"
    if any(word in raw_context for word in ("AIR CONDITION", "HVAC", "FCU", "AHU", "EXHAUST FAN")):
        return "hvac_fixture"
    if re.fullmatch(r"(?:AC|FCU|AHU|EF)-?\d*[A-Z]?", key) and any(word in title_context for word in ("DENAH AC", "HVAC")):
        return "hvac_fixture"
    if any(word in raw_context for word in ("SANITAIR", "CLOSET", "WASTAFEL", "FLOOR DRAIN", "CLEAN OUT")):
        return "plumbing_fixture"
    if re.fullmatch(r"(?:WC|FD|CO|WST|UR|PL)-?\d*[A-Z]?", key) and any(
        word in title_context for word in ("PLUMBING", "AIR BERSIH", "AIR KOTOR", "AIR HUJAN", "SANITARY")
    ):
        return "plumbing_fixture"

    # Project code grammar is a fallback only after explicit context.  The
    # taxonomy `_REGISTRY` is the single source of code-pattern truth (K2),
    # replacing the previous scattered raw regexes.
    return category_from_code(key, title=title, raw=raw)


def _bbox_distance(a, b) -> float:
    ax, ay = a.center
    bx, by = b.center
    return math.hypot(ax - bx, ay - by)


def _dimension_value(row: dict[str, Any]) -> dict[str, Any] | None:
    raw = str(row.get("raw") or row.get("normalized") or "")
    normalized = normalize_text(raw)
    # A dimension embedded in a material/profile note is not automatically an
    # element opening/overall size.  Example: "KUSEN ALUMINIUM 45x100 mm" on
    # a window detail describes the frame profile, not the J1 opening.
    if any(term in normalized for term in ("KUSEN", "PROFIL", "PROFILE")) and any(
        term in normalized for term in ("PINTU", "JENDELA", "WINDOW", "DOOR")
    ):
        return None
    # K2 deterministic inline-dimension parser (taxonomy): handles plain
    # sections ("400 x 400 mm"), cm shorthand for lintel/latei ("Lintel 15X10"
    # → 150×100 mm), and steel profiles ("WF 200X100X5.5X8").
    parsed = parse_inline_dimensions(raw)
    if not parsed:
        return None
    width = parsed.get("width")
    depth = parsed.get("depth")
    unit = parsed.get("unit") or "mm"
    if width is not None and depth is not None:
        return {
            "width": width, "depth": depth, "a": width, "b": depth,
            "unit": unit, "raw": raw, "source": parsed.get("source", "inline_text"),
        }
    if parsed.get("thickness") is not None:
        thickness = parsed["thickness"]
        return {"thickness": thickness, "unit": unit, "raw": raw, "source": parsed.get("source", "inline_thickness")}
    if parsed.get("profile"):
        return {
            "profile": parsed["profile"], "b": parsed["b"], "h": parsed["h"],
            "tw": parsed["tw"], "tf": parsed["tf"], "unit": unit,
            "raw": raw, "source": parsed.get("source", "inline_steel_profile"),
        }
    # P3: pipe/MEP diameter — "PIPA Ø8 INCHI" → Ø203 mm, "Trexstang Ø12mm".
    if parsed.get("diameter") is not None:
        return {
            "diameter": parsed["diameter"], "unit": parsed.get("unit") or "mm",
            "raw": raw, "source": parsed.get("source", "inline_diameter"),
        }
    return None


def build_project_vocabulary(
    dem_pages: dict[int, dict[str, Any]],
    semantics: dict[int, SheetSemanticProfile],
) -> list[VocabularyEntry]:
    candidates: dict[tuple[str, str], list[VocabularyEntry]] = defaultdict(list)
    definition_types = {"legend", "schedule", "detail"}

    for page_index, dem_page in sorted(dem_pages.items()):
        semantic = semantics.get(page_index)
        title = semantic.title if semantic else ""
        source = dem_page.get("source", {})
        dimensions: list[tuple[dict[str, Any], Any]] = []
        for category, _, row in iter_observations(dem_page):
            if category != "dimensions":
                continue
            box = normalize_dem_bbox(row.get("bbox"), source)
            parsed = _dimension_value(row)
            if box and parsed:
                dimensions.append((parsed, box))

        page_is_definition = bool(
            semantic and semantic.drawing_type in definition_types
            or "TABEL" in normalize_text(title or "")
            or "KETERANGAN" in normalize_text(title or "")
        )
        if not page_is_definition:
            # Some MEP plan sheets embed their legend on the same sheet. Symbols
            # with descriptive text still form project vocabulary definitions.
            if not any(category in {"tables", "symbols"} for category, _, _ in iter_observations(dem_page)):
                continue

        for category, row_index, row in iter_observations(dem_page):
            if category not in {"element_labels", "symbols"}:
                continue
            raw = str(row.get("raw") or row.get("normalized") or "")
            key = canonical_key(str(row.get("normalized") or raw))
            if not key:
                continue
            # R1 K2 noise filter: project title-block labels (e.g.
            # "JUDUL PROYEK : … JENDELA (J2) …") must never become definitions.
            if label_looks_like_document_noise(raw, key):
                continue
            if re.fullmatch(r"LT-?\d+", key) and any(
                marker in normalize_text(raw) for marker in ("TABEL", "DETAIL", "LANTAI", "LT.")
            ):
                continue
            if re.fullmatch(r"LT-?\d+", key) and any(
                marker in normalize_text(raw) for marker in ("TABEL", "DETAIL", "LANTAI", "LT.")
            ):
                continue
            box = normalize_dem_bbox(row.get("bbox"), source)
            attributes: dict[str, Any] = {
                "definition_page_type": semantic.drawing_type if semantic else "unknown",
                "sheet_title": title,
                "raw": raw,
            }
            direct_dimension = _dimension_value(row)
            if direct_dimension:
                attributes["dimensions"] = direct_dimension
            elif box and dimensions:
                nearest, nearest_box = min(dimensions, key=lambda item: _bbox_distance(box, item[1]))
                distance = _bbox_distance(box, nearest_box)
                if distance <= 0.12:
                    attributes["dimensions"] = nearest
            refs = [str(ref) for ref in row.get("evidence_refs", []) or []]
            entry = VocabularyEntry(
                entry_id=f"vocab-p{page_index}-{category}-{row_index}-{key}",
                key=key,
                canonical_key=key,
                category=infer_category(key, title=title or "", raw=raw),
                description=raw,
                attributes=attributes,
                page_index=page_index,
                bbox=box,
                evidence_refs=refs,
                source="schedule" if semantic and semantic.drawing_type == "schedule" else "legend",
                confidence=float(row.get("confidence", 0.5)),
            )
            candidates[(key, entry.category)].append(entry)

    # Keep the richest and most confident definition for each key/category,
    # while preserving alternate evidence in attributes for auditability.
    result: list[VocabularyEntry] = []
    for (key, category), entries in sorted(candidates.items()):
        entries.sort(
            key=lambda item: (
                "dimensions" in item.attributes,
                item.source == "schedule",
                item.confidence,
                len(item.description or ""),
            ),
            reverse=True,
        )
        winner = entries[0].model_copy(deep=True)
        winner.attributes["alternate_definition_ids"] = [item.entry_id for item in entries[1:]]
        winner.attributes["definition_count"] = len(entries)
        winner.evidence_refs = sorted({ref for item in entries for ref in item.evidence_refs})
        result.append(winner)
    return result



def build_native_vocabulary(pages: list[PageIntelligence]) -> list[VocabularyEntry]:
    """Build deterministic definitions from native PDF text in legend/schedule zones.

    This is a fallback for vector PDFs when no DEM fixture exists.  It does not
    infer physical counts: it only captures a code and nearby written
    definition/dimension as project vocabulary.
    """
    entries: dict[tuple[str, str], VocabularyEntry] = {}
    for page in pages:
        semantic = page.semantics
        zone_by_id = {zone.zone_id: zone for zone in page.zones}
        definition_page = bool(
            semantic and semantic.drawing_type in {"legend", "schedule", "detail"}
        )
        grouped: dict[tuple[int, int], list] = defaultdict(list)
        for token in page.tokens:
            zone = zone_by_id.get(token.zone_id or "")
            if not definition_page and (zone is None or zone.type not in {"legend", "schedule"}):
                continue
            grouped[(token.block_no, token.line_no)].append(token)
        for (block_no, line_no), tokens in grouped.items():
            tokens.sort(key=lambda token: token.word_no)
            raw = " ".join(token.text for token in tokens).strip()
            key = canonical_key(raw)
            if not key:
                continue
            # R1 K2 noise filter: title-block text (e.g. "JUDUL PROYEK : …")
            # must never become a native vocabulary definition.
            if label_looks_like_document_noise(raw, key):
                continue
            category = infer_category(key, title=semantic.title if semantic else "", raw=raw)
            dimensions = _dimension_value({"raw": raw})
            attributes: dict[str, Any] = {
                "definition_page_type": semantic.drawing_type if semantic else "unknown",
                "sheet_title": semantic.title if semantic else None,
                "raw": raw,
            }
            if dimensions:
                attributes["dimensions"] = dimensions
            x0=min(token.bbox.x0 for token in tokens); y0=min(token.bbox.y0 for token in tokens)
            x1=max(token.bbox.x1 for token in tokens); y1=max(token.bbox.y1 for token in tokens)
            entry = VocabularyEntry(
                entry_id=f"native-vocab-p{page.profile.page_index}-b{block_no}-l{line_no}-{key}",
                key=key,
                canonical_key=key,
                category=category,
                description=raw,
                attributes=attributes,
                page_index=page.profile.page_index,
                bbox=type(tokens[0].bbox)(x0=x0,y0=y0,x1=x1,y1=y1,space="normalized"),
                evidence_refs=[token.token_id for token in tokens],
                source="schedule" if semantic and semantic.drawing_type == "schedule" else "legend",
                confidence=min(token.confidence for token in tokens),
            )
            previous=entries.get((key,category))
            if previous is None or ("dimensions" in entry.attributes, entry.confidence, len(raw)) > ("dimensions" in previous.attributes, previous.confidence, len(previous.description or "")):
                entries[(key,category)] = entry
    return sorted(entries.values(), key=lambda item: (item.canonical_key,item.category,item.page_index))
