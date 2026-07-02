"""
PAAX Core Engine — Registry parameter takeoff arsitektur/tanah (INV-Z, brain
TXT02 §Z). Lanjutan dari `app/tkg/params.py` (yang memuat param beton/besi).

Prinsip (sama dgn tkg/params.py): tidak ada nilai di-hardcode diam-diam di
jalur hitung. Semua ambang & faktor bernama di sini, bisa dioverride per
request, dan SETIAP parameter yang benar-benar terpakai dicatat kembali di
keluaran (params_used/assumptions) supaya auditable (RULE-BOE, AP-15).

Default diberi sumber pada komentar. Faktor tanah (f_gembur/f_susut) &
ruang kerja (w_kerja) memakai default standar praktik + WAJIB dicatat sebagai
assumption tiap terpakai karena memengaruhi volume — pengguna dianjurkan
mengoverride sesuai jenis tanah/metode nyata.
"""
from __future__ import annotations
from typing import Literal

from pydantic import BaseModel, Field


class TanahParams(BaseModel):
    """§F — pekerjaan tanah (bank/gembur/padat) + angkut."""
    w_kerja: float = 0.30
    # F-F01: ruang kerja galian tiap sisi (m). Default 0,30 m praktik umum;
    # override per metode/kedalaman. Memengaruhi volume -> dicatat assumption.
    f_gembur: float = 1.20
    # V_gembur = V_bank * f_gembur (>1). Default 1,20 tanah biasa (standar
    # tanah). Untuk angkutan buangan (loose).
    f_susut: float = 1.10
    # V_bank_dibutuhkan = V_padat * f_susut (>1). Default 1,10 (padat->bank).
    # Untuk kebutuhan material urugan yang dipadatkan.
    kap_truk: float = 4.0
    # F-F07: kapasitas bak truk (m3 gembur) untuk hitung ritase. Default 4 m3
    # (dump truck kecil). Override sesuai alat.
    jarak_dekat_max_km: float = 5.0
    jarak_sedang_max_km: float = 15.0
    # F-F06/F-F07: boundary kelas jarak angkut untuk memilih varian AHSP.


class DindingParams(BaseModel):
    """§E — dinding, plester, acian, cat, screed."""
    deduct_mode: Literal["all", "threshold"] = "all"
    # F-E01: "all" kurangi SEMUA bukaan (default konservatif) |
    # "threshold" bukaan < deduct_threshold TIDAK dikurangi (hanya bila
    # spek/kesepakatan — RULE-READ-02/INV-08).
    deduct_threshold: float = 0.0
    # Ambang luas bukaan (m2) yang tidak dikurangi saat mode "threshold".
    n_lapis_cat: int = 1
    # F-E05: jumlah lapis cat BILA AHSP dihitung per-lapis. Default 1
    # (AHSP per-m2 sudah termasuk seluruh lapis -> jangan dikali lagi).
    L_maks_praktis: float = 4.0
    A_maks_praktis: float = 12.0
    # F-E06: trigger review kolom/ring praktis; jumlah/detail tetap butuh keputusan.


class ArsitekturParams(BaseModel):
    """§G subset — pondasi batu belah, penutup lantai/plin, atap miring."""
    h_pasang_keramik: float = 1.5
    # F-G04: default tinggi pasang area basah; catat assumption bila dipakai.
    h_upstand: float = 0.2
    # F-G10: default upstand waterproofing; catat assumption bila dipakai.
    model_config = {"extra": "forbid"}


class BajaParams(BaseModel):
    """§G06/G14 — baja profil dan pengecatan baja."""
    W_baja_waste: float = 0.05
    gamma_s: float = 7850.0


class AtapParams(BaseModel):
    """§G07/G08 — atap detail dan drainase hujan."""
    A_per_downpipe: float = 50.0


class MepParams(BaseModel):
    """§G13 — fallback pipa MEP berbasis fixture."""
    L_pipa_per_fixture: float | None = None
