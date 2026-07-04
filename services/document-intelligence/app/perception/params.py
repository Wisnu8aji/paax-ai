"""
PAAX Document Intelligence — Registry parameter grammar/persepsi (Fase 2 P2).

Tidak ada nilai yang di-hardcode diam-diam di dalam fungsi grammar; semua
ambang bernama di sini (selaras pola `core-engine/app/tkg/params.py`).
Rentang dalam mm, sumber: praktik umum SNI/QS beton bertulang & baja profil.
"""
from __future__ import annotations

DIMS_RANGE: dict[str, tuple[float, float]] = {
    "kolom": (150.0, 1500.0),
    "balok": (150.0, 1200.0),
    "latei": (80.0, 300.0),
    "plat_t": (80.0, 300.0),
    "besi_d": (6.0, 32.0),
    "besi_s": (50.0, 400.0),
    "bentang_as": (1000.0, 12000.0),
}

EVAL_TKG_GRAMMAR_MIN = 0.85
