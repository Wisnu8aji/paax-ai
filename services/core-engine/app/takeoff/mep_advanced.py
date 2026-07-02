"""
PAAX Core Engine — Take-off MEP lanjut (fire alarm, hydrant, AC, penangkal
petir, genset) — brain TXT02 F-G13: titik/fixture = count eksplisit; pipa/
kabel = Σ panjang jalur. Murni rekap input eksplisit menjadi WorkItem —
TIDAK ada estimasi jalur otomatis (itu butuh denah MEP; tanpa data ->
needs_review, bukan tebakan).
"""
from typing import Dict, List, Literal

from pydantic import BaseModel, Field

from ..tkg.params import ParamUsed
from .models import ManualTakeoffResult, TakeoffLine


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


MepSystem = Literal["fire_alarm", "hydrant", "ac", "penangkal_petir", "genset"]


class MepPointAdvanced(BaseModel):
    kode: str
    system: MepSystem
    jenis: str   # mis. "smoke_detector", "hydrant_box", "ac_split_1pk", "genset_100kva"
    count: int


class MepRouteAdvanced(BaseModel):
    kode: str
    system: MepSystem
    jenis_kabel_pipa: str
    length_m: float
    qty: int = 1


class MepAdvancedRequest(BaseModel):
    points: List[MepPointAdvanced] = Field(default_factory=list)
    routes: List[MepRouteAdvanced] = Field(default_factory=list)


def takeoff_mep_advanced(req: MepAdvancedRequest) -> ManualTakeoffResult:
    items: List[TakeoffLine] = []
    assumptions: List[str] = []
    params_used: Dict[str, ParamUsed] = {}

    for pt in req.points:
        if pt.count <= 0:
            items.append(TakeoffLine(
                kode=pt.kode, work=f"{pt.system}_{pt.jenis}", unit="unit",
                formula="count eksplisit titik MEP", detail="-",
                needs_review=True,
                review_reason=f"count={pt.count} tidak valid (harus > 0) — periksa "
                              f"input; jumlah titik tidak boleh ditebak (F-G13)",
                rule_id="F-G13",
            ))
            continue
        items.append(TakeoffLine(
            kode=pt.kode,
            work=f"{pt.system}_{pt.jenis}",
            quantity=float(pt.count),
            unit="unit",
            formula="count eksplisit titik/fixture MEP",
            detail=f"{pt.count} unit",
            rule_id="F-G13",
        ))

    for route in req.routes:
        if route.length_m <= 0 or route.qty <= 0:
            items.append(TakeoffLine(
                kode=route.kode, work=f"{route.system}_{route.jenis_kabel_pipa}", unit="m",
                formula="Σ panjang jalur kabel/pipa MEP", detail="-",
                needs_review=True,
                review_reason=f"length_m={route.length_m:g} / qty={route.qty} tidak valid "
                              f"(harus > 0) — panjang jalur harus dari denah MEP, bukan "
                              f"ditebak (F-G13)",
                rule_id="F-G13",
            ))
            continue
        l = route.length_m * route.qty
        items.append(TakeoffLine(
            kode=route.kode,
            work=f"{route.system}_{route.jenis_kabel_pipa}",
            quantity=_r4(l),
            unit="m",
            formula="Σ panjang jalur kabel/pipa MEP",
            detail=f"{route.length_m:g} x {route.qty} = {_r4(l):g} m",
            rule_id="F-G13",
        ))

    return ManualTakeoffResult(
        domain="mep",
        items=items,
        assumptions=assumptions,
        warnings=[],
        params_used=list(params_used.values()),
        n_needs_review=sum(1 for item in items if item.needs_review),
    )
