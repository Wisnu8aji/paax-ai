"""Parser level/peil (brain-00 §2.5). Tanda +/- WAJIB terbaca & benar."""
from __future__ import annotations

import re
from dataclasses import dataclass

_LEVEL_PATTERN = re.compile(r"^(SFL\.?|EL|PEIL)\s*([+\-±])\s*(\d+(?:[.,]\d+)?)$", re.IGNORECASE)
_BARE_LEVEL_PATTERN = re.compile(r"^([+\-±])(\d+(?:[.,]\d+)?)$")


@dataclass
class LevelResult:
    raw: str
    label: str
    nilai_m: float


def parse_level(s: str) -> LevelResult | None:
    raw = s.strip()

    m = _LEVEL_PATTERN.match(raw)
    if m:
        label = m.group(1).upper().rstrip(".")
        sign = -1.0 if m.group(2) == "-" else 1.0
        nilai = float(m.group(3).replace(",", "."))
        return LevelResult(raw=raw, label=label, nilai_m=sign * nilai)

    m = _BARE_LEVEL_PATTERN.match(raw)
    if m:
        sign = -1.0 if m.group(1) == "-" else 1.0
        nilai = float(m.group(2).replace(",", "."))
        return LevelResult(raw=raw, label="", nilai_m=sign * nilai)

    return None
