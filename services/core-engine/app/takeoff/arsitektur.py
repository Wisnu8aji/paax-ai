"""
PAAX Core Engine — Take-off §G subset: pondasi batu belah, penutup lantai +
plin, atap miring (brain TXT02 §G, F-G01/F-G03/F-G05).

  F-G01 Pondasi batu belah menerus: V = A_trap * L ;
        A_trap = 0.5*(a_atas + a_bawah)*h_pond
  F-G03 Penutup lantai: A = A_ruang_neto ; PLIN: L = keliling - Σ lebar pintu
  F-G05 Atap miring: A_miring = A_proyeksi / cos(theta)

theta (sudut atap) & dimensi trapesium datang dari gambar (per-item) — bukan
default global (AP-E-04). theta >= 90 derajat -> tidak masuk akal -> review.
"""
from __future__ import annotations
import math
from typing import Dict, List

from ..tkg.params import ParamUsed
from .models import ArsitekturRequest, ManualTakeoffResult, TakeoffLine


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def takeoff_arsitektur(req: ArsitekturRequest) -> ManualTakeoffResult:
    items: List[TakeoffLine] = []
    assumptions: List[str] = []
    warnings: List[str] = []
    params_used: Dict[str, ParamUsed] = {}
    p = req.params

    def pakai(nama: str, nilai, catatan: str) -> None:
        if nama not in params_used:
            params_used[nama] = ParamUsed(nama=nama, nilai=nilai, catatan=catatan)

    # F-G01 pondasi batu belah menerus
    for pb in req.pondasi_batu:
        a_trap = 0.5 * (pb.a_atas + pb.a_bawah) * pb.h_pond
        v = a_trap * pb.l
        items.append(TakeoffLine(
            kode=pb.kode, work="pondasi_batu_belah", quantity=_r4(v), unit="m3",
            formula="A_trap x L ; A_trap = 0.5*(a_atas + a_bawah)*h_pond",
            detail=f"A_trap=0.5x({pb.a_atas:g}+{pb.a_bawah:g})x{pb.h_pond:g}={_r4(a_trap):g} m2; "
                   f"V={_r4(a_trap):g}x{pb.l:g}={_r4(v):g} m3",
            rule_id="F-G01",
        ))

    # F-G03 penutup lantai + plin
    for lt in req.lantai:
        a = lt.panjang * lt.lebar
        items.append(TakeoffLine(
            kode=lt.kode, work="penutup_lantai", quantity=_r4(a), unit="m2",
            formula="panjang x lebar (A_ruang_neto)",
            detail=f"{lt.panjang:g} x {lt.lebar:g} = {_r4(a):g} m2", rule_id="F-G03",
        ))
        if lt.plin:
            keliling = 2 * (lt.panjang + lt.lebar)
            l_plin = keliling - lt.lebar_pintu_total
            if l_plin < 0:
                warnings.append(
                    f"{lt.kode}: lebar pintu ({lt.lebar_pintu_total:g}) > keliling ({keliling:g}) — "
                    f"periksa input (F-K07)")
                l_plin = 0.0
            items.append(TakeoffLine(
                kode=lt.kode, work="plin_lantai", quantity=_r4(l_plin), unit="m",
                formula="keliling - Σ lebar_pintu ; keliling = 2*(p + l)",
                detail=f"2x({lt.panjang:g}+{lt.lebar:g}) - {lt.lebar_pintu_total:g} = {_r4(l_plin):g} m",
                rule_id="F-G03",
            ))

    # F-G05 atap miring
    for at in req.atap:
        if at.theta_deg < 0 or at.theta_deg >= 90:
            items.append(TakeoffLine(
                kode=at.kode, work="atap_miring", unit="m2",
                formula="A_proyeksi / cos(theta)", detail="-",
                needs_review=True,
                review_reason=f"theta={at.theta_deg:g} derajat di luar rentang wajar [0,90) — "
                              f"periksa potongan (F-G05)",
                rule_id="F-G05",
            ))
            continue
        cos_t = math.cos(math.radians(at.theta_deg))
        a_miring = at.a_proyeksi / cos_t
        items.append(TakeoffLine(
            kode=at.kode, work="atap_miring", quantity=_r4(a_miring), unit="m2",
            formula="A_proyeksi / cos(theta)",
            detail=f"{at.a_proyeksi:g} / cos({at.theta_deg:g}deg={cos_t:.6f}) = {_r4(a_miring):g} m2",
            rule_id="F-G05",
        ))

    # F-G02 aanstamping / batu kosong
    for aa in req.aanstamping:
        v = aa.a_bawah_m * aa.t_aanstamping_m * aa.panjang_m
        items.append(TakeoffLine(
            kode=aa.kode, work="aanstamping", quantity=_r4(v), unit="m3",
            formula="a_bawah x t_aanstamping x L",
            detail=f"{aa.a_bawah_m:g} x {aa.t_aanstamping_m:g} x {aa.panjang_m:g} = {_r4(v):g} m3",
            rule_id="F-G02",
        ))

    # F-G04 keramik dinding area basah
    for kd in req.keramik_dinding:
        h = kd.h_pasang_m
        if h is None:
            h = p.h_pasang_keramik
            pakai("h_pasang_keramik", h, "tinggi pasang keramik dinding basah")
            assumptions.append(
                f"{kd.kode}: h_pasang_keramik={h:g} m dari parameter karena item tidak menyetor tinggi (F-G04)"
            )
        a = kd.keliling_basah_m * h - kd.bukaan_m2
        if a < 0:
            warnings.append(f"{kd.kode}: bukaan lebih besar dari bidang keramik; quantity diset 0 (F-K07)")
            a = 0.0
        items.append(TakeoffLine(
            kode=kd.kode, work="keramik_dinding_basah", quantity=_r4(a), unit="m2",
            formula="K_basah x h_pasang - Σ bukaan",
            detail=f"{kd.keliling_basah_m:g} x {h:g} - {kd.bukaan_m2:g} = {_r4(a):g} m2",
            rule_id="F-G04",
        ))

    # F-G09 plafon + rangka + list
    for pl in req.plafon:
        items.append(TakeoffLine(
            kode=pl.kode, work="plafon", quantity=_r4(pl.a_neto_m2), unit="m2",
            formula="A = A_neto", detail=f"A_neto={pl.a_neto_m2:g} m2", rule_id="F-G09",
        ))
        items.append(TakeoffLine(
            kode=pl.kode, work="rangka_plafon", quantity=_r4(pl.a_neto_m2), unit="m2",
            formula="rangka = A_neto", detail=f"A_neto={pl.a_neto_m2:g} m2", rule_id="F-G09",
        ))
        items.append(TakeoffLine(
            kode=pl.kode, work="list_plafon", quantity=_r4(pl.keliling_tepi_m), unit="m",
            formula="Σ keliling tepi plafon", detail=f"{pl.keliling_tepi_m:g} m", rule_id="F-G09",
        ))

    # F-G10 waterproofing + upstand
    for wp in req.waterproofing:
        h = wp.h_upstand_m
        if h is None:
            h = p.h_upstand
            pakai("h_upstand", h, "tinggi upstand waterproofing")
            assumptions.append(
                f"{wp.kode}: h_upstand={h:g} m dari parameter karena item tidak menyetor tinggi upstand (F-G10)"
            )
        a = wp.a_bidang_m2 + wp.keliling_upstand_m * h
        items.append(TakeoffLine(
            kode=wp.kode, work="waterproofing", quantity=_r4(a), unit="m2",
            formula="A_bidang + K_upstand x h_upstand",
            detail=f"{wp.a_bidang_m2:g} + {wp.keliling_upstand_m:g} x {h:g} = {_r4(a):g} m2",
            rule_id="F-G10",
        ))

    n_review = sum(1 for i in items if i.needs_review)
    return ManualTakeoffResult(
        domain="arsitektur", items=items, assumptions=sorted(set(assumptions)), warnings=warnings,
        params_used=list(params_used.values()), n_needs_review=n_review,
    )
