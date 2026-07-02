"""
PAAX Core Engine — Registry parameter TKG/takeoff (INV-Z, brain TXT02 §Z).

Tidak ada nilai yang di-hardcode diam-diam di jalur hitung: semua ambang &
faktor bernama di sini, bisa dioverride per request, dan SETIAP parameter yang
benar-benar terpakai dicatat kembali di keluaran (assumptions/params_used)
supaya auditable (RULE-BOE). Default diberi sumber pada komentar.
"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, model_validator


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
    k_hook_utama: Optional[float] = None
    # F-D02: kait tulangan pokok = k_hook_utama x d per ujung (2 ujung/batang).
    # SNI 2847 kait standar 90° umum 12db — TIDAK berdefault karena keputusan
    # detailing (tidak semua batang berkait). None = kait tidak dihitung,
    # tercatat sebagai assumption.
    n_ld: Optional[float] = None
    # F-D02/F-D04: panjang lewatan/penyaluran = n_ld x d (SNI 2847; lap tarik
    # kelas B umum 40-50d). None = lewatan tidak dihitung (assumption); bila
    # lewatan DIBUTUHKAN (batang > l_stock_m) tapi n_ld None -> needs_review.
    l_stock_m: Optional[float] = None
    # F-D02/F-D08: panjang stok batang besi di pasar (umum 12 m). Dipakai untuk
    # jumlah lap = ceil(L_bat / l_stock_m) - 1 dan untuk BBS mode "bbs".
    zona_tumpuan_fraksi: float = 0.25
    # F-D03 zona: bila sengkang tumpuan & lapangan beda jarak tapi panjang zona
    # tidak tertulis, konvensi: tumpuan = L/4 tiap ujung, lapangan = L/2.
    # Terpakai -> dicatat sebagai assumption.
    waste_mode: Literal["param", "bbs"] = "param"
    # F-D06: "param" -> f_waste = 1 + waste_besi ; "bbs" -> f_waste = 1 dan
    # waste NYATA dihitung dari potongan stok (F-D08). JANGAN keduanya (AP-16).
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

    @model_validator(mode="after")
    def _gerbang_waste(self) -> "TakeoffParams":
        # AP-16: waste param + waste BBS tidak boleh dihitung dua-duanya.
        if self.waste_mode == "bbs":
            if self.waste_besi > 0:
                raise ValueError(
                    "AP-16: waste_mode='bbs' menghitung waste nyata dari potongan — "
                    "waste_besi harus 0 (jangan dobel waste)")
            if self.l_stock_m is None:
                raise ValueError("waste_mode='bbs' butuh l_stock_m (panjang stok batang)")
        return self


class ParamUsed(BaseModel):
    nama: str
    nilai: float | str
    catatan: str
