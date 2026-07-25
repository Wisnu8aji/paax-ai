from __future__ import annotations

import re
from typing import Any

from .models import SheetSemanticProfile
from .text_index import normalize_text

_DISCIPLINE_ALIASES = {
    "architecture": "architecture",
    "architectural": "architecture",
    "arsitektur": "architecture",
    "interior design": "architecture",
    "structure": "structure",
    "structural": "structure",
    "struktur": "structure",
    "sipil": "civil",
    "civil": "civil",
    "mep": "multidiscipline",
    "mep-electrical": "electrical",
    "elektrikal": "electrical",
    "electrical": "electrical",
    "mekanikal": "mechanical",
    "mechanical": "mechanical",
    "plumbing": "plumbing",
    "arsitektur/mep": "multidiscipline",
}

_DRAWING_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("cover", ("GAMBAR KERJA -", "COVER")),
    ("legend", ("DAFTAR SINGKATAN", "NOTASI GAMBAR", "LEGENDA", "LEGEND")),
    ("schedule", ("TABEL KOLOM", "TABEL BALOK", "TABEL PELAT", "SCHEDULE", "DAFTAR PINTU", "DAFTAR JENDELA")),
    ("single_line_diagram", ("SINGLE LINE DIAGRAM",)),
    ("schematic", ("SKEMATIK", "SCHEMATIC")),
    ("road_plan_profile", (
        "PLAN AND PROFILE", "PLAN & PROFILE", "ROAD PLAN", "ROAD PROFILE",
        "LONGITUDINAL PROFILE", "ALIGNMENT PLAN", "GEOMETRIC DESIGN", "RENCANA TRASE",
    )),
    ("bridge_plan", (
        "BRIDGE PLAN", "BRIDGE GENERAL ARRANGEMENT", "GENERAL ARRANGEMENT BRIDGE",
        "RENCANA JEMBATAN", "TATA LETAK JEMBATAN",
    )),
    ("cross_section", ("TYPICAL CROSS SECTION", "CROSS SECTION", "POTONGAN MELINTANG")),
    ("reinforcement_detail", (
        "REINFORCEMENT DETAIL", "REBAR DETAIL", "DETAIL PEMBESIAN", "DETAIL PENULANGAN",
    )),
    ("general_arrangement", ("GENERAL ARRANGEMENT", "GA DRAWING", "LAYOUT UMUM", "TATA LETAK UMUM")),
    ("lightning_protection", ("PENANGKAL PETIR", "GROUNDING")),
    ("fire_safety_plan", ("APAR", "HEAT DETECTOR", "BELL ALARM", "FIRE ALARM")),
    ("hvac_plan", ("INSTALASI AC", "DENAH AC", "HVAC")),
    ("drainage_plan", ("AIR KOTOR", "AIR BEKAS", "AIR HUJAN", "SALURAN")),
    ("plumbing_plan", ("AIR BERSIH", "PLUMBING", "SANITARY")),
    ("lighting_plan", ("TITIK LAMPU", "LIGHTING")),
    ("power_plan", ("STOP KONTAK", "POWER PLAN", "SAKLAR")),
    ("column_plan", ("DENAH KOLOM", "COLUMN PLAN", "COLUMN LAYOUT")),
    ("beam_plan", ("DENAH BALOK", "DENAH SLOOP", "DENAH SLOOF", "BALOK LINTEL", "BEAM PLAN", "BEAM LAYOUT", "FRAMING PLAN")),
    ("foundation_plan", ("DENAH FOOTPLAT", "DENAH PONDASI", "FOUNDATION PLAN", "FOOTING PLAN", "PILE CAP PLAN")),
    ("slab_plan", ("DENAH PELAT", "SLAB PLAN", "SLAB LAYOUT")),
    ("ceiling_plan", ("DENAH PLAFOND", "DENAH PLAFON", "CEILING PLAN", "REFLECTED CEILING PLAN", "RCP")),
    ("finish_plan", ("POLA LANTAI", "FINISH PLAN")),
    ("door_window_plan", ("PINTU & JENDELA", "PINTU DAN JENDELA")),
    ("partition_plan", ("PARTISI", "DIN.PASRTISI", "DIN. PARTISI")),
    ("roof_plan", ("DENAH ATAP", "ROOF PLAN")),
    ("site_plan", ("SITUASI", "SITE PLAN", "RENCANA PAVING")),
    ("elevation", ("TAMPAK", "ELEVATION")),
    ("section", ("POTONGAN", "SECTION")),
    ("detail", ("DETAIL", "STANDAR DETAIL", "STANDARD DETAIL")),
    ("floor_plan", ("DENAH LANTAI", "FLOOR PLAN", "DENAH KM/WC")),
)

