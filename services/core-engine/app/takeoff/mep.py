from __future__ import annotations

from typing import Dict, List

from ..tkg.params import ParamUsed
from .models import ManualTakeoffResult, MepRequest, TakeoffLine


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def takeoff_mep(req: MepRequest) -> ManualTakeoffResult:
    items: List[TakeoffLine] = []
    assumptions: List[str] = []
    params_used: Dict[str, ParamUsed] = {}

    def pakai(nama: str, nilai, catatan: str) -> None:
        if nama not in params_used:
            params_used[nama] = ParamUsed(nama=nama, nilai=nilai, catatan=catatan)

    for rail in req.railing:
        l = rail.length_m * rail.qty
        items.append(TakeoffLine(
            kode=rail.kode, work="railing", quantity=_r4(l), unit="m",
            formula="Σ tepi tangga/void/ram",
            detail=f"{rail.length_m:g} x {rail.qty} = {_r4(l):g} m",
            rule_id="F-G12",
        ))

    for pt in req.points:
        items.append(TakeoffLine(
            kode=pt.kode, work=f"titik_{pt.jenis}", quantity=pt.count, unit="titik",
            formula="count eksplisit dari daftar titik pengguna",
            detail=f"{pt.count} titik", rule_id="F-G13",
        ))

    for route in req.pipe_routes:
        l = route.length_m * route.qty
        items.append(TakeoffLine(
            kode=route.kode, work="pipa_mep", quantity=_r4(l), unit="m",
            formula="Σ jalur pipa eksplisit",
            detail=f"{route.length_m:g} x {route.qty} = {_r4(l):g} m",
            rule_id="F-G13",
        ))

    for fb in req.fixture_fallbacks:
        if req.params.L_pipa_per_fixture is None:
            items.append(TakeoffLine(
                kode=fb.kode, work="pipa_mep_fallback", unit="m",
                formula="fixture_count x L_pipa_per_fixture", detail="-",
                needs_review=True,
                review_reason="Jalur pipa tidak disetor dan L_pipa_per_fixture tidak disetor; tidak boleh ditebak.",
                rule_id="F-G13",
            ))
            continue
        pakai("L_pipa_per_fixture", req.params.L_pipa_per_fixture, "fallback panjang pipa per fixture")
        assumptions.append(
            f"{fb.kode}: pipa memakai fallback L_pipa_per_fixture={req.params.L_pipa_per_fixture:g} m/fixture (F-G13)"
        )
        l = fb.fixture_count * req.params.L_pipa_per_fixture
        items.append(TakeoffLine(
            kode=fb.kode, work="pipa_mep_fallback", quantity=_r4(l), unit="m",
            formula="fixture_count x L_pipa_per_fixture",
            detail=f"{fb.fixture_count} x {req.params.L_pipa_per_fixture:g} = {_r4(l):g} m",
            rule_id="F-G13",
        ))

    return ManualTakeoffResult(
        domain="mep", items=items, assumptions=assumptions, warnings=[],
        params_used=list(params_used.values()), n_needs_review=sum(1 for item in items if item.needs_review),
    )
