"""
PAAX Core Engine — Take-off SMKK / Keselamatan Konstruksi (deterministik).

Struktur item mengikuti komponen penerapan SMKK pada Permen PUPR No. 10/2021
(9 komponen biaya penerapan SMKK) sebagaimana terpakai di RAB pemerintah —
diverifikasi terhadap RAB nyata PLHUT Kankemenag Surakarta 2024 (bagian
"SISTEM MANAJEMEN KESELAMATAN KONSTRUKSI"):
  SMKK-01 Penyiapan dokumen RKK           -> 1 set
  SMKK-02 Sosialisasi/promosi/pelatihan   -> org (per pekerja) + spanduk/papan
  SMKK-03 APK & APD                       -> per pekerja (helm/sepatu/rompi/
                                             sarung tangan) + safety net m2
  SMKK-04 Asuransi & perizinan            -> ls (premi = urusan harga, bukan
                                             kuantitas — Aturan Emas)
  SMKK-05 Personel keselamatan konstruksi -> OB = petugas x durasi bulan
  SMKK-06 Fasilitas/sarana kesehatan      -> set P3K
  SMKK-07 Rambu-rambu                     -> bh (rambu, traffic cone)
  SMKK-08 Konsultasi/ahli terkait         -> (belum dimodelkan; masuk 09 bila ls)
  SMKK-09 Kegiatan pengendalian risiko    -> ls

Semua kuantitas datang dari input eksplisit; konvensi (mis. APD 1 unit per
pekerja) dicatat sebagai assumption (RULE-BOE). Input tak masuk akal ditolak
oleh validator (bukan menghasilkan angka diam-diam).
"""
from typing import Dict, List

from pydantic import BaseModel, model_validator

from ..tkg.params import ParamUsed
from .models import ManualTakeoffResult, TakeoffLine


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


class SmkkRequest(BaseModel):
    duration_months: float
    num_workers: int
    num_k3_officers: int = 1
    safety_net_m2: float = 0.0            # APK: jaring pengaman (0 = tidak ada)
    spanduk_count: int = 1
    papan_info_count: int = 1
    p3k_set_count: int = 1                # SMKK-06 fasilitas kesehatan
    rambu_count: int = 0                  # SMKK-07 rambu peringatan (0 = tidak diemit)
    traffic_cone_count: int = 0           # SMKK-07 kerucut lalu lintas
    include_pengendalian_risiko: bool = True   # SMKK-09 (1 ls) — lazim di RAB pemerintah
    include_masker: bool = False
    # Masker TIDAK ada di RAB PLHUT acuan; bila proyek mensyaratkan, aktifkan
    # -> kuantitas box = pekerja x bulan (assumption tercatat).

    @model_validator(mode="after")
    def _validasi(self) -> "SmkkRequest":
        if self.duration_months <= 0:
            raise ValueError("duration_months harus > 0 (durasi proyek dalam bulan)")
        if self.num_workers <= 0:
            raise ValueError("num_workers harus > 0")
        if self.num_k3_officers < 0:
            raise ValueError("num_k3_officers tidak boleh negatif")
        return self


