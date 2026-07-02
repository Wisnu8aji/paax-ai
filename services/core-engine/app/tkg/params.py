"""
PAAX Core Engine — Registry parameter TKG/takeoff (INV-Z, brain TXT02 §Z).

Tidak ada nilai yang di-hardcode diam-diam di jalur hitung: semua ambang &
faktor bernama di sini, bisa dioverride per request, dan SETIAP parameter yang
benar-benar terpakai dicatat kembali di keluaran (assumptions/params_used)
supaya auditable (RULE-BOE). Default diberi sumber pada komentar.
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class TakeoffParams(BaseModel):
    # Geometri & konvensi
    tinggi_per_lantai_m: Optional[float] = None
    # Tinggi kolom per lantai (m). TIDAK berdefault — kalau tak disetor dan
    # record tak punya dimensi 'tinggi', item kolom jadi needs_review
    # (dilarang mengarang angka struktural).
    beam_len_mode: str = "as_as"
    # F-B05: "as_as" (panjang antar as, default konvensi QS) | "bersih".
    # Mode "bersih" butuh lebar tumpuan — belum didukung irisan ini.

    # Pembesian (sumber: SNI 2847 utk k_hook; gamma_s konstanta fisika SNI)
    selimut_beton_m: float = 0.04
    # c = selimut beton (m). Default 40 mm praktik umum balok/kolom dicor
    # dengan acuan; WAJIB dioverride bila gambar/spek menyebut lain.
    k_hook_sengkang: float = 6.0
    # F-D03: panjang kait sengkang = k_hook_s x d. SNI 2847 kait 135° = 6db.
    zona_tumpuan_fraksi: float = 0.25
    # F-D03 zona: bila sengkang tumpuan & lapangan beda jarak tapi panjang zona
    # tidak tertulis, konvensi: tumpuan = L/4 tiap ujung, lapangan = L/2.
    # Terpakai -> dicatat sebagai assumption.
    waste_besi: float = 0.0
    # F-D06 mode "param": f_waste = 1 + waste_besi. Default 0 (tanpa waste)
    # supaya angka murni geometri; kebijakan waste = keputusan pengguna.

    # Bekisting
    t_pelat_default_m: Optional[float] = None
    # F-C04 (balok penopang pelat): butuh t pelat. Tak disetor -> pakai rumus
    # balok tanpa pelat (b + 2h) dan dicatat sebagai assumption.

    # Validasi grid
    tol_grid: float = 0.005
    # V-02: toleransi relatif |Σ bentang - total| / total. Default 0.5%.


class ParamUsed(BaseModel):
    nama: str
    nilai: float | str
    catatan: str
