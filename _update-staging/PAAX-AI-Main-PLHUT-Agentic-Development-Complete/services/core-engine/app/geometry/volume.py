"""
PAAX Core Engine — Kalkulator Volume/Luas elemen konstruksi (deterministik).

Tiap elemen punya rumus eksak. AI (lapis persepsi) menyetor `element_type` +
`dims`; fungsi ini mengembalikan volume/luas + jejak rumus untuk audit.

Satuan dimensi diasumsikan meter. `jumlah` default 1, `bukaan`/`sisi` punya
default wajar. Nilai dibulatkan 4 desimal (deterministik).

Take-off beton (kolom_bundar, kolom_praktis, pondasi_telapak_miring,
dinding_beton, tangga_detail) + opsi Lk/deduksi bukaan pada kolom & plat
mengikuti F-B01-B11 di `docs/specs/brain-v4.1/PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt`.
Tipe lama (kolom/plat/tangga) TIDAK berubah perilaku bila dim baru (opsional)
tidak disetor — lihat komentar per fungsi.
"""
from __future__ import annotations
import math
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
    # F-B01: V = lebar x tebal x Lk x jumlah ; Lk = tinggi - tebal_balok
    # (tebal_balok opsional, default 0 -> Lk = tinggi -> perilaku lama tidak berubah)
    n = _g(dims, "jumlah", 1)
    lebar, tebal, tinggi = _g(dims, "lebar"), _g(dims, "tebal"), _g(dims, "tinggi")
    tebal_balok = _g(dims, "tebal_balok", 0)
    lk = tinggi - tebal_balok
    vol = lebar * tebal * lk * n
    inputs = {"lebar": lebar, "tebal": tebal, "tinggi": tinggi, "jumlah": n, "tebal_balok": tebal_balok}
    formula = "lebar x tebal x Lk x jumlah ; Lk = tinggi - tebal_balok"
    detail = f"{lebar:g} x {tebal:g} x ({tinggi:g} - {tebal_balok:g}) x {n:g} = {_r4(vol):g} m3"
    return _r4(vol), "m3", formula, detail, inputs


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
    # F-B06: V = A_neto x t_pelat ; A_neto = panjang x lebar - luas_bukaan
    # (luas_bukaan opsional, default 0 -> perilaku lama tidak berubah)
    n = _g(dims, "jumlah", 1)
    p, l, t = _g(dims, "panjang"), _g(dims, "lebar"), _g(dims, "tebal")
    luas_bukaan = _g(dims, "luas_bukaan", 0)
    a_neto = p * l - luas_bukaan
    vol = a_neto * t * n
    return _r4(vol), "m3", "(panjang x lebar - luas_bukaan) x tebal x jumlah", \
        f"({p:g} x {l:g} - {luas_bukaan:g}) x {t:g} x {n:g} = {_r4(vol):g} m3", \
        {"panjang": p, "lebar": l, "tebal": t, "jumlah": n, "luas_bukaan": luas_bukaan}


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


def _kolom_bundar(dims) -> Computation:
    # F-B02: V = (pi/4) x D^2 x Lk x jumlah ; Lk = tinggi - tebal_balok
    n = _g(dims, "jumlah", 1)
    d = _g(dims, "diameter")
    tinggi = _g(dims, "tinggi")
    tebal_balok = _g(dims, "tebal_balok", 0)
    lk = tinggi - tebal_balok
    vol = (math.pi / 4) * d ** 2 * lk * n
    inputs = {"diameter": d, "tinggi": tinggi, "jumlah": n, "tebal_balok": tebal_balok}
    detail = f"(pi/4) x {d:g}^2 x ({tinggi:g} - {tebal_balok:g}) x {n:g} = {_r4(vol):g} m3"
    return _r4(vol), "m3", "(pi/4) x diameter^2 x Lk x jumlah ; Lk = tinggi - tebal_balok", detail, inputs


def _kolom_praktis(dims) -> Computation:
    # F-B03: V = lebar_kp x tebal_kp x panjang_kp x jumlah (box sederhana)
    return _vol_box(dims, "lebar", "tebal", "panjang", "lebar", "tebal", "panjang")


