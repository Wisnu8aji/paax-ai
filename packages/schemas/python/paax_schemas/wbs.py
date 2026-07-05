from __future__ import annotations

from typing import Optional

WBS_SECTIONS: list[tuple[str, str]] = [
    ("I", "Pekerjaan Persiapan"),
    ("II", "Pekerjaan Tanah"),
    ("III", "Pekerjaan Struktur"),
    ("IV", "Pekerjaan Arsitektur / Finishing"),
    ("V", "Pekerjaan MEP"),
    ("VI", "Pekerjaan Luar"),
    ("VII", "Pekerjaan Akhir"),
]

_TITLES = {code: title for code, title in WBS_SECTIONS}
_OTHER = "LAINNYA"


def normalize_section(raw: Optional[str]) -> str:
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


def section_title(code: str) -> str:
    return _TITLES.get(code, "Lainnya")

