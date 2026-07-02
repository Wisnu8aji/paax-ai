"""
PAAX Core Engine — Take-off §E Dinding, Plester, Acian, Cat, Screed
(brain TXT02 §E, F-E01..F-E07).

  F-E01 Pasangan: A = L*H - Σ A_bukaan_terhitung (deduct_mode all|threshold)
  F-E02 Plesteran: A = s_sisi * A_pasangan_terekspos
  F-E03 Acian    : A = A_plester (butuh plester)
  F-E05 Cat      : A = A_bidang_finish ; total = A * n_lapis bila AHSP per-lapis
  F-E07 Screed   : V = A * t_screed

Deduksi bukaan default = SEMUA (konservatif). Mode "threshold" (bukaan kecil
< ambang tidak dikurangi) HANYA bila spek/kesepakatan -> dicatat assumption
(RULE-READ-02/INV-08).
"""
from __future__ import annotations
from typing import Dict, List, Tuple

from ..tkg.params import ParamUsed
from .models import DindingRequest, ManualTakeoffResult, TakeoffLine
from .params import DindingParams


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


class _Ctx:
    def __init__(self) -> None:
        self.items: List[TakeoffLine] = []
        self.assumptions: List[str] = []
        self.warnings: List[str] = []
        self.params_used: Dict[str, ParamUsed] = {}

    def pakai(self, nama: str, nilai, catatan: str) -> None:
        if nama not in self.params_used:
            self.params_used[nama] = ParamUsed(nama=nama, nilai=nilai, catatan=catatan)


def _deduksi_bukaan(bukaan, params: DindingParams, ctx: _Ctx, kode: str) -> Tuple[float, str]:
    """Total luas bukaan yang DIKURANGI + rincian, sesuai deduct_mode."""
    total = 0.0
    rincian: List[str] = []
    for b in bukaan:
        a_satu = b.lebar * b.tinggi
        a = a_satu * b.n
        if params.deduct_mode == "threshold" and a_satu < params.deduct_threshold:
            rincian.append(f"{b.nama} {b.lebar:g}x{b.tinggi:g} (<{params.deduct_threshold:g} m2, tak dikurangi)")
            continue
        total += a
        rincian.append(f"{b.nama} {b.lebar:g}x{b.tinggi:g}x{b.n}={_r4(a):g}")
    if params.deduct_mode == "threshold":
        ctx.pakai("deduct_mode", "threshold", "bukaan kecil tidak dikurangi (spek/kesepakatan)")
        ctx.pakai("deduct_threshold", params.deduct_threshold, "ambang luas bukaan (m2)")
        ctx.assumptions.append(
            f"{kode}: deduksi bukaan mode 'threshold' (< {params.deduct_threshold:g} m2 tidak "
            f"dikurangi) — hanya sah bila disepakati (F-E01/INV-08)")
    return total, "; ".join(rincian) if rincian else "tanpa bukaan"


def takeoff_dinding(req: DindingRequest) -> ManualTakeoffResult:
    ctx = _Ctx()
    p = req.params

    for d in req.dinding:
        a_kotor = d.l_dinding * d.h_dinding
        a_bukaan, rinc_bukaan = _deduksi_bukaan(d.bukaan, p, ctx, d.kode)
        a_pas = a_kotor - a_bukaan
        if a_pas < 0:
            ctx.warnings.append(
                f"{d.kode}: luas bukaan ({_r4(a_bukaan):g}) > luas dinding ({_r4(a_kotor):g}) — "
                f"periksa input (F-K07)")
            a_pas = 0.0
        ctx.items.append(TakeoffLine(
            kode=d.kode, work="pasangan_dinding", quantity=_r4(a_pas), unit="m2",
            formula="L x H - Σ A_bukaan",
            detail=f"{d.l_dinding:g} x {d.h_dinding:g} - ({rinc_bukaan}) = {_r4(a_pas):g} m2",
            rule_id="F-E01",
        ))

        a_ples = None
        if d.plester_sisi > 0:
            a_ples = d.plester_sisi * a_pas
            ctx.items.append(TakeoffLine(
                kode=d.kode, work="plesteran", quantity=_r4(a_ples), unit="m2",
                formula="s_sisi x A_pasangan",
                detail=f"{d.plester_sisi} x {_r4(a_pas):g} = {_r4(a_ples):g} m2",
                rule_id="F-E02",
            ))

        if d.acian:
            if a_ples is None:
                ctx.items.append(TakeoffLine(
                    kode=d.kode, work="acian", unit="m2", formula="A_plester", detail="-",
                    needs_review=True,
                    review_reason="acian diminta tapi plester_sisi=0 — acian mengikuti luas "
                                  "plester; set plester_sisi atau hapus acian (F-E03)",
                    rule_id="F-E03",
                ))
            else:
                ctx.items.append(TakeoffLine(
                    kode=d.kode, work="acian", quantity=_r4(a_ples), unit="m2",
                    formula="A_acian = A_plester",
                    detail=f"= {_r4(a_ples):g} m2", rule_id="F-E03",
                ))

        if d.cat:
            a_dasar = a_ples if a_ples is not None else a_pas
            dasar_txt = "A_plester" if a_ples is not None else "A_pasangan (tanpa plester)"
            a_cat = a_dasar * p.n_lapis_cat
            if p.n_lapis_cat != 1:
                ctx.pakai("n_lapis_cat", p.n_lapis_cat, "jumlah lapis cat (AHSP per-lapis)")
                ctx.assumptions.append(
                    f"{d.kode}: cat dikali n_lapis={p.n_lapis_cat} — pakai HANYA bila AHSP "
                    f"dihitung per-lapis (F-E05)")
            ctx.items.append(TakeoffLine(
                kode=d.kode, work="pengecatan", quantity=_r4(a_cat), unit="m2",
                formula="A_bidang_finish x n_lapis",
                detail=f"{dasar_txt} {_r4(a_dasar):g} x {p.n_lapis_cat} = {_r4(a_cat):g} m2",
                rule_id="F-E05",
            ))

    # F-E07 screed / leveling
    for s in req.screed:
        v = s.a * s.t
        ctx.items.append(TakeoffLine(
            kode=s.kode, work="screed_lantai", quantity=_r4(v), unit="m3",
            formula="A x t_screed",
            detail=f"{s.a:g} x {s.t:g} = {_r4(v):g} m3", rule_id="F-E07",
        ))

    n_review = sum(1 for i in ctx.items if i.needs_review)
    return ManualTakeoffResult(
        domain="dinding", items=ctx.items,
        assumptions=sorted(set(ctx.assumptions)), warnings=ctx.warnings,
        params_used=list(ctx.params_used.values()), n_needs_review=n_review,
    )
