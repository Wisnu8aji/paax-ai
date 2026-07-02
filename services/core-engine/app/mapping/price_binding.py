from __future__ import annotations

from typing import Dict

from app.rab.models import AHSPItem, ResourcePrice

from .models import PriceBindingLine, PriceBindingResult, PriceBindRequest


def bind_prices(
    req: PriceBindRequest,
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
) -> PriceBindingResult:
    item = ahsp_index[req.ahsp_code]
    lines: list[PriceBindingLine] = []
    missing: list[str] = []
    for comp in item.components:
        price = price_book.get(comp.resource_code)
        has_price = price is not None
        if not has_price:
            missing.append(comp.resource_code)
        lines.append(PriceBindingLine(
            resource_code=comp.resource_code,
            coefficient=comp.coefficient,
            has_price=has_price,
            unit_price=price.price if price else None,
        ))
    total = len(item.components)
    priced = total - len(missing)
    return PriceBindingResult(
        ahsp_code=item.code,
        region_code=req.region_code,
        lines=lines,
        missing_resources=missing,
        coverage_ratio=round(priced / total + 1e-12, 4) if total else 1.0,
    )
