"""Versioned deterministic formula registry with Decimal and unit guards."""
from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Mapping

class FormulaError(ValueError): pass

@dataclass(frozen=True)
class FormulaDefinition:
    formula_id: str
    version: str
    required_inputs: tuple[str, ...]
    input_units: Mapping[str, str]
    output_unit: str

FORMULAS = {
    "column_volume": FormulaDefinition(
        formula_id="column_volume", version="1.0.0",
        required_inputs=("width", "depth", "height", "count"),
        input_units={"width":"m", "depth":"m", "height":"m", "count":"unit"}, output_unit="m3",
    ),
    "rectangular_area": FormulaDefinition(
        formula_id="rectangular_area", version="1.0.0",
        required_inputs=("length", "width"), input_units={"length":"m", "width":"m"}, output_unit="m2",
    ),
}

def _decimal(value: object) -> Decimal:
    try: return Decimal(str(value))
    except Exception as exc: raise FormulaError(f"invalid numeric input: {value!r}") from exc

def execute_formula(formula_id: str, values: Mapping[str, object], units: Mapping[str, str]) -> dict:
    definition=FORMULAS.get(formula_id)
    if not definition: raise FormulaError(f"unknown formula: {formula_id}")
    missing=[name for name in definition.required_inputs if name not in values]
    if missing: raise FormulaError(f"missing inputs: {', '.join(missing)}")
    for name, expected in definition.input_units.items():
        if units.get(name) != expected: raise FormulaError(f"unit mismatch for {name}: expected {expected}, got {units.get(name)}")
    v={name:_decimal(values[name]) for name in definition.required_inputs}
    if any(number < 0 for number in v.values()): raise FormulaError("negative engineering input is not allowed")
    if formula_id == "column_volume": result=v["width"]*v["depth"]*v["height"]*v["count"]
    elif formula_id == "rectangular_area": result=v["length"]*v["width"]
    else: raise FormulaError(f"formula implementation missing: {formula_id}")
    quantized=result.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    return {"formula_id":formula_id,"formula_version":definition.version,"result":str(quantized),"unit":definition.output_unit,
            "substituted_formula":" × ".join(str(v[name]) for name in definition.required_inputs)}