_LEVEL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("superstructure", re.compile(r"\b(?:SUPERSTRUCTURE|DECK|GIRDER|BEARING)\b", re.I)),
    ("substructure", re.compile(r"\b(?:SUBSTRUCTURE|ABUTMENT|PIER|PIER\s*CAP)\b", re.I)),
    ("alignment", re.compile(r"\b(?:ROAD\s+ALIGNMENT|ALIGNMENT\s+PLAN|PLAN\s+(?:AND|&)\s+PROFILE|LONGITUDINAL\s+PROFILE|RENCANA\s+TRASE)\b", re.I)),
    ("roof", re.compile(r"\b(?:ATAP|ROOF|ROOFTOP)\b", re.I)),
    ("foundation", re.compile(r"\b(?:FOUNDATION|FONDASI|FOOTPLAT|PILE\s*CAP|BASEMENT\s*FOUNDATION)\b", re.I)),
    ("site", re.compile(r"\b(?:SITE\s*PLAN|RENCANA\s*TAPAK|SITUASI|PAVING|LANDSCAPE)\b", re.I)),
    ("mezzanine", re.compile(r"\b(?:MEZZANINE|MEZANIN)\b", re.I)),
    ("ground", re.compile(r"\b(?:GROUND\s*FLOOR|LANTAI\s*DASAR|LANTAI\s*0|LEVEL\s*0|LT\.?\s*0)\b", re.I)),
)
_NUMERIC_LEVEL_RE = re.compile(r"\b(?:LANTAI|LT\.?|LEVEL|FLOOR)\s*[-.:]?\s*(\d{1,2})\b", re.I)
BASEMENT_LEVEL_RE = re.compile(r"\b(?:BASEMENT|B)\s*[-.:]?\s*(\d{1,2})\b", re.I)
CANONICAL_LEVEL_RE = re.compile(r"\b([LB])\s*[-.:]?\s*(\d{1,2})\b", re.I)
_SCALE_RE = re.compile(r"\b(?:SKALA|SCALE)\s*[:=]?\s*(?:1\s*[:/]\s*\d+|NTS)\b|\bNTS\b", re.I)


# Generic title-block metadata markers.  These are deliberately project-
# agnostic: project names, ministries, cities, and fixture identifiers must
# never become runtime rules.  The same scorer therefore works for a hospital,
# bridge, school, industrial plant, or residential project.
_GENERIC_TITLE_MARKERS = (
    "NAMA PROYEK", "PROJECT NAME", "PEMILIK", "OWNER", "CLIENT",
    "KONSULTAN", "CONSULTANT", "KONTRAKTOR", "CONTRACTOR",
    "LOKASI", "LOCATION", "ALAMAT", "ADDRESS", "TAHUN ANGGARAN",
    "DRAWN BY", "CHECKED BY", "APPROVED BY", "NO. KONTRAK",
    "NOMOR KONTRAK", "SUMBER DANA", "INSTANSI", "AGENCY",
)


def _clean_title_candidate(value: str | None) -> str | None:
    text = " ".join(str(value or "").split()).strip(" -:|")
    if not text:
        return None
    text = re.sub(r"\s+(?:SKALA\s*)?1\s*[:/]\s*\d+\s*$", "", text, flags=re.I).strip()
    text = re.sub(r"\s+TANGGAL\s*:.*$", "", text, flags=re.I).strip()
    return text or None


def _title_score(value: str, *, priority: int = 0) -> float:
    upper = normalize_text(value)
    if any(marker in upper for marker in _GENERIC_TITLE_MARKERS):
        return -100.0
    score = 0.0
    if classify_drawing_type(value) != "unknown":
        score += 100.0
    score += float(priority)
    if 4 <= len(value) <= 80:
        score += 8.0
        score += min(8.0, len(value.split()) * 1.5)
    if len(value.split()) == 1 and value.upper() in {"SALURAN", "DETAIL", "DENAH", "TAMPAK"}:
        score -= 18.0
    elif len(value) > 160:
        score -= 30.0
    if any(word in upper for word in ("JUDUL GAMBAR", "KETERANGAN", "NAMA TANDA TANGAN", "TANGGAL")):
        score -= 40.0
    digit_ratio = sum(character.isdigit() for character in value) / max(len(value), 1)
    if digit_ratio > 0.22:
        score -= 35.0
    return score


