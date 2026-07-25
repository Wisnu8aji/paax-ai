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