def takeoff_smkk(req: SmkkRequest) -> ManualTakeoffResult:
    items: List[TakeoffLine] = []
    assumptions: List[str] = []
    params_used: Dict[str, ParamUsed] = {}

    # SMKK-01 — dokumen RKK (manual, prosedur, instruksi kerja, ijin kerja)
    items.append(TakeoffLine(
        kode="SMKK-DOK", work="dokumen_rkk", quantity=1.0, unit="set",
        formula="1 set dokumen penerapan SMKK per proyek",
        detail="Manual, prosedur, instruksi kerja, ijin kerja = 1 set",
        rule_id="SMKK-01",
    ))

    # SMKK-02 — sosialisasi, promosi, pelatihan
    items.append(TakeoffLine(
        kode="SMKK-SOSIALISASI", work="pelatihan_k3", quantity=float(req.num_workers),
        unit="org",
        formula="pengarahan/pelatihan/simulasi = jumlah pekerja",
        detail=f"{req.num_workers} org", rule_id="SMKK-02",
    ))
    items.append(TakeoffLine(
        kode="SMKK-SPANDUK", work="spanduk_k3", quantity=float(req.spanduk_count), unit="lb",
        formula="jumlah spanduk (banner)", detail=f"{req.spanduk_count} lembar",
        rule_id="SMKK-02",
    ))
    items.append(TakeoffLine(
        kode="SMKK-PAPAN", work="papan_informasi_k3", quantity=float(req.papan_info_count),
        unit="bh", formula="jumlah papan informasi K3",
        detail=f"{req.papan_info_count} buah", rule_id="SMKK-02",
    ))

    # SMKK-03 — APD per pekerja (+ APK jaring pengaman)
    apd_list = [
        ("Topi Pelindung (Safety Helmet)", "helm", "bh"),
        ("Sepatu Keselamatan (Safety Shoes)", "sepatu", "psg"),
        ("Rompi Keselamatan (Safety Vest)", "rompi", "bh"),
        ("Sarung Tangan (Safety Gloves)", "sarung_tangan", "psg"),
    ]
    for _nama, kode_apd, unit in apd_list:
        items.append(TakeoffLine(
            kode=f"SMKK-APD-{kode_apd.upper()}", work=f"apd_{kode_apd}",
            quantity=float(req.num_workers), unit=unit,
            formula="1 unit per pekerja",
            detail=f"{req.num_workers} pekerja x 1 = {req.num_workers} {unit}",
            rule_id="SMKK-03",
        ))
    assumptions.append(
        "APD dihitung 1 unit per pekerja untuk seluruh durasi proyek (konvensi RAB "
        "SMKK; sesuaikan bila kebijakan penggantian berkala berbeda) — SMKK-03")

    if req.include_masker:
        q = req.num_workers * req.duration_months
        items.append(TakeoffLine(
            kode="SMKK-APD-MASKER", work="apd_masker", quantity=_r4(q), unit="box",
            formula="jumlah pekerja x durasi bulan",
            detail=f"{req.num_workers} x {req.duration_months:g} = {_r4(q):g} box",
            rule_id="SMKK-03",
        ))
        assumptions.append(
            "Masker dihitung 1 box per pekerja per bulan (konvensi habis-pakai; "
            "tidak ada di RAB acuan PLHUT — aktif karena include_masker) — SMKK-03")

    if req.safety_net_m2 > 0:
        items.append(TakeoffLine(
            kode="SMKK-APK-NET", work="safety_net", quantity=_r4(req.safety_net_m2),
            unit="m2", formula="luas jaring pengaman terpasang",
            detail=f"{req.safety_net_m2:g} m2", rule_id="SMKK-03",
        ))

    # SMKK-04 — asuransi (kuantitas ls; besaran premi = domain harga, bukan volume)
    items.append(TakeoffLine(
        kode="SMKK-ASURANSI", work="asuransi_konstruksi", quantity=1.0, unit="ls",
        formula="1 ls per proyek",
        detail="Asuransi keselamatan kerja (BPJS ketenagakerjaan dkk) = 1 ls",
        rule_id="SMKK-04",
    ))
    assumptions.append(
        "Asuransi dinyatakan 1 ls — besaran premi (umumnya % nilai kontrak / per "
        "pekerja) ditetapkan di tahap harga, bukan kuantitas (Aturan Emas) — SMKK-04")

    # SMKK-05 — personel K3: OB = petugas x durasi (bug lama: tidak dikali durasi)
    if req.num_k3_officers > 0:
        ob = req.num_k3_officers * req.duration_months
        items.append(TakeoffLine(
            kode="SMKK-PERSONIL", work="petugas_k3", quantity=_r4(ob), unit="OB",
            formula="jumlah petugas x durasi bulan",
            detail=f"{req.num_k3_officers} petugas x {req.duration_months:g} bulan = {_r4(ob):g} OB",
            rule_id="SMKK-05",
        ))

    # SMKK-06 — fasilitas kesehatan
    if req.p3k_set_count > 0:
        items.append(TakeoffLine(
            kode="SMKK-P3K", work="peralatan_p3k", quantity=float(req.p3k_set_count),
            unit="set", formula="jumlah set P3K",
            detail=f"{req.p3k_set_count} set", rule_id="SMKK-06",
        ))

    # SMKK-07 — rambu-rambu keselamatan
    if req.rambu_count > 0:
        items.append(TakeoffLine(
            kode="SMKK-RAMBU", work="rambu_peringatan", quantity=float(req.rambu_count),
            unit="bh", formula="jumlah rambu peringatan",
            detail=f"{req.rambu_count} buah", rule_id="SMKK-07",
        ))
    if req.traffic_cone_count > 0:
        items.append(TakeoffLine(
            kode="SMKK-CONE", work="traffic_cone", quantity=float(req.traffic_cone_count),
            unit="bh", formula="jumlah kerucut lalu lintas",
            detail=f"{req.traffic_cone_count} buah", rule_id="SMKK-07",
        ))

    # SMKK-09 — kegiatan & peralatan pengendalian risiko keselamatan
    if req.include_pengendalian_risiko:
        items.append(TakeoffLine(
            kode="SMKK-RISIKO", work="pengendalian_risiko_k3", quantity=1.0, unit="ls",
            formula="1 ls per proyek",
            detail="Kegiatan & peralatan pengendalian risiko keselamatan = 1 ls",
            rule_id="SMKK-09",
        ))

    return ManualTakeoffResult(
        domain="smkk",
        items=items,
        assumptions=assumptions,
        warnings=[],
        params_used=list(params_used.values()),
        n_needs_review=sum(1 for i in items if i.needs_review),
    )