def _best_title(identity_title: str | None, native_text: str, dem_page: dict[str, Any] | None) -> str | None:
    candidates: list[tuple[str, int]] = []
    cleaned = _clean_title_candidate(identity_title)
    if cleaned:
        candidates.append((cleaned, 20))
    for view in (dem_page or {}).get("views", []) or []:
        if isinstance(view, dict):
            value = _clean_title_candidate(view.get("title"))
            if value:
                candidates.append((value, 18))
    observations = (dem_page or {}).get("observations", {}) or {}
    for row in observations.get("texts", []) or []:
        if isinstance(row, dict):
            value = _clean_title_candidate(row.get("raw") or row.get("normalized"))
            if value:
                candidates.append((value, 8))
    native_lines = [line.strip() for line in native_text.splitlines() if line.strip()]
    for index, line in enumerate(native_lines):
        value = _clean_title_candidate(line)
        if value:
            candidates.append((value, 0))
        if "JUDUL GAMBAR" in normalize_text(line):
            combined_parts = [
                _clean_title_candidate(item) for item in native_lines[index + 1:index + 3]
            ]
            combined = _clean_title_candidate(" ".join(item for item in combined_parts if item))
            if combined:
                candidates.append((combined, 15))
    if not candidates:
        return None
    # De-duplicate while retaining whether the source was the explicit identity.
    merged: dict[str, int] = {}
    for value, priority in candidates:
        merged[value] = max(merged.get(value, 0), priority)
    ranked = sorted(
        merged.items(),
        key=lambda item: (_title_score(item[0], priority=item[1]), -len(item[0])),
        reverse=True,
    )
    best, priority = ranked[0]
    return best if _title_score(best, priority=priority) > -50 else None

def canonical_discipline(value: str | None, title: str = "") -> str:
    """Resolve discipline with explicit sheet title semantics as authority.

    DEM discipline can be broad (for example ``mep`` or ``multidiscipline``)
    and the title often contains a more specific engineering scope.  We only
    override the DEM value for bounded, domain-specific title phrases; generic
    elevation/section titles keep the source discipline instead of guessing.
    """
    upper = normalize_text(title)
    if any(word in upper for word in (
        "TITIK LAMPU", "STOP KONTAK", "SAKLAR", "SINGLE LINE",
        "PENANGKAL PETIR", "GROUNDING", "HEAT DETECTOR", "BELL ALARM",
        "FIRE ALARM",
    )):
        return "electrical"
    if any(word in upper for word in ("INSTALASI AC", "DENAH AC", "DETAIL PEMASANGAN AC", "HVAC")):
        return "mechanical"
    if any(word in upper for word in (
        "AIR BERSIH", "AIR KOTOR", "AIR BEKAS", "AIR HUJAN",
        "BIO SEPTIC", "SEPTIC", "PLUMBING", "SANITARY",
    )):
        return "plumbing"
    if any(word in upper for word in (
        "ROAD", "JALAN", "ALIGNMENT", "RENCANA TRASE", "LONGITUDINAL PROFILE",
        "CROSS SECTION", "POTONGAN MELINTANG", "PAVING", "SITUASI", "SITE PLAN",
    )):
        return "civil"
    if any(word in upper for word in (
        "KOLOM", "BALOK", "PONDASI", "FOOTPLAT", "SLOOP", "SLOOF",
        "PELAT", "KUDA-KUDA", "BASEPLATE", "STANDARD UNTUK PEKERJAAN STRUKTUR",
        "BRIDGE", "JEMBATAN", "ABUTMENT", "PIER", "GIRDER", "BEARING",
        "REINFORCEMENT", "REBAR", "PEMBESIAN", "PENULANGAN",
    )):
        return "structure"
    if any(word in upper for word in (
        "PINTU", "JENDELA", "KUSEN", "PLAFOND", "PLAFON", "POLA LANTAI",
        "PARTISI", "BACKDROP", "BACKGROUND", "SHOPSIGN",
    )):
        return "architecture"

    normalized = normalize_text(value or "").casefold()
    if normalized in _DISCIPLINE_ALIASES:
        return _DISCIPLINE_ALIASES[normalized]
    return "unknown"


def classify_drawing_type(title: str | None) -> str:
    upper = normalize_text(title or "")
    # A sheet explicitly titled as a detail remains a detail even when its
    # subtitle includes words such as TAMPAK, POTONGAN, AC, or PENANGKAL PETIR.
    if upper.startswith("DETAIL ") or upper.startswith("STANDAR DETAIL") or upper.startswith("STANDARD DETAIL"):
        return "detail"
    for drawing_type, keywords in _DRAWING_RULES:
        if any(keyword in upper for keyword in keywords):
            return drawing_type
    return "unknown"


