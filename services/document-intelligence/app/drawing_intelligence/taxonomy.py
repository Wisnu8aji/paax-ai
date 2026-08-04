from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WorkTaxonomy:
    category: str
    discipline: str
    technical_name: str
    plain_name: str
    plain_description: str
    geometry_kind: str
    expected_attributes: tuple[str, ...] = ()
    code_pattern: re.Pattern[str] | None = None


# The registry deliberately uses construction terms familiar to Indonesian
# practitioners while retaining a short plain-language explanation for
# non-engineers.  It is presentation metadata, not a quantity taxonomy.
_REGISTRY: dict[str, WorkTaxonomy] = {
    "column": WorkTaxonomy(
        "column", "structure", "Kolom", "Kolom struktur",
        "Elemen vertikal yang menyalurkan beban bangunan ke struktur di bawahnya.",
        "object", ("dimensions",), re.compile(r"^(?:K|C)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "beam": WorkTaxonomy(
        "beam", "structure", "Balok", "Balok struktur",
        "Elemen horizontal yang menghubungkan kolom atau menopang pelat dan dinding.",
        "line", ("dimensions",),
        re.compile(r"^(?:B|G|RB|CG|CB|BL|SL|S)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "sloof": WorkTaxonomy(
        "sloof", "structure", "Sloof", "Sloof struktur",
        "Balok pengikat di atas pondasi yang meratakan beban dinding ke fondasi.",
        "line", ("dimensions",), re.compile(r"^(?:SL)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "gording": WorkTaxonomy(
        "gording", "structure", "Gording", "Gording atap",
        "Profil baja penopang penutup atap yang membentang di atas kuda-kuda.",
        "line", ("dimensions",), re.compile(r"^(?:GD|GORDING)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "kuda_kuda": WorkTaxonomy(
        "kuda_kuda", "structure", "Kuda-Kuda", "Kuda-kuda atap",
        "Rangka utama atap yang menyalurkan beban atap ke kolom atau dinding.",
        "line", ("dimensions",), re.compile(r"^(?:KD|JR)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "pipe": WorkTaxonomy(
        "pipe", "plumbing", "Pipa", "Pipa",
        "Saluran pipa untuk air, udara, atau bahan lainnya.",
        "line", ("diameter",), re.compile(r"^(?:PIPA|P)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "slab": WorkTaxonomy(
        "slab", "structure", "Pelat", "Pelat lantai/atap",
        "Bidang struktur horizontal yang membentuk lantai atau atap.",
        "area", ("thickness",), re.compile(r"^(?:PL|SLAB|P|S)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "foundation": WorkTaxonomy(
        "foundation", "structure", "Fondasi", "Fondasi bangunan",
        "Elemen paling bawah yang meneruskan beban bangunan ke tanah.",
        "object", ("dimensions",), re.compile(r"^(?:F|P|PC|PILE|FT)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "wall": WorkTaxonomy(
        "wall", "architecture", "Dinding", "Dinding",
        "Pembatas ruang atau selubung bangunan.",
        "line", ("thickness",), re.compile(r"^(?:WALL|DW|DND)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "door": WorkTaxonomy(
        "door", "architecture", "Pintu", "Pintu",
        "Bukaan yang digunakan untuk akses antar ruang atau keluar-masuk bangunan.",
        "object", ("dimensions",), re.compile(r"^(?:D|P)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "window": WorkTaxonomy(
        "window", "architecture", "Jendela", "Jendela",
        "Bukaan pada dinding untuk cahaya, udara, atau pandangan.",
        "object", ("dimensions",), re.compile(r"^(?:W|J|BV)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "door_window_assembly": WorkTaxonomy(
        "door_window_assembly", "architecture", "Kombinasi Pintu-Jendela", "Pintu dan jendela gabungan",
        "Satu unit bukaan yang menggabungkan daun pintu dan bidang jendela.",
        "object", ("dimensions",), re.compile(r"^PJ-?\d{1,3}[A-Z]?$", re.I),
    ),
    "ceiling_type": WorkTaxonomy(
        "ceiling_type", "architecture", "Tipe Plafon", "Plafon",
        "Jenis bidang plafon yang ditandai pada rencana plafon.",
        "area", (), re.compile(r"^C-?\d{1,3}[A-Z]?$", re.I),
    ),
    "steel_profile": WorkTaxonomy(
        "steel_profile", "structure", "Profil Baja", "Elemen baja struktur",
        "Profil baja yang digunakan sebagai bagian struktur atau rangka.",
        "line", ("dimensions",), re.compile(r"^(?:WF|KD)-?\d{1,3}[A-Z]?$", re.I),
    ),
    "lighting_fixture": WorkTaxonomy(
        "lighting_fixture", "electrical", "Armatur Lampu", "Titik lampu",
        "Perlengkapan penerangan yang ditunjukkan pada gambar elektrikal.",
        "object", (), re.compile(r"^(?:L|TL|DL|SL|LP)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "electrical_fixture": WorkTaxonomy(
        "electrical_fixture", "electrical", "Perlengkapan Elektrikal", "Titik listrik",
        "Perlengkapan seperti sakelar, stop kontak, panel, atau titik daya.",
        "object", (), re.compile(r"^(?:STK|SK|SW|P|LP|EP)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "fire_safety_fixture": WorkTaxonomy(
        "fire_safety_fixture", "fire_safety", "Perlengkapan Proteksi Kebakaran", "Peralatan keselamatan kebakaran",
        "Peralatan seperti APAR, alarm, detector, atau hydrant.",
        "object", (), re.compile(r"^(?:APAR|FA|FD|HD|HYD)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "hvac_fixture": WorkTaxonomy(
        "hvac_fixture", "mechanical", "Peralatan Tata Udara", "Peralatan AC/ventilasi",
        "Peralatan pendingin, ventilasi, atau distribusi udara.",
        "object", (), re.compile(r"^(?:AC|FCU|AHU|EF)-?\d{0,3}[A-Z]?$", re.I),
    ),
    "plumbing_fixture": WorkTaxonomy(
        "plumbing_fixture", "plumbing", "Perlengkapan Plumbing", "Peralatan air dan sanitasi",
        "Perlengkapan sanitasi atau titik jaringan air.",
        "object", (), re.compile(r"^(?:WC|FD|CO|WST|UR|PL)-?\d{0,3}[A-Z]?$", re.I),
    ),
}

_UNKNOWN = WorkTaxonomy(
    "unknown", "unknown", "Belum terklasifikasi", "Belum dikenali",
    "Sistem menemukan tanda pada gambar, tetapi jenis pekerjaannya belum dapat dipastikan.",
    "unknown",
)

_NOISE_PHRASES = (
    "JALAN ", "JL. ", "NO.", "NO ", "TAHUN ANGGARAN", "PEKERJAAN ",
    "DINAS ", "PEMERINTAH ", "KETERANGAN UMUM", "CATATAN UMUM", "NOTASI ",
    "PENULANGAN ", "DETAIL SENGKANG", "GRANITE TILE", "ALAMAT ",
)


_LEVEL_LABELS = {
    "L1": "Lantai 1",
    "L2": "Lantai 2",
    "roof": "Atap",
    "foundation": "Fondasi/Substruktur",
    "site": "Area Tapak",
    "superstructure": "Superstruktur",
    "substructure": "Substruktur",
    "alignment": "Trase/Alignment",
    "unknown": "Belum diketahui",
}


def level_display_name(value: str | None) -> str:
    normalized = str(value or "unknown")
    if normalized in _LEVEL_LABELS:
        return _LEVEL_LABELS[normalized]
    floor = re.fullmatch(r"L(\d{1,2})", normalized, re.I)
    if floor:
        return f"Lantai {int(floor.group(1))}"
    basement = re.fullmatch(r"B(\d{1,2})", normalized, re.I)
    if basement:
        return f"Basement {int(basement.group(1))}"
    if normalized == "ground":
        return "Lantai Dasar"
    if normalized == "mezzanine":
        return "Mezanin"
    return normalized


def taxonomy_for(category: str) -> WorkTaxonomy:
    return _REGISTRY.get(category, _UNKNOWN)


def label_looks_like_document_noise(label: str, code: str | None = None) -> bool:
    normalized = " ".join(label.upper().split())
    compact_code = (code or "").upper()
    explicit_element_reference = bool(
        compact_code
        and re.search(
            rf"(?:PINTU|JENDELA|KOLOM|BALOK|SLOOF|PELAT)\s*\(?\s*{re.escape(compact_code)}\s*\)?",
            normalized,
        )
    )
    # Some native PDF blocks include project/title-block text around a valid
    # definition such as "JENDELA (J1)".  Preserve that definition but strip
    # unsafe dimension assumptions elsewhere in the vocabulary pipeline.
    if len(normalized) > 72 and not explicit_element_reference:
        return True
    if any(phrase in normalized for phrase in _NOISE_PHRASES) and not explicit_element_reference:
        # A concise definition such as "PINTU D1" is useful; long notes and
        # addresses containing an incidental code are not.
        if code is None or normalized not in {code.upper(), f"PINTU {code.upper()}", f"KOLOM {code.upper()}", f"BALOK {code.upper()}"}:
            return True
    if code and code.upper().startswith("NO") and any(ch.isdigit() for ch in code):
        return True
    return False


def suppression_reasons(
    *, category: str, code: str | None, attributes: dict[str, Any], source_sheets: list[dict[str, Any]],
) -> list[str]:
    """Identify audit-only candidates that should not burden ordinary users.

    Suppression never removes the source DEM/cross-reference.  It only routes a
    clearly non-work-item candidate away from the user clarification queue.
    """
    value = (code or "").upper().replace(" ", "")
    raw = " ".join(str(attributes.get("raw") or "").upper().split())
    sheet_types = {str(sheet.get("drawing_type") or "") for sheet in source_sheets}
    disciplines = {str(sheet.get("discipline") or "") for sheet in source_sheets}
    reasons: list[str] = []
    if re.fullmatch(r"E\d+", value) and "FITTING" in raw:
        reasons.append("product_specification_not_a_countable_item")
    if re.fullmatch(r"LT-?\d+", value) and any(marker in raw for marker in ("TABEL", "LANTAI", "LT.")):
        reasons.append("sheet_level_marker_not_an_element")
    if re.fullmatch(r"D-\d+", value) and raw in {value, ""}:
        reasons.append("detail_callout_marker")
    if category == "unknown" and "drainage_plan" in sheet_types and value.startswith(("K", "P", "D", "J", "W")):
        reasons.append("cross_discipline_background_label")
    if category == "unknown" and disciplines == {"plumbing"} and attributes.get("level") in {None, "unknown"}:
        if value.startswith(("K", "P", "D", "J", "W")):
            reasons.append("unresolved_background_on_plumbing_sheet")
    return list(dict.fromkeys(reasons))


def resolve_user_category(category: str, code: str | None, label: str, attributes: dict[str, Any]) -> str:
    """Resolve a presentation category from explicit construction context.

    The source candidate category is retained in the raw analysis.  This helper
    only corrects the human projection when a code grammar and sheet context
    make the class deterministic.
    """
    value = (code or "").upper().replace(" ", "")
    title = str(attributes.get("sheet_title") or "").upper()
    raw = f"{label} {title}".upper()
    if re.fullmatch(r"PJ-?\d{1,3}[A-Z]?", value):
        return "door_window_assembly"
    if re.fullmatch(r"BV-?\d{1,3}[A-Z]?", value) and any(term in raw for term in ("PINTU", "JENDELA", "KUSEN")):
        return "window"
    if re.fullmatch(r"J-?\d{1,3}[A-Z]?", value):
        return "window"
    if re.fullmatch(r"(?:D|P)-?\d{1,3}[A-Z]?", value) and any(term in raw for term in ("PINTU", "JENDELA", "KUSEN")):
        return "door"
    if re.fullmatch(r"C-?\d{1,3}[A-Z]?", value) and "PLAFON" in raw:
        return "ceiling_type"
    if re.fullmatch(r"PC-?\d{1,3}[A-Z]?", value) and any(term in raw for term in ("FOOTPLAT", "FONDASI", "PILE CAP")):
        return "foundation"
    if re.fullmatch(r"S-?\d{1,3}[A-Z]?", value) and any(term in raw for term in ("PELAT", "SLAB")):
        return "slab"
    if re.fullmatch(r"(?:WF|KD)-?\d{1,3}[A-Z]?", value) or "WF " in label.upper():
        return "steel_profile"
    return category


def presentability_reasons(
    *, category: str, code: str | None, label: str, evidence_refs: list[str], attributes: dict[str, Any]
) -> list[str]:
    reasons: list[str] = []
    taxonomy = taxonomy_for(category)
    if category == "unknown" or taxonomy.category == "unknown":
        reasons.append("category_unknown")
    if not code:
        reasons.append("code_missing")
    elif taxonomy.code_pattern and not taxonomy.code_pattern.fullmatch(code):
        reasons.append("code_not_valid_for_category")
    if label_looks_like_document_noise(label, code):
        reasons.append("label_looks_like_note_or_title_block")
    if not evidence_refs:
        reasons.append("evidence_missing")
    if not attributes.get("level") or attributes.get("level") == "unknown":
        reasons.append("level_unknown")
    return reasons


def is_user_presentable(
    *, category: str, code: str | None, label: str, evidence_refs: list[str], attributes: dict[str, Any]
) -> bool:
    blocking = {
        "category_unknown", "code_missing", "code_not_valid_for_category",
        "label_looks_like_note_or_title_block", "evidence_missing",
    }
    return not blocking.intersection(
        presentability_reasons(
            category=category, code=code, label=label,
            evidence_refs=evidence_refs, attributes=attributes,
        )
    )


def humanize_missing_information(values: list[str]) -> list[str]:
    translations = {
        "legend_or_schedule_definition": "Definisi tipe belum ditemukan pada legenda atau tabel.",
        "type_dimensions": "Ukuran elemen belum ditemukan atau belum dapat dipastikan.",
        "level": "Lantai atau level belum dapat dipastikan.",
        "physical_count_verification": "Jumlah fisik belum diverifikasi.",
        "human verification of physical-instance count": "Perlu pemeriksaan manusia untuk memastikan jumlah objek sebenarnya.",
        "geometry": "Geometri objek belum lengkap.",
        "scale": "Skala gambar belum terkonfirmasi.",
    }
    result: list[str] = []
    for value in values:
        rendered = translations.get(value, value.replace("_", " ").strip().capitalize())
        if rendered not in result:
            result.append(rendered)
    return result


def dimensions_text(attributes: dict[str, Any]) -> str | None:
    value = attributes.get("dimensions")
    if not isinstance(value, dict):
        return None
    width = value.get("width", value.get("a"))
    depth = value.get("depth", value.get("b"))
    unit = value.get("unit") or "mm"
    if width is None or depth is None:
        return None
    return f"{width} × {depth} {unit}"


# ─── K2: code grammar, canonical naming, inline dimension parsing ────────────
#
# Master Plan §4.2 L4: item codes follow `([A-Z]+-?\d{1,3}[A-Z]?)`.  The
# taxonomy `_REGISTRY` is the single source of code-pattern truth; these
# helpers replace scattered raw keyword matching in the active classifier.

# Master Plan §4.2 L4 item-code grammar.  The leading negative lookbehind
# prevents matching dimension fragments (e.g. "X10" inside "Lintel 15X10"):
# a code must not be glued to a preceding alphanumeric character.
_K2_CODE_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{1,5}-?\d{1,3}[A-Z]?)")

# 4-part steel profile: "WF 200X100X5.5X8", "H 150X150X7X10",
# "Gording 150x50x20x2.3".
_K2_STEEL_PROFILE_RE = re.compile(
    r"\b(WF1?|H|GD|GORDING)\s*(\d{1,4})\s*[xX×]\s*(\d{1,4})\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\b",
    re.I,
)

# 2-part section: "15X10", "400 x 400 mm", "300X600 mm", "250/600".
_K2_SECTION_RE = re.compile(
    r"\b(\d{1,4})\s*[xX×/]\s*(\d{1,4})\s*(mm|cm|m)?\b", re.I
)

# Thickness: "t=120", "T=8MM".
_K2_THICKNESS_RE = re.compile(r"\bt\s*=\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\b", re.IGNORECASE)

# Master Plan §4.2 canonical naming dictionary (engine-owned).
# Each entry: (template, required_attributes) — name_formatter() enforces the
# required attributes and never invents a value for a missing one.
_NAMING_DICTIONARY: dict[str, tuple[str, tuple[str, ...]]] = {
    "column": ("Kolom Beton Bertulang {code}", ("code",)),
    "beam": ("Balok Beton Bertulang {code}", ("code",)),
    "slab": ("Pelat Beton Bertulang {lantai}", ("lantai",)),
    "foundation": ("Pondasi {subtype} {code}", ("subtype", "code")),
    "sloof": ("Sloof Beton Bertulang {code}", ("code",)),
    "wall": ("Dinding {jenis}", ()),
    "door": ("Pintu {jenis} {code}", ("code",)),
    "window": ("Jendela {jenis} {code}", ("code",)),
    "ceiling_type": ("Plafon {jenis}", ()),
    "steel_profile": ("Profil Baja {code}", ("code",)),
}

# Deterministic scan order for code → category.  Ambiguous single-letter
# prefixes (S in slab/beam, P in foundation/door, C in column/ceiling) are
# resolved by this order, which preserves the historical engine behaviour:
# slab beats beam for bare S; PC/FT/PILE beats bare P for foundation.
_REGISTRY_SCAN_ORDER: tuple[str, ...] = (
    "door_window_assembly",   # PJ
    "window",                 # BV / W / J
    "foundation",             # PC / FT / PILE / F / P
    "slab",                   # PL / SLAB / S
    "steel_profile",          # WF / KD
    "column",                 # K / C
    "beam",                   # B / G / RB / CG / CB / BL / SL
    "wall",                   # WALL / DW / DND
    "door",                   # D / P
    "ceiling_type",           # C
    "lighting_fixture",       # L / TL / DL / SL / LP
    "electrical_fixture",     # STK / SK / SW / P / LP / EP
    "fire_safety_fixture",    # APAR / FA / FD / HD / HYD
    "hvac_fixture",           # AC / FCU / AHU / EF
    "plumbing_fixture",       # WC / FD / CO / WST / UR / PL
)

# Digitless codes are legal element type codes in the wild ("BL" on page-0050,
# "GORDING", "PIPA").  They only resolve when the label is exactly the code,
# so "JALAN" or "DENAH" never become items.
_DIGITLESS_CODE_CATEGORY: dict[str, str] = {
    "BL": "beam",
    "GORDING": "gording",
    "PIPA": "pipe",
    "LINTEL": "beam",
    "LATEI": "beam",
}


def extract_item_code(text: str | None) -> str | None:
    """Extract the first Master Plan §4.2 item code from a label.

    Grammar: `([A-Z]+-?\\d{1,3}[A-Z]?)` — e.g. K1, K1A, K-01, PC1, WF1, STK-2.
    Digitless element codes (BL) are accepted only when the whole label is
    exactly that code, so free text like "JALAN" is never treated as a code.
    """
    if not text:
        return None
    upper = " ".join(str(text).upper().split())
    match = _K2_CODE_RE.search(upper)
    if match:
        return match.group(1)
    stripped = upper.strip(" ():[]-.")
    if stripped in _DIGITLESS_CODE_CATEGORY:
        return stripped
    return None


def category_from_code(code: str | None, *, title: str = "", raw: str = "") -> str:
    """Wire the taxonomy `_REGISTRY` code patterns into active classification.

    Replaces raw keyword matching (Master Plan E7/F): given an item code,
    return the L2 category by scanning the registry's `code_pattern`s in a
    deterministic order.  Explicit sheet/title context can override ambiguous
    prefixes (e.g. C1 on a plafond sheet → ceiling_type).

    Two single-letter prefixes are genuinely ambiguous in Indonesian drawings
    and the legacy engine deliberately left them unknown without context:
      - bare ``P``:  PINTU (door) vs PONDASI/FOOTPLAT (foundation)
      - bare ``C``:  PLAFON (ceiling) vs KOLOM variant (column)
    They resolve only with explicit context, exactly as before.

    ``D-\\d+`` (dashed detail callout, e.g. "D-01") is NOT a door code; the
    presentation layer treats it as a detail_callout_marker (suppression_reasons).
    """
    if not code:
        return "unknown"
    value = " ".join(str(code).upper().split())
    if value in _DIGITLESS_CODE_CATEGORY:
        return _DIGITLESS_CODE_CATEGORY[value]
    if re.fullmatch(r"D-\d+", value):
        return "unknown"
    context = " ".join(str(title).upper().split()) + " " + " ".join(str(raw).upper().split())
    if re.fullmatch(r"P-?\d{1,3}[A-Z]?", value):
        if any(term in context for term in ("PINTU", "JENDELA", "KUSEN")):
            return "door"
        if any(term in context for term in ("FOOTPLAT", "PONDASI", "FONDASI", "PILE CAP")):
            return "foundation"
        return "unknown"
    if re.fullmatch(r"C-?\d{1,3}[A-Z]?", value):
        if any(term in context for term in ("PLAFON", "PLAFOND", "CEILING")):
            return "ceiling_type"
        return "unknown"
    for category in _REGISTRY_SCAN_ORDER:
        taxonomy = _REGISTRY.get(category)
        if taxonomy is None or taxonomy.code_pattern is None:
            continue
        if taxonomy.code_pattern.fullmatch(value):
            return category
    return "unknown"


def _strip_code_suffix(text: str) -> str:
    """Remove a trailing item code from a label, e.g. 'WF 200X100X5.5X8 (KD.1)'."""
    return re.sub(r"\s*[(-]?\s*(?:[A-Z]{1,5}-?\d{1,3}[A-Z]?)\s*[)]?\s*$", "", text).strip()


def parse_inline_dimensions(text: str | None) -> dict[str, Any] | None:
    """Parse dimensions embedded in an element label (K2).

    Deterministic, engine-only:
      - "Lintel 15X10"      → {"width": 150, "depth": 100, "unit": "mm",
                               "source": "inline_cm", ...}   (15×10 cm)
      - "400 x 400 mm"      → {"width": 400, "depth": 400, "unit": "mm"}
      - "WF 200X100X5.5X8"  → {"profile": "WF", "b": 200, "h": 100,
                               "tw": 5.5, "tf": 8, "unit": "mm"}
      - "t=120"             → {"thickness": 120, "unit": "mm"}
    Returns None when no dimension is embedded.  Values are never invented:
    the unit defaults to mm only for the 3-part steel profile family, which
    is the universal Indonesian drafting convention for WF/H profiles.
    """
    if not text:
        return None
    normalized = str(text)
    # 4-part steel profile: "WF 200X100X5.5X8", "H 150X150X7X10"
    steel = _K2_STEEL_PROFILE_RE.search(normalized)
    if steel:
        return {
            "profile": steel.group(1).upper(),
            "b": float(steel.group(2)),
            "h": float(steel.group(3)),
            "tw": float(steel.group(4)),
            "tf": float(steel.group(5)),
            "unit": "mm",
            "source": "inline_steel_profile",
        }
    # 2-part section: "15X10", "400 x 400 mm", "300X600 mm", "250/600"
    section = _K2_SECTION_RE.search(normalized)
    if section:
        first, second = float(section.group(1)), float(section.group(2))
        unit_match = section.group(3)
        unit = (unit_match or "mm").lower()
        source = "inline_text"
        if unit == "cm":
            first, second = first * 10, second * 10
            unit = "mm"
            source = "inline_cm"
        elif unit == "m":
            first, second = first * 1000, second * 1000
            unit = "mm"
            source = "inline_m"
        # Indonesian practice writes small concrete sections in cm without a
        # unit suffix ("Lintel 15X10" → 150×100 mm).  Apply the ×10 rule only
        # when the label names a small lintel/latei/kusen family AND the
        # numbers are in the plausible cm range; never for explicit units or
        # large structural dimensions.
        elif (
            source == "inline_text"
            and re.search(r"\b(?:LINTEL|LATEI|KUSEN)\b", normalized, re.I)
            and first <= 30 and second <= 30
        ):
            first, second = first * 10, second * 10
            source = "inline_cm"
        # Whole millimetre dimensions render as integers (e.g. "250 × 600 mm"),
        # matching the written dimension convention on the sheets.
        first = int(first) if first.is_integer() else first
        second = int(second) if second.is_integer() else second
        return {
            "width": first,
            "depth": second,
            "unit": unit,
            "source": source,
            "raw": section.group(0),
        }
    # Thickness: "t=120", "T=8MM"
    thickness = _K2_THICKNESS_RE.search(normalized)
    if thickness:
        return {
            "thickness": float(thickness.group(1)),
            "unit": (thickness.group(2) or "mm").lower(),
            "source": "inline_thickness",
            "raw": thickness.group(0),
        }
    return None


def _foundation_subtype(code: str | None) -> str:
    value = (code or "").upper()
    if value.startswith(("PC", "FT", "PILE")):
        return "Footplat"
    if value.startswith("P"):
        return "Tiang"
    if value.startswith("F"):
        return "Footplat"
    return ""


def _level_lantai(level: str | None) -> str | None:
    if not level:
        return None
    match = re.fullmatch(r"L(\d{1,2})", level, re.I)
    return f"Lt.{int(match.group(1))}" if match else None


def name_formatter(
    *,
    category: str,
    code: str | None = None,
    level: str | None = None,
    subtype: str | None = None,
    material: str | None = None,
    jenis: str | None = None,
) -> str | None:
    """Format the canonical item name per Master Plan §4.2 naming dictionary.

    Engine-owned (never AI): the Owner-facing name is derived from the
    classified L2 category plus deterministic attributes only.

        kolom    → "Kolom Beton Bertulang K1"
        balok    → "Balok Beton Bertulang B2" / "Balok Beton Bertulang BL"
        pelat    → "Pelat Beton Bertulang Lt.1"
        fondasi  → "Pondasi Footplat PC1" / "Pondasi Tiang P2"
        sloof    → "Sloof Beton Bertulang S1"
        dinding  → "Dinding Bata"
        kusen    → "Kusen Aluminium K1"
        pintu    → "Pintu Kayu P1"
        jendela  → "Jendela Aluminium J1"

    Returns None when the category is unknown or a required attribute is
    missing — callers must keep the previous raw label as a fallback.
    """
    name = _NAMING_DICTIONARY.get(category)
    if name is None:
        return None
    template, required = name
    values: dict[str, Any] = {"code": code or ""}
    if category in {"column", "beam", "sloof"}:
        if not code:
            return None
        return template.format(**values)
    if category == "slab":
        lantai = _level_lantai(level) or _level_lantai(code) or (f"Lt.{code}" if code and code.isdigit() else None)
        if not lantai:
            return None
        return template.format(lantai=lantai)
    if category == "foundation":
        resolved_subtype = subtype or _foundation_subtype(code)
        if not resolved_subtype:
            return None
        return template.format(subtype=resolved_subtype, code=code or "")
    if category == "wall":
        return template.format(jenis=jenis or "Bata")
    if category == "door":
        if not code:
            return None
        return template.format(jenis=jenis or "Kayu", code=code)
    if category == "window":
        if not code:
            return None
        return template.format(jenis=jenis or "Aluminium", code=code)
    if category == "ceiling_type":
        return template.format(jenis=jenis or "")
    if category == "steel_profile":
        if not code:
            return None
        return template.format(code=code)
    return None
