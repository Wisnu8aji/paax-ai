from decimal import Decimal
import pytest
from app.formula_registry import execute_formula, FormulaError
from app.calculation_worksheet import export_backup_workbook, inspect_backup_workbook

def test_k2_l2_exact_decimal_result():
    result=execute_formula("column_volume", {"width":"0.25","depth":"0.60","height":"3.90","count":4},
                           {"width":"m","depth":"m","height":"m","count":"unit"})
    assert result["result"] == "2.340" and result["unit"] == "m3"

def test_formula_rejects_wrong_units():
    with pytest.raises(FormulaError, match="unit mismatch"):
        execute_formula("column_volume", {"width":250,"depth":600,"height":3900,"count":4},
                        {"width":"mm","depth":"mm","height":"mm","count":"unit"})

def test_backup_workbook_roundtrip():
    data=export_backup_workbook([{"display_name":"Kolom K2","location":"Lantai 2","category":"column","unit":"m³","dimensions_display":"0,250 × 0,600 × 3,900 m","count":4,"formula":"0,250 × 0,600 × 3,900 × 4","result_display":"2,340 m³","status":"engine_verified","source_refs":[{"page":43,"role":"jumlah"}]}])
    info=inspect_backup_workbook(data)
    assert info["row_count"] == 1