def _pondasi_telapak_miring(dims) -> Computation:
    # F-B07 (miring/frustum): V = (tinggi/3) x (A_bwh + A_atas + sqrt(A_bwh*A_atas)) x jumlah
    n = _g(dims, "jumlah", 1)
    p_bwh, l_bwh = _g(dims, "panjang_bawah"), _g(dims, "lebar_bawah")
    p_atas, l_atas = _g(dims, "panjang_atas"), _g(dims, "lebar_atas")
    tinggi = _g(dims, "tinggi")
    a_bwh, a_atas = p_bwh * l_bwh, p_atas * l_atas
    vol = (tinggi / 3) * (a_bwh + a_atas + math.sqrt(a_bwh * a_atas)) * n
    inputs = {
        "panjang_bawah": p_bwh, "lebar_bawah": l_bwh,
        "panjang_atas": p_atas, "lebar_atas": l_atas,
        "tinggi": tinggi, "jumlah": n,
    }
    formula = "(tinggi/3) x (A_bwh + A_atas + sqrt(A_bwh x A_atas)) x jumlah"
    detail = f"({tinggi:g}/3) x ({a_bwh:g} + {a_atas:g} + sqrt({a_bwh:g} x {a_atas:g})) x {n:g} = {_r4(vol):g} m3"
    return _r4(vol), "m3", formula, detail, inputs


def _dinding_beton(dims) -> Computation:
    # F-B08: V = tebal x tinggi x panjang x jumlah - volume_bukaan
    n = _g(dims, "jumlah", 1)
    tebal, tinggi, panjang = _g(dims, "tebal"), _g(dims, "tinggi"), _g(dims, "panjang")
    volume_bukaan = _g(dims, "volume_bukaan", 0)
    vol = tebal * tinggi * panjang * n - volume_bukaan
    inputs = {"tebal": tebal, "tinggi": tinggi, "panjang": panjang, "jumlah": n, "volume_bukaan": volume_bukaan}
    formula = "tebal x tinggi x panjang x jumlah - volume_bukaan"
    detail = f"{tebal:g} x {tinggi:g} x {panjang:g} x {n:g} - {volume_bukaan:g} = {_r4(vol):g} m3"
    return _r4(vol), "m3", formula, detail, inputs


def _tangga_detail(dims) -> Computation:
    # F-B11: V = V_pelat_miring + V_anak + V_bordes
    # alpha = atan(optrede/antrede) ; V_pelat_miring = tebal_pelat*lebar*(panjang_datar/cos(alpha))
    # V_anak = 0.5*optrede*antrede*lebar*jumlah_anak ; V_bordes = tebal_bordes*luas_bordes
    n = _g(dims, "jumlah", 1)
    tebal_pelat = _g(dims, "tebal_pelat")
    lebar = _g(dims, "lebar")
    panjang_datar = _g(dims, "panjang_datar")
    optrede = _g(dims, "optrede")
    antrede = _g(dims, "antrede")
    jumlah_anak = _g(dims, "jumlah_anak")
    tebal_bordes = _g(dims, "tebal_bordes", 0)
    luas_bordes = _g(dims, "luas_bordes", 0)

    alpha = math.atan(optrede / antrede)
    v_pelat_miring = tebal_pelat * lebar * (panjang_datar / math.cos(alpha))
    v_anak = 0.5 * optrede * antrede * lebar * jumlah_anak
    v_bordes = tebal_bordes * luas_bordes
    vol = (v_pelat_miring + v_anak + v_bordes) * n

    inputs = {
        "tebal_pelat": tebal_pelat, "lebar": lebar, "panjang_datar": panjang_datar,
        "optrede": optrede, "antrede": antrede, "jumlah_anak": jumlah_anak,
        "tebal_bordes": tebal_bordes, "luas_bordes": luas_bordes, "jumlah": n,
    }
    formula = "(V_pelat_miring + V_anak + V_bordes) x jumlah ; alpha = atan(optrede/antrede)"
    detail = (
        f"pelat_miring={_r4(v_pelat_miring):g} + anak={_r4(v_anak):g} "
        f"+ bordes={_r4(v_bordes):g} (x{n:g}) = {_r4(vol):g} m3"
    )
    return _r4(vol), "m3", formula, detail, inputs


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
    "kolom_bundar": _kolom_bundar,
    "kolom_praktis": _kolom_praktis,
    "pondasi_telapak_miring": _pondasi_telapak_miring,
    "dinding_beton": _dinding_beton,
    "tangga_detail": _tangga_detail,
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
