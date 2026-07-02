"""
PAAX Core Engine — Model I/O takeoff arsitektur/tanah (brain TXT02 §E/§F/§G).

Berbeda dari `app/tkg/takeoff.py` (digerakkan JOIN TKG ElementInstance x
TypeRecord untuk elemen STRUKTUR beton), modul `app/takeoff/*` menghitung
pekerjaan berbasis LUAS/PANJANG denah (tanah, dinding, finishing, atap) dari
input geometrik eksplisit. Ini fondasi deterministik yang nanti disuapi oleh
form manual UI atau ekspansi TKG "bidang".

INV: quantity=None berarti butuh data/review — TIDAK ditebak (AP-E-04).
Paritas Zod ada di packages/schemas (blok Manual Takeoff).
"""
from __future__ import annotations
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from ..tkg.params import ParamUsed
from .params import ArsitekturParams, DindingParams, TanahParams


# ─── Hasil umum ───────────────────────────────────────────────────────────────

class TakeoffLine(BaseModel):
    kode: str
    work: str                              # mis. "galian_footplat", "pasangan_dinding"
    quantity: Optional[float] = None       # None = butuh data/review; TIDAK ditebak
    unit: str
    formula: str
    detail: str
    needs_review: bool = False
    review_reason: Optional[str] = None
    rule_id: str                           # jejak rumus, mis. "F-F01", "F-E01"


class ManualTakeoffResult(BaseModel):
    domain: Literal["tanah", "dinding", "arsitektur"]
    items: List[TakeoffLine] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    params_used: List[ParamUsed] = Field(default_factory=list)
    n_needs_review: int = 0


# ─── §F Tanah — request ───────────────────────────────────────────────────────

class GalianFootplat(BaseModel):
    kode: str
    b_ft: float                            # lebar footplat (m)
    l_ft: float                            # panjang footplat (m)
    d_gali: float                          # kedalaman galian (m)
    n: int = 1
    v_struktur_tertanam_per_lubang: Optional[float] = None
    # Volume struktur terpendam di bawah muka tanah per lubang (m3): footplat +
    # kolom pedestal + bagian sloof. Untuk urugan kembali (F-F03) & buangan.


class GalianMenerus(BaseModel):
    kode: str
    l_parit: float                         # panjang parit (m)
    b_bawah: float                         # lebar dasar galian (m)
    b_atas: Optional[float] = None         # lebar atas (m); None -> tegak (= b_bawah)
    d_gali: float                          # kedalaman (m)


class UruganLapis(BaseModel):
    kode: str
    jenis: Literal["pasir", "sirtu", "tanah"]
    a: float                               # luas bidang (m2)
    t_lapis: float                         # tebal padat (m)
    material_sudah_padat: bool = False
    # True: koefisien bahan AHSP SUDAH memuat faktor padat (F-F05) -> kebutuhan
    # material = V_padat (JANGAN dikali f_susut lagi; AP anti-dobel).


class TanahRequest(BaseModel):
    footplats: List[GalianFootplat] = Field(default_factory=list)
    galian_menerus: List[GalianMenerus] = Field(default_factory=list)
    urugan: List[UruganLapis] = Field(default_factory=list)
    params: TanahParams = Field(default_factory=TanahParams)


# ─── §E Dinding & finishing — request ─────────────────────────────────────────

class Bukaan(BaseModel):
    nama: str
    lebar: float
    tinggi: float
    n: int = 1


class DindingBidang(BaseModel):
    kode: str
    l_dinding: float                       # panjang (m)
    h_dinding: float                       # tinggi (m)
    bukaan: List[Bukaan] = Field(default_factory=list)
    plester_sisi: int = 0                  # 0 tidak diplester | 1 satu sisi | 2 dua sisi
    acian: bool = False                    # acian mengikuti luas plester (butuh plester)
    cat: bool = False                      # cat mengikuti luas plester, atau dinding bila tanpa plester


class ScreedBidang(BaseModel):
    kode: str
    a: float                               # luas lantai (m2)
    t: float                               # tebal screed (m)


class DindingRequest(BaseModel):
    dinding: List[DindingBidang] = Field(default_factory=list)
    screed: List[ScreedBidang] = Field(default_factory=list)
    params: DindingParams = Field(default_factory=DindingParams)


# ─── §G subset — request ──────────────────────────────────────────────────────

class PondasiBatu(BaseModel):
    kode: str
    a_atas: float                          # lebar atas trapesium (m)
    a_bawah: float                         # lebar bawah (m)
    h_pond: float                          # tinggi pondasi (m)
    l: float                               # panjang menerus (m)


class PenutupLantai(BaseModel):
    kode: str
    panjang: float                         # m
    lebar: float                           # m
    lebar_pintu_total: float = 0.0         # Σ lebar ambang pintu (m) untuk plin
    plin: bool = True


class AtapMiring(BaseModel):
    kode: str
    a_proyeksi: float                      # luas proyeksi horizontal (m2)
    theta_deg: float                       # sudut kemiringan atap (derajat)


class ArsitekturRequest(BaseModel):
    pondasi_batu: List[PondasiBatu] = Field(default_factory=list)
    lantai: List[PenutupLantai] = Field(default_factory=list)
    atap: List[AtapMiring] = Field(default_factory=list)
    params: ArsitekturParams = Field(default_factory=ArsitekturParams)
