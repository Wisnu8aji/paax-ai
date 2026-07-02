from __future__ import annotations

from typing import Dict, List

from ..tkg.params import ParamUsed
from .models import BajaRequest, ManualTakeoffResult, TakeoffLine


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


def takeoff_baja(req: BajaRequest) -> ManualTakeoffResult:
    ctx = _Ctx()
    p = req.params

    for member in req.members:
        profile = req.profile_table.get(member.designation)
        if profile is None:
            ctx.items.append(TakeoffLine(
                kode=member.kode, work="baja_profil", unit="kg",
                formula="w_profil(designasi) x L x qty x (1 + W_baja_waste)",
                detail="-", needs_review=True,
                review_reason=f"Profil {member.designation} tidak ada di profile_table; berat profil adalah DATA.",
                rule_id="F-G06",
            ))
            continue
        ctx.pakai("W_baja_waste", p.W_baja_waste, "waste baja profil")
        w = profile.kg_per_m * member.length_m * member.qty * (1 + p.W_baja_waste)
        ctx.items.append(TakeoffLine(
            kode=member.kode, work="baja_profil", quantity=_r4(w), unit="kg",
            formula="w_profil x L x qty x (1 + W_baja_waste)",
            detail=f"{profile.kg_per_m:g} x {member.length_m:g} x {member.qty} x "
                   f"(1+{p.W_baja_waste:g}) = {_r4(w):g} kg",
            rule_id="F-G06",
        ))

    for plate in req.builtup_plates:
        ctx.pakai("gamma_s", p.gamma_s, "berat jenis baja kg/m3")
        ctx.pakai("W_baja_waste", p.W_baja_waste, "waste baja profil")
        kg_per_m = p.gamma_s * plate.t_m * plate.width_m
        w = kg_per_m * plate.length_m * plate.qty * (1 + p.W_baja_waste)
        ctx.items.append(TakeoffLine(
            kode=plate.kode, work="baja_builtup_plate", quantity=_r4(w), unit="kg",
            formula="gamma_s x t x lebar x L x qty x (1 + W_baja_waste)",
            detail=f"{p.gamma_s:g} x {plate.t_m:g} x {plate.width_m:g} x {plate.length_m:g} x "
                   f"{plate.qty} x (1+{p.W_baja_waste:g}) = {_r4(w):g} kg",
            rule_id="F-G06",
        ))

    for member in req.paint_members:
        profile = req.profile_table.get(member.designation)
        if profile is None or profile.perimeter_m is None:
            ctx.items.append(TakeoffLine(
                kode=member.kode, work="pengecatan_baja", unit="m2",
                formula="keliling_penampang_profil x L x qty",
                detail="-", needs_review=True,
                review_reason=f"Keliling profil {member.designation} tidak ada di profile_table.",
                rule_id="F-G14",
            ))
            continue
        a = profile.perimeter_m * member.length_m * member.qty
        ctx.items.append(TakeoffLine(
            kode=member.kode, work="pengecatan_baja", quantity=_r4(a), unit="m2",
            formula="keliling_penampang_profil x L x qty",
            detail=f"{profile.perimeter_m:g} x {member.length_m:g} x {member.qty} = {_r4(a):g} m2",
            rule_id="F-G14",
        ))

    return ManualTakeoffResult(
        domain="baja", items=ctx.items, assumptions=ctx.assumptions, warnings=ctx.warnings,
        params_used=list(ctx.params_used.values()),
        n_needs_review=sum(1 for item in ctx.items if item.needs_review),
    )
