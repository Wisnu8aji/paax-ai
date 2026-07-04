"""Parser mutu beton & profil baja (brain-00 §2.4). Simpan persis, tanpa tafsir (F-B10 = urusan engine)."""
from __future__ import annotations

import re
from dataclasses import dataclass

_FC_PATTERN = re.compile(r"^fc'?\s*(\d+(?:\.\d+)?)$", re.IGNORECASE)
_K_PATTERN = re.compile(r"^K-?\s*(\d+(?:\.\d+)?)$")
_WF_PATTERN = re.compile(r"^WF\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$", re.IGNORECASE)
_PIPA_PATTERN = re.compile(r"^Ø(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$")
_POLOS_PATTERN = re.compile(r"^Ø(\d+(?:\.\d+)?)$")


@dataclass
class MutuResult:
    raw: str
    jenis: str  # "fc" | "K" | "WF" | "pipa" | "polos"
    nilai: float | None = None
    dims: list[float] | None = None


def parse_mutu(s: str) -> MutuResult | None:
    raw = s.strip()

    m = _FC_PATTERN.match(raw)
    if m:
        return MutuResult(raw=raw, jenis="fc", nilai=float(m.group(1)))

    m = _K_PATTERN.match(raw)
    if m:
        return MutuResult(raw=raw, jenis="K", nilai=float(m.group(1)))

    m = _WF_PATTERN.match(raw)
    if m:
        return MutuResult(raw=raw, jenis="WF", dims=[float(m.group(i)) for i in range(1, 5)])

    m = _PIPA_PATTERN.match(raw)
    if m:
        return MutuResult(raw=raw, jenis="pipa", dims=[float(m.group(1)), float(m.group(2))])

    m = _POLOS_PATTERN.match(raw)
    if m:
        return MutuResult(raw=raw, jenis="polos", dims=[float(m.group(1))])

    return None
