"""Parser dimensi penampang & tebal (brain-00 §2.3). Satuan diisi via `units.infer_unit`."""
from __future__ import annotations

import re
from dataclasses import dataclass

_BXH_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)\s*[xX/]\s*(\d+(?:\.\d+)?)$")
_T_PATTERN = re.compile(r"^t\s*=\s*(\d+(?:\.\d+)?)$", re.IGNORECASE)


@dataclass
class SectionResult:
    raw: str
    b: float | None = None
    h: float | None = None
    t: float | None = None
    satuan: str | None = None


def parse_section(s: str) -> SectionResult | None:
    raw = s.strip()

    m = _T_PATTERN.match(raw)
    if m:
        return SectionResult(raw=raw, t=float(m.group(1)))

    m = _BXH_PATTERN.match(raw)
    if m:
        return SectionResult(raw=raw, b=float(m.group(1)), h=float(m.group(2)))

    return None
