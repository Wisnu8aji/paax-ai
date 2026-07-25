"""Deterministic dimensional conversion helpers used by the Core Engine."""
from __future__ import annotations

from decimal import Decimal
from typing import TypeVar

from paax_schemas.measurement import Area, Count, Length, Mass, TypedQuantity, Volume


QuantityT = TypeVar("QuantityT", Length, Area, Volume, Mass, Count)

_BASE_FACTORS: dict[type[TypedQuantity], dict[str, Decimal]] = {
    Length: {"mm": Decimal("0.001"), "cm": Decimal("0.01"), "m": Decimal("1"), "inch": Decimal("0.0254")},
    Area: {"mm2": Decimal("0.000001"), "cm2": Decimal("0.0001"), "m2": Decimal("1"), "inch2": Decimal("0.00064516")},
    Volume: {"mm3": Decimal("0.000000001"), "cm3": Decimal("0.000001"), "m3": Decimal("1"), "inch3": Decimal("0.000016387064")},
    Mass: {"g": Decimal("0.001"), "kg": Decimal("1"), "tonne": Decimal("1000")},
    # Count has exactly one unit ("unit"); this identity factor lets it flow
    # through the same convert() path as every other typed quantity instead
    # of needing a special case at every call site.
    Count: {"unit": Decimal("1")},
}


def convert(quantity: QuantityT, target_unit: str) -> QuantityT:
    """Convert only within one dimension; incompatible targets are rejected."""
    quantity_type = type(quantity)
    factors = _BASE_FACTORS[quantity_type]
    if target_unit not in factors:
        raise ValueError(f"{target_unit} is incompatible with {quantity_type.__name__}")
    base_value = quantity.value * factors[quantity.unit]
    return quantity_type(value=base_value / factors[target_unit], unit=target_unit)


def scale_aware_distance(distance: Length, *, scale_denominator: int, scale_evidence_ref: str | None, scale_verified: bool) -> Length:
    """Return physical distance only when validated scale evidence is supplied."""
    if scale_denominator <= 0 or not scale_evidence_ref or not scale_verified:
        raise ValueError("scale-aware distance requires valid verified scale evidence")
    physical_mm = convert(distance, "mm").value * Decimal(scale_denominator)
    return Length(value=physical_mm, unit="mm")
