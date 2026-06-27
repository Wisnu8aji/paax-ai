"""
PAAX Core Engine — Pembangun Kurva S (deterministik).

Dari RAB (bobot tiap item) + durasi tiap item, bangun rencana progres kumulatif.
- mode "sequential": tiap item mulai setelah item sebelumnya selesai (baseline sederhana).
- mode "parallel":   semua item mulai di hari ke-0.
Bobot tiap item didistribusikan merata sepanjang durasinya, lalu diakumulasi per periode.
"""
from __future__ import annotations
from typing import List
import math

from .models import RABResult, RABLineInput, SCurvePoint, SCurveResult


def build_s_curve(
    rab: RABResult,
    lines_input: List[RABLineInput],
    period_days: int = 7,
    mode: str = "sequential",
    default_duration: int = 1,
) -> SCurveResult:
    """Bangun Kurva S rencana. Urutan lines_input harus sama dengan rab.lines."""
    if mode not in ("sequential", "parallel"):
        raise ValueError("mode harus 'sequential' atau 'parallel'")

    weights = [ln.weight_pct for ln in rab.lines]
    durations = [
        (li.duration_days if li.duration_days and li.duration_days > 0 else default_duration)
        for li in lines_input
    ]

    # Tentukan hari mulai tiap item
    starts: List[int] = []
    if mode == "sequential":
        cursor = 0
        for d in durations:
            starts.append(cursor)
            cursor += d
        total_days = cursor
    else:  # parallel
        starts = [0] * len(durations)
        total_days = max(durations) if durations else 0

    if total_days <= 0:
        return SCurveResult(total_days=0, period_days=period_days, mode=mode, points=[])

    # Bobot per hari untuk tiap item, lalu jumlahkan ke array harian
    daily = [0.0] * total_days
    for w, d, s in zip(weights, durations, starts):
        per_day = w / d
        for day in range(s, s + d):
            daily[day] += per_day

    # Kelompokkan ke periode (mis. mingguan) + akumulasi
    n_periods = math.ceil(total_days / period_days)
    points: List[SCurvePoint] = []
    cumulative = 0.0
    for p in range(n_periods):
        d0 = p * period_days
        d1 = min(d0 + period_days, total_days)
        planned = sum(daily[d0:d1])
        cumulative += planned
        points.append(SCurvePoint(
            period=p + 1,
            day_start=d0 + 1,
            day_end=d1,
            planned_pct=round(planned, 4),
            cumulative_pct=round(cumulative, 4),
        ))

    # Koreksi pembulatan: pastikan titik akhir = 100.0 jika bobot ~100
    if points and abs(cumulative - 100.0) < 0.5:
        points[-1].cumulative_pct = 100.0

    return SCurveResult(
        total_days=total_days,
        period_days=period_days,
        mode=mode,
        points=points,
    )