def infer_level(*values: str | None) -> str | None:
    """Infer a canonical spatial level without assuming a fixed building.

    Supports arbitrary numbered floors/basements and bounded non-storey scopes.
    It never defaults to L1/L2 when the drawing does not state a level.
    """
    text = " ".join(normalize_text(value or "") for value in values)
    for level, pattern in _LEVEL_PATTERNS:
        if pattern.search(text):
            return level
    basement = BASEMENT_LEVEL_RE.search(text)
    if basement:
        return f"B{int(basement.group(1))}"
    numeric = _NUMERIC_LEVEL_RE.search(text)
    if numeric:
        value = int(numeric.group(1))
        return "ground" if value == 0 else f"L{value}"
    canonical = CANONICAL_LEVEL_RE.search(text)
    if canonical:
        prefix, number = canonical.groups()
        return f"{prefix.upper()}{int(number)}"
    return None


def _value(obj: Any) -> str | None:
    if isinstance(obj, dict):
        value = obj.get("value")
        return None if value is None else str(value)
    return None if obj is None else str(obj)


def build_sheet_semantics(
    page_index: int,
    *,
    native_text: str,
    dem_page: dict[str, Any] | None,
) -> SheetSemanticProfile:
    identity = (dem_page or {}).get("sheet_identity", {})
    identity_title = _value(identity.get("title"))
    title = _best_title(identity_title, native_text, dem_page)
    sheet_number = _value(identity.get("sheet_number"))
    discipline_raw = _value(identity.get("discipline"))
    scales = []
    for item in identity.get("scale_candidates", []) or []:
        raw = item.get("normalized") or item.get("raw") if isinstance(item, dict) else item
        if raw:
            scales.append(str(raw))
    if not scales:
        scales = [match.group(0).strip() for match in _SCALE_RE.finditer(native_text[:12000])][:8]
    drawing_type = classify_drawing_type(title)
    # Cover sheets often contain a rendering caption (for example "Tampak
    # Depan Gedung") that scores like an elevation.  The document-level title
    # "GAMBAR KERJA" on the first page is the stronger sheet-type authority.
    native_upper = normalize_text(native_text)
    if page_index == 0 and any(marker in native_upper for marker in ("GAMBAR KERJA", "CONSTRUCTION DRAWINGS")):
        drawing_type = "cover"
        if not title or "TAMPAK" in normalize_text(title):
            title = "GAMBAR KERJA"
    discipline = canonical_discipline(discipline_raw, title or "")
    # The title is the strongest level authority.  Searching the whole sheet
    # at once allowed unrelated notes such as "detail atap" to override a
    # title that explicitly says "Lantai 2".  Only fall back to nearby native
    # text when the title does not carry a level marker.
    level = infer_level(title)
    if level is None and drawing_type in {
        "site_plan", "floor_plan", "roof_plan", "finish_plan", "ceiling_plan",
        "door_window_plan", "partition_plan", "foundation_plan", "column_plan",
        "beam_plan", "slab_plan", "lighting_plan", "power_plan",
        "lightning_protection", "fire_safety_plan", "hvac_plan",
        "plumbing_plan", "drainage_plan", "general_arrangement", "bridge_plan",
        "road_plan_profile", "cross_section", "reinforcement_detail",
    }:
        level = infer_level(native_text[:4000])

    # Some construction sheets describe a spatial scope rather than a numbered
    # storey.  Keeping these as ``unknown`` made valid foundation/site objects
    # look incomplete in the human delivery even though the drawing type was
    # deterministic.  These bounded fallbacks are semantic scopes, not guessed
    # elevations: they never convert an ambiguous floor plan into L1/L2.
    if level is None:
        level = {
            "foundation_plan": "foundation",
            "site_plan": "site",
            "roof_plan": "roof",
            "road_plan_profile": "alignment",
        }.get(drawing_type)
    if level is None and drawing_type == "beam_plan" and any(
        marker in normalize_text(title or "") for marker in ("SLOOF", "SLOOP")
    ):
        level = "foundation"
    warnings: list[str] = []
    confidence = 0.97 if dem_page and title else 0.72 if title else 0.35
    if drawing_type == "unknown":
        warnings.append("drawing type could not be resolved deterministically")
        confidence = min(confidence, 0.65)
    if discipline == "unknown":
        warnings.append("discipline could not be resolved deterministically")
        confidence = min(confidence, 0.65)
    evidence_refs: list[str] = []
    for key in ("title", "sheet_number"):
        obj = identity.get(key)
        if isinstance(obj, dict):
            evidence_refs.extend(str(ref) for ref in obj.get("evidence_refs", []) or [])
    return SheetSemanticProfile(
        page_index=page_index,
        sheet_number=sheet_number,
        title=title,
        discipline=discipline,  # type: ignore[arg-type]
        drawing_type=drawing_type,  # type: ignore[arg-type]
        level=level,
        scale_candidates=sorted(dict.fromkeys(scales)),
        source="fused" if dem_page else "native_pdf",
        confidence=confidence,
        evidence_refs=sorted(dict.fromkeys(evidence_refs)),
        warnings=warnings,
    )
