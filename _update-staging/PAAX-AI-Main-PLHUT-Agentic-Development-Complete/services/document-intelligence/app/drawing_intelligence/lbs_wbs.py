"""Deterministic Location Breakdown Structure and WBS projection."""
from __future__ import annotations
from dataclasses import dataclass

WBS_BY_ELEMENT = {
    "foundation": ("02 00 00", "Substruktur / Fondasi"),
    "grade_beam": ("03 30 00", "Substruktur / Sloof"),
    "column": ("03 30 00", "Struktur / Kolom"),
    "practical_column": ("04 20 00", "Arsitektur-Struktur / Kolom Praktis"),
    "beam": ("03 30 00", "Struktur / Balok"),
    "slab": ("03 30 00", "Struktur / Pelat"),
    "wall": ("04 20 00", "Arsitektur / Dinding"),
    "door": ("08 10 00", "Arsitektur / Pintu"),
    "window": ("08 50 00", "Arsitektur / Jendela"),
    "room": ("09 00 00", "Arsitektur / Ruang dan Finishing"),
}
LEVEL_LABELS = {"SUBSTRUCTURE":"Substruktur", "ROOF":"Atap", "L1":"Lantai 1", "L2":"Lantai 2"}

@dataclass(frozen=True)
class WorkBreakdown:
    lbs_path: tuple[str, ...]
    wbs_code: str
    wbs_group: str


def project_breakdown(*, level: str, element_class: str, element_code: str | None = None) -> WorkBreakdown:
    label = LEVEL_LABELS.get(level, level)
    wbs_code, family = WBS_BY_ELEMENT.get(element_class, ("UNCLASSIFIED", "Belum terklasifikasi"))
    leaf = element_code or element_class.replace("_", " ").title()
    return WorkBreakdown(("Bangunan Utama", label, leaf), wbs_code, f"{family} / {label}")
