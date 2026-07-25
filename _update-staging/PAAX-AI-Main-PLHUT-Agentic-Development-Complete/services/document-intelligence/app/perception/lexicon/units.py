"""Inferensi satuan mm/cm (brain-00 §2.7) — dipilih dari RENTANG WAJAR, bukan diasumsikan."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UnitInferenceResult:
    satuan: str | None  # "mm" | "cm" | None (None -> W-UNIT + needs_review)
    needs_review: bool
    assumption: str | None


def infer_unit(values: tuple[float, ...], kategori: str, dims_range: dict[str, tuple[float, float]]) -> UnitInferenceResult:
    lo, hi = dims_range[kategori]

    def _wajar(factor: float) -> bool:
        return all(lo <= v * factor <= hi for v in values)

    mm_ok = _wajar(1.0)
    cm_ok = _wajar(10.0)

    if mm_ok and not cm_ok:
        return UnitInferenceResult(satuan="mm", needs_review=False, assumption=None)
    if cm_ok and not mm_ok:
        return UnitInferenceResult(
            satuan="cm", needs_review=False,
            assumption=f"nilai {values} di luar rentang wajar sbg mm untuk kategori '{kategori}' -> diasumsikan cm",
        )
    return UnitInferenceResult(satuan=None, needs_review=True, assumption=None)
