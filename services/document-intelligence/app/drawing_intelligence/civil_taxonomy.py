"""Canonical Indonesian civil-engineering taxonomy used after AI extraction.

AI proposes labels; this deterministic layer normalizes them and refuses unknown
values instead of silently inventing a discipline, level, or element class.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

DISCIPLINE_ALIASES = {
    "struktur": "STR", "structural": "STR", "structure": "STR", "str": "STR",
    "arsitektur": "ARC", "architecture": "ARC", "architectural": "ARC", "arc": "ARC",
    "mep": "MEP", "mechanical": "MEP", "electrical": "MEP", "plumbing": "MEP",
    "sipil": "CIV", "civil": "CIV", "site": "CIV", "drainage": "CIV",
}
ELEMENT_ALIASES = {
    "kolom": "column", "column": "column", "col": "column",
    "balok": "beam", "beam": "beam", "girder": "beam",
    "pelat": "slab", "slab": "slab", "plat": "slab",
    "fondasi": "foundation", "foundation": "foundation", "pile cap": "foundation",
    "sloof": "grade_beam", "tie beam": "grade_beam", "ground beam": "grade_beam",
    "dinding": "wall", "wall": "wall", "pintu": "door", "door": "door",
    "jendela": "window", "window": "window", "ruang": "room", "room": "room",
    "kolom praktis": "practical_column", "kp": "practical_column",
}

@dataclass(frozen=True)
class CanonicalIdentity:
    discipline: str | None
    element_class: str | None
    level: str | None
    confidence: float
    reason_codes: tuple[str, ...]


def canonical_discipline(value: str | None) -> str | None:
    if not value: return None
    return DISCIPLINE_ALIASES.get(value.strip().lower())


def canonical_element(value: str | None) -> str | None:
    if not value: return None
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    if normalized in ELEMENT_ALIASES: return ELEMENT_ALIASES[normalized]
    for alias, canonical in sorted(ELEMENT_ALIASES.items(), key=lambda item: -len(item[0])):
        if re.search(rf"\b{re.escape(alias)}\b", normalized): return canonical
    return None


def canonical_level(value: str | None) -> str | None:
    if not value: return None
    text = value.strip().lower().replace("lt.", "lantai ").replace("lt ", "lantai ")
    if any(token in text for token in ("substructure", "substruktur", "fondasi")): return "SUBSTRUCTURE"
    if any(token in text for token in ("atap", "roof", "dak")): return "ROOF"
    if "basement" in text:
        match = re.search(r"basement\s*(\d+)", text)
        return f"B{match.group(1)}" if match else "BASEMENT"
    match = re.search(r"(?:lantai|level|floor|l)\s*[-:]?\s*(\d+)", text)
    if match: return f"L{int(match.group(1))}"
    if text in {"ground floor", "gf", "dasar"}: return "L1"
    return None


def resolve_identity(*, discipline: str | None, element: str | None, level: str | None) -> CanonicalIdentity:
    d, e, l = canonical_discipline(discipline), canonical_element(element), canonical_level(level)
    reasons=[]
    if d is None: reasons.append("unknown_discipline")
    if e is None: reasons.append("unknown_element_class")
    if l is None: reasons.append("unknown_level")
    confidence = max(0.0, 1.0 - 0.25 * len(reasons))
    return CanonicalIdentity(d, e, l, confidence, tuple(reasons))
