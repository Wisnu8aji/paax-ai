"""
PAAX Core Engine — RAB tersektor (WBS standar konstruksi Indonesia).

Engine mengelompokkan item RAB ke dalam 7 seksi baku dan mengurutkannya
(substruktur → struktur → finishing → MEP → luar → akhir), lalu menghitung
subtotal & bobot per seksi. AI (lapis orkestrasi) cukup memberi `section` per
item hasil screening gambar; SEMUA angka tetap dihitung engine.
"""
from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel

from .models import AHSPItem, ResourcePrice, RABLineInput, RABLine
from .rab import compute_rab, money


# Urutan & judul kanonik (sesuai template WBS yang dipakai estimator ID).
WBS_SECTIONS: List[tuple[str, str]] = [
    ("I", "Pekerjaan Persiapan"),
    ("II", "Pekerjaan Tanah"),
    ("III", "Pekerjaan Struktur"),
    ("IV", "Pekerjaan Arsitektur / Finishing"),
    ("V", "Pekerjaan MEP"),
    ("VI", "Pekerjaan Luar"),
    ("VII", "Pekerjaan Akhir"),
]
_TITLES: Dict[str, str] = {code: title for code, title in WBS_SECTIONS}
_ORDER: Dict[str, int] = {code: i for i, (code, _) in enumerate(WBS_SECTIONS)}
_OTHER = "LAINNYA"


def normalize_section(raw: Optional[str]) -> str:
    """Map input section ('iii', 'III', '3', 'Struktur') ke kode kanonik."""
    if not raw:
        return _OTHER
    s = raw.strip().upper()
    if s in _TITLES:
        return s
    roman = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII"}
    if s in roman:
        return roman[s]
    for code, title in WBS_SECTIONS:
        if s == title.upper() or s in title.upper():
            return code
    return _OTHER


class RABSection(BaseModel):
    code: str
    title: str
    lines: List[RABLine]
    subtotal: float
    weight_pct: float   # bobot seksi terhadap subtotal RAB


class SectionedRABResult(BaseModel):
    region: str
    region_code: str
    sections: List[RABSection]
    subtotal: float
    ppn_rate: float
    ppn: float
    total: float


def build_sectioned_rab(
    lines_input: List[RABLineInput],
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
    region: str,
    region_code: str,
    ppn_rate: float = 0.11,
    overhead_override: float | None = None,
    rounding_mode: str = "exact",
) -> SectionedRABResult:
    rab = compute_rab(lines_input, ahsp_index, price_book,
                      region=region, region_code=region_code, ppn_rate=ppn_rate,
                      overhead_override=overhead_override, rounding_mode=rounding_mode)

    # Kelompokkan baris hasil engine ke seksi (urutan output = urutan input).
    grouped: Dict[str, List[RABLine]] = {}
    for li, ln in zip(lines_input, rab.lines):
        grouped.setdefault(normalize_section(li.section), []).append(ln)

    def section_order(code: str) -> int:
        return _ORDER.get(code, len(WBS_SECTIONS) + (0 if code != _OTHER else 1))

    sections: List[RABSection] = []
    for code in sorted(grouped.keys(), key=section_order):
        members = grouped[code]
        subtotal = money(sum(ln.amount for ln in members))
        weight = round(sum(ln.weight_pct for ln in members), 4)
        sections.append(RABSection(
            code=code,
            title=_TITLES.get(code, "Lainnya"),
            lines=members,
            subtotal=subtotal,
            weight_pct=weight,
        ))

    return SectionedRABResult(
        region=rab.region, region_code=rab.region_code, sections=sections,
        subtotal=rab.subtotal, ppn_rate=rab.ppn_rate, ppn=rab.ppn, total=rab.total,
    )
