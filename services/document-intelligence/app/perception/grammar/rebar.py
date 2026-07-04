"""
Parser notasi tulangan (brain-00 §2.2). D = ulir (BJTS), O/Ø = polos (BJTP).
d/s di luar rentang wajar -> hasil TETAP dibuat (bukan dibuang) tapi
`needs_review=True` + `W-NUM` (indikasi salah baca), sesuai spek.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.perception.params import DIMS_RANGE

_POKOK_PATTERN = re.compile(r"^(\d+)\s*([DOØ])\s*(\d+)$", re.IGNORECASE)
_SEBAR_PATTERN = re.compile(r"^([DOØ])(\d+)-(\d+)$", re.IGNORECASE)


@dataclass
class RebarResult:
    raw: str
    kind: str  # "pokok" | "sebar"
    d: float
    jenis: str  # "D" | "O"
    n: int | None = None
    s: float | None = None
    warnings: list[str] = field(default_factory=list)
    needs_review: bool = False


def _jenis_dari_huruf(huruf: str) -> str:
    return "D" if huruf.upper() == "D" else "O"


def parse_rebar(s: str, dims_range: dict[str, tuple[float, float]] | None = None) -> RebarResult | None:
    dims_range = dims_range or DIMS_RANGE
    raw = s.strip()
    lo_d, hi_d = dims_range["besi_d"]

    m = _POKOK_PATTERN.match(raw)
    if m:
        d = float(m.group(3))
        needs_review = not (lo_d <= d <= hi_d)
        warnings = ["W-NUM"] if needs_review else []
        return RebarResult(
            raw=raw, kind="pokok", n=int(m.group(1)), d=d,
            jenis=_jenis_dari_huruf(m.group(2)), warnings=warnings, needs_review=needs_review,
        )

    m = _SEBAR_PATTERN.match(raw)
    if m:
        d = float(m.group(2))
        s_val = float(m.group(3))
        needs_review = not (lo_d <= d <= hi_d)
        warnings = ["W-NUM"] if needs_review else []
        return RebarResult(
            raw=raw, kind="sebar", d=d, s=s_val,
            jenis=_jenis_dari_huruf(m.group(1)), warnings=warnings, needs_review=needs_review,
        )

    return None
