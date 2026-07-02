from __future__ import annotations

from typing import List

from .models import KusenRequest, ManualTakeoffResult, TakeoffLine


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def takeoff_kusen(req: KusenRequest) -> ManualTakeoffResult:
    items: List[TakeoffLine] = []
    warnings: List[str] = []

    for it in req.items:
        if it.qty_counted is not None and it.qty_counted != it.qty:
            items.append(TakeoffLine(
                kode=it.kode, work="count_triangulasi", unit="review",
                formula="qty_schedule vs qty_counted", detail=f"{it.qty} vs {it.qty_counted}",
                needs_review=True,
                review_reason=f"W-CNT: qty schedule {it.qty} berbeda dari count denah {it.qty_counted}.",
                rule_id="RULE-CONF-02",
            ))
        if it.hitung_kusen_perimeter:
            l = 2 * (it.width_m + it.height_m) * it.qty
            items.append(TakeoffLine(
                kode=it.kode, work="kusen", quantity=_r4(l), unit="m",
                formula="2 x (lebar + tinggi) x jumlah",
                detail=f"2 x ({it.width_m:g}+{it.height_m:g}) x {it.qty} = {_r4(l):g} m",
                rule_id="F-G11",
            ))
        area = it.width_m * it.height_m * it.qty
        if it.hitung_daun_area:
            items.append(TakeoffLine(
                kode=it.kode, work="daun", quantity=_r4(area), unit="m2",
                formula="lebar x tinggi x jumlah",
                detail=f"{it.width_m:g} x {it.height_m:g} x {it.qty} = {_r4(area):g} m2",
                rule_id="F-G11",
            ))
        if it.hitung_kaca_area:
            items.append(TakeoffLine(
                kode=it.kode, work="kaca", quantity=_r4(area), unit="m2",
                formula="lebar x tinggi x jumlah",
                detail=f"{it.width_m:g} x {it.height_m:g} x {it.qty} = {_r4(area):g} m2",
                rule_id="F-G11",
            ))
        for acc in it.accessories:
            n = acc.per_unit * it.qty
            items.append(TakeoffLine(
                kode=f"{it.kode}:{acc.nama}", work="aksesoris", quantity=_r4(n), unit=acc.unit,
                formula="per_unit x jumlah unit",
                detail=f"{acc.per_unit:g} x {it.qty} = {_r4(n):g} {acc.unit}",
                rule_id="F-G11",
            ))

    return ManualTakeoffResult(
        domain="kusen", items=items, assumptions=[], warnings=warnings,
        params_used=[], n_needs_review=sum(1 for item in items if item.needs_review),
    )
