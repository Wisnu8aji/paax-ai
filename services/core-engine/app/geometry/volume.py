"""
PAAX Core Engine — Kalkulator Volume/Luas elemen konstruksi (deterministik).

Tiap elemen punya rumus eksak. AI (lapis persepsi) menyetor `element_type` +
`dims`; fungsi ini mengembalikan volume/luas + jejak rumus untuk audit.

Satuan dimensi diasumsikan meter. `jumlah` default 1, `bukaan`/`sisi` punya
default wajar. Nilai dibulatkan 4 desimal (deterministik).
"""
from __future__ import annotations
from typing import Callable, Dict, List, Tuple

from .models import VolumeResult, ElementSpec


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def _g(dims: Dict[str, float], key: str, default: float | None = None) -> float:
    v = dims.get(key, default)
    if v is None:
        raise KeyError(f"Dimensi '{key}' wajib untuk elemen ini.")
    return float(v)


# Tiap fungsi mengembalikan (volume, unit, formula, detail, inputs_efektif).
Computation = Tuple[float, str, str, str, Dict[str, float]]


def _vol_box(dims, a, b, c, label_a, label_b, label_c, unit="m3") -> Computation:
    n = _g(dims, "jumlah", 1)
    va, vb, vc = _g(dims, a), _g(dims, b), _g(dims, c)
    vol = va * vb * vc * n
    inputs = {label_a: va, label_b: vb, label_c: vc, "jumlah": n}
    formula = f"{label_a} x {label_b} x {label_c} x jumlah"
    detail = f"{va:g} x {vb:g} x {vc:g} x {n:g} = {_r4(vol):g} {unit}"
    return _r4(vol), unit, formula, detail, inputs


def _kolom(dims) -> Computation:
    return _vol_box(dims, "lebar", "tebal", "tinggi", "lebar", "tebal", "tinggi")


def _balok(dims) -> Computation:
    return _vol_box(dims, "lebar", "tinggi", "panjang", "lebar", "tinggi", "panjang")


def _pondasi_telapak(dims) -> Computation:
    return _vol_box(dims, "panjang", "lebar", "tinggi", "panjang", "lebar", "tinggi")


def _pondasi_menerus(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    l, t, p = _g(dims, "lebar"), _g(dims, "tinggi"), _g(dims, "panjang")
    vol = l * t * p * n
    return _r4(vol), "m3", "lebar x tinggi x panjang x jumlah", \
        f"{l:g} x {t:g} x {p:g} x {n:g} = {_r4(vol):g} m3", \
        {"lebar": l, "tinggi": t, "panjang": p, "jumlah": n}


def _plat(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    p, l, t = _g(dims, "panjang"), _g(dims, "lebar"), _g(dims, "tebal")
    vol = p * l * t * n
    return _r4(vol), "m3", "panjang x lebar x tebal x jumlah", \
        f"{p:g} x {l:g} x {t:g} x {n:g} = {_r4(vol):g} m3", \
        {"panjang": p, "lebar": l, "tebal": t, "jumlah": n}


def _dinding(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    bukaan = _g(dims, "bukaan", 0)
    p, t = _g(dims, "panjang"), _g(dims, "tinggi")
    area = p * t * n - bukaan
    return _r4(area), "m2", "(panjang x tinggi x jumlah) - bukaan", \
        f"({p:g} x {t:g} x {n:g}) - {bukaan:g} = {_r4(area):g} m2", \
        {"panjang": p, "tinggi": t, "jumlah": n, "bukaan": bukaan}


def _plesteran(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    sisi = _g(dims, "sisi", 2)            # plester umumnya 2 sisi dinding
    bukaan = _g(dims, "bukaan", 0)
    p, t = _g(dims, "panjang"), _g(dims, "tinggi")
    area = p * t * n * sisi - bukaan
    return _r4(area), "m2", "(panjang x tinggi x jumlah x sisi) - bukaan", \
        f"({p:g} x {t:g} x {n:g} x {sisi:g}) - {bukaan:g} = {_r4(area):g} m2", \
        {"panjang": p, "tinggi": t, "jumlah": n, "sisi": sisi, "bukaan": bukaan}


def _luas_pl(dims, unit="m2") -> Computation:
    n = _g(dims, "jumlah", 1)
    p, l = _g(dims, "panjang"), _g(dims, "lebar")
    area = p * l * n
    return _r4(area), unit, "panjang x lebar x jumlah", \
        f"{p:g} x {l:g} x {n:g} = {_r4(area):g} {unit}", \
        {"panjang": p, "lebar": l, "jumlah": n}


def _galian(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    p, l, d = _g(dims, "panjang"), _g(dims, "lebar"), _g(dims, "kedalaman")
    vol = p * l * d * n
    return _r4(vol), "m3", "panjang x lebar x kedalaman x jumlah", \
        f"{p:g} x {l:g} x {d:g} x {n:g} = {_r4(vol):g} m3", \
        {"panjang": p, "lebar": l, "kedalaman": d, "jumlah": n}


def _panjang(dims) -> Computation:
    n = _g(dims, "jumlah", 1)
    p = _g(dims, "panjang")
    val = p * n
    return _r4(val), "m", "panjang x jumlah", \
        f"{p:g} x {n:g} = {_r4(val):g} m", {"panjang": p, "jumlah": n}


_DISPATCH: Dict[str, Callable[[Dict[str, float]], Computation]] = {
    # Struktur (m3)
    "kolom": _kolom,
    "balok": _balok,
    "sloof": _balok,
    "ring_balok": _balok,
    "plat": _plat,
    "tangga": _plat,
    "pondasi_telapak": _pondasi_telapak,
    "pondasi_menerus": _pondasi_menerus,
    # Tanah (m3)
    "galian": _galian,
    "urugan": _galian,
    # Arsitektur (m2)
    "dinding": _dinding,
    "plesteran": _plesteran,
    "lantai": _luas_pl,
    "plafon": _luas_pl,
    "atap": _luas_pl,
    "cat": _dinding,
    # Linear (m)
    "bouwplank": _panjang,
    "drainase": _panjang,
    "pagar": _panjang,
}

ELEMENT_TYPES: List[str] = sorted(_DISPATCH.keys())


def compute_volume(element_type: str, dims: Dict[str, float]) -> VolumeResult:
    fn = _DISPATCH.get(element_type)
    if fn is None:
        raise KeyError(
            f"Tipe elemen '{element_type}' tidak dikenal. "
            f"Tersedia: {', '.join(ELEMENT_TYPES)}"
        )
    volume, unit, formula, detail, inputs = fn(dims)
    return VolumeResult(
        element_type=element_type, unit=unit, volume=volume,
        formula=formula, detail=detail, inputs=inputs,
    )
