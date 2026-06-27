"""
PAAX Core Engine — Perhitungan HSP & RAB (deterministik, auditable).

Rumus (kerangka AHSP):
    A (Bahan) = Σ (koef_bahan × harga_bahan)
    B (Upah)  = Σ (koef_upah  × harga_upah)
    C (Alat)  = Σ (koef_alat  × harga_alat)
    HSP       = (A + B + C) × (1 + overhead_profit)

    Harga Item = Volume × HSP
    Subtotal   = Σ Harga Item
    PPN        = Subtotal × ppn_rate
    RAB Total  = Subtotal + PPN
    Bobot Item = Harga Item / Subtotal × 100%
"""
from __future__ import annotations
import math
from typing import Dict, List

from .models import (
    AHSPItem, ResourcePrice, ComponentCost, HSPBreakdown,
    RABLineInput, RABLine, RABResult,
)


def money(x: float) -> float:
    """Pembulatan uang ke 2 desimal (konsisten & deterministik)."""
    return round(x + 1e-9, 2)


def apply_rounding(x: float, mode: str = "exact") -> float:
    """Terapkan mode pembulatan HSP tanpa mengubah default historis engine."""
    if mode == "rounddown_int":
        return float(math.floor(x + 1e-9))
    return money(x)


def compute_hsp(
    item: AHSPItem,
    price_book: Dict[str, ResourcePrice],
    overhead_override: float | None = None,
    rounding_mode: str = "exact",
) -> HSPBreakdown:
    """Hitung Harga Satuan Pekerjaan satu item dari koefisien + harga wilayah."""
    comps: List[ComponentCost] = []
    a = b = c = 0.0

    for comp in item.components:
        price = price_book.get(comp.resource_code)
        if price is None:
            raise KeyError(
                f"Harga satuan untuk '{comp.resource_code}' tidak ditemukan "
                f"(item {item.code}). Tambahkan ke price book wilayah."
            )
        subtotal = comp.coefficient * price.price
        comps.append(ComponentCost(
            resource_code=comp.resource_code,
            resource_name=price.name,
            category=comp.category,
            unit=price.unit,
            coefficient=comp.coefficient,
            unit_price=price.price,
            subtotal=money(subtotal),
        ))
        if comp.category == "bahan":
            a += subtotal
        elif comp.category == "upah":
            b += subtotal
        else:
            c += subtotal

    base = a + b + c
    rate = overhead_override if overhead_override is not None else item.overhead_profit
    opv = base * rate
    hsp = apply_rounding(base + opv, rounding_mode)

    return HSPBreakdown(
        ahsp_code=item.code,
        name=item.name,
        unit=item.unit,
        bahan=money(a),
        upah=money(b),
        alat=money(c),
        base=money(base),
        overhead_profit=rate,
        overhead_profit_value=money(opv),
        hsp=hsp,
        components=comps,
    )


def compute_rab(
    lines_input: List[RABLineInput],
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
    region: str,
    region_code: str,
    ppn_rate: float = 0.11,
    overhead_override: float | None = None,
    rounding_mode: str = "exact",
) -> RABResult:
    """Susun RAB lengkap dari daftar item (kode AHSP + volume)."""
    computed = []
    subtotal = 0.0

    for li in lines_input:
        item = ahsp_index.get(li.ahsp_code)
        if item is None:
            raise KeyError(f"Item AHSP '{li.ahsp_code}' tidak ditemukan.")
        hsp = compute_hsp(item, price_book, overhead_override, rounding_mode).hsp
        amount = money(li.volume * hsp)
        computed.append((li, item, hsp, amount))
        subtotal += amount

    subtotal = money(subtotal)
    lines: List[RABLine] = []
    for (li, item, hsp, amount) in computed:
        weight = round(amount / subtotal * 100, 4) if subtotal else 0.0
        tax_amount = money(amount * ppn_rate)
        line_total = money(amount + tax_amount)
        lines.append(RABLine(
            ahsp_code=item.code,
            name=item.name,
            unit=item.unit,
            volume=li.volume,
            hsp=hsp,
            amount=amount,
            weight_pct=weight,
            tax_amount=tax_amount,
            line_total=line_total,
        ))

    ppn = money(subtotal * ppn_rate)
    total = money(subtotal + ppn)

    return RABResult(
        region=region,
        region_code=region_code,
        lines=lines,
        subtotal=subtotal,
        ppn_rate=ppn_rate,
        ppn=ppn,
        total=total,
    )
