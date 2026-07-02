from __future__ import annotations

import math
from typing import Dict, List

from ..tkg.params import ParamUsed
from .models import AtapDetailRequest, ManualTakeoffResult, TakeoffLine


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


def takeoff_atap(req: AtapDetailRequest) -> ManualTakeoffResult:
    ctx = _Ctx()
    p = req.params

    for line in req.garis:
        qty = line.length_m * line.qty
        ctx.items.append(TakeoffLine(
            kode=line.kode, work=line.work, quantity=_r4(qty), unit="m",
            formula="Σ panjang garis atap",
            detail=f"{line.length_m:g} x {line.qty} = {_r4(qty):g} m",
            rule_id="F-G08",
        ))

    for g in req.gording:
        if g.s_gording_m <= 0:
            ctx.items.append(TakeoffLine(
                kode=g.kode, work="gording", unit="m", formula="floor(L_miring/s_gording)+1",
                detail="-", needs_review=True, review_reason="s_gording_m harus > 0", rule_id="F-G07",
            ))
            continue
        n_baris = math.floor(g.l_miring_sisi_m / g.s_gording_m) + 1
        total = n_baris * g.l_arah_gording_m * g.n_sisi_atap
        ctx.items.append(TakeoffLine(
            kode=g.kode, work="gording", quantity=_r4(total), unit="m",
            formula="(floor(L_miring_sisi/s_gording)+1) x L_arah_gording x n_sisi_atap",
            detail=f"({n_baris}) x {g.l_arah_gording_m:g} x {g.n_sisi_atap} = {_r4(total):g} m",
            rule_id="F-G07",
        ))

    for tr in req.trekstang:
        total = tr.panjang_per_batang_m * tr.jumlah
        ctx.items.append(TakeoffLine(
            kode=tr.kode, work="trekstang", quantity=_r4(total), unit="m",
            formula="panjang_per_batang x jumlah",
            detail=f"{tr.panjang_per_batang_m:g} x {tr.jumlah} = {_r4(total):g} m",
            rule_id="F-G07",
        ))

    for ia in req.ikatan_angin:
        diag = math.sqrt(ia.a_m ** 2 + ia.b_m ** 2)
        total = diag * ia.qty
        ctx.items.append(TakeoffLine(
            kode=ia.kode, work="ikatan_angin", quantity=_r4(total), unit="m",
            formula="sqrt(a^2+b^2) x qty",
            detail=f"sqrt({ia.a_m:g}^2+{ia.b_m:g}^2) x {ia.qty} = {_r4(total):g} m",
            rule_id="F-G07",
        ))

    for dp in req.downpipes:
        if dp.count is not None:
            count = dp.count
        else:
            ctx.pakai("A_per_downpipe", p.A_per_downpipe, "luas atap per titik pipa hujan")
            ctx.assumptions.append(
                f"{dp.kode}: jumlah pipa hujan dari ceil(A_atap/A_per_downpipe) karena tidak tergambar eksplisit (F-G08)"
            )
            count = math.ceil(dp.a_atap_m2 / p.A_per_downpipe - 1e-12)
        ctx.items.append(TakeoffLine(
            kode=dp.kode, work="pipa_hujan", quantity=count, unit="titik",
            formula="count tergambar atau ceil(A_atap/A_per_downpipe)",
            detail=f"ceil({dp.a_atap_m2:g}/{p.A_per_downpipe:g}) = {count}",
            rule_id="F-G08",
        ))

    return ManualTakeoffResult(
        domain="atap", items=ctx.items, assumptions=ctx.assumptions, warnings=ctx.warnings,
        params_used=list(ctx.params_used.values()),
        n_needs_review=sum(1 for item in ctx.items if item.needs_review),
    )
