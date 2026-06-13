from io import BytesIO

import pandas as pd
import pytest
from openpyxl import load_workbook

from paax.rab import (
    calculate_rab,
    create_project_template_excel,
    export_rab_to_excel,
    get_sample_project_items,
    load_ahsp_index,
    load_hsp_library,
)
from paax.rab.loader import PROJECT_ITEM_COLUMNS


@pytest.fixture
def ahsp_index():
    return load_ahsp_index()


@pytest.fixture
def hsp_library():
    return load_hsp_library()


def warning_codes(warnings):
    return {warning["warning_code"] for warning in warnings}


def test_ahsp_index_loads(ahsp_index):
    assert 20 <= len(ahsp_index) <= 40
    assert {
        "ahsp_code",
        "description",
        "unit",
        "division",
        "subdivision",
        "ahsp_type",
        "status",
        "source_page",
    }.issubset(ahsp_index.columns)
    assert ahsp_index["status"].eq("SYNTHETIC_UNVERIFIED").all()


def test_hsp_library_loads(hsp_library):
    assert not hsp_library.empty
    assert hsp_library["unit_price"].gt(0).all()
    assert (
        hsp_library["is_verified"].astype("string").str.lower().eq("false").all()
    )


def test_template_excel_generation():
    template_bytes = create_project_template_excel()

    assert isinstance(template_bytes, bytes)
    assert template_bytes.startswith(b"PK")
    workbook = pd.ExcelFile(BytesIO(template_bytes))
    assert workbook.sheet_names == ["PROJECT_ITEMS", "PETUNJUK"]
    template = pd.read_excel(BytesIO(template_bytes), sheet_name="PROJECT_ITEMS")
    assert template.columns.tolist() == PROJECT_ITEM_COLUMNS


def test_sample_project_items_load():
    sample = get_sample_project_items()

    assert not sample.empty
    assert sample.columns.tolist() == PROJECT_ITEM_COLUMNS


def test_subtotal_and_total_calculation(ahsp_index, hsp_library):
    sample = get_sample_project_items()
    result, summary, warnings, _ = calculate_rab(
        sample,
        ahsp_index,
        hsp_library,
    )

    assert warnings == []
    assert result.loc[0, "subtotal"] == pytest.approx(120 * 18_500)
    assert summary["total_estimated_cost"] == pytest.approx(
        result["subtotal"].sum()
    )
    assert summary["calculated_item_count"] == len(sample)


def test_ahsp_code_not_found_warning(ahsp_index, hsp_library):
    project_items = get_sample_project_items().iloc[[0]].copy()
    project_items.loc[:, "ahsp_code"] = "CK-NOT-FOUND"

    result, _, warnings, _ = calculate_rab(
        project_items,
        ahsp_index,
        hsp_library,
    )

    assert "AHSP_CODE_NOT_FOUND" in warning_codes(warnings)
    assert pd.isna(result.loc[0, "subtotal"])


def test_unit_mismatch_warning(ahsp_index, hsp_library):
    project_items = get_sample_project_items().iloc[[0]].copy()
    project_items.loc[:, "unit"] = "m3"

    result, _, warnings, _ = calculate_rab(
        project_items,
        ahsp_index,
        hsp_library,
    )

    assert "UNIT_MISMATCH" in warning_codes(warnings)
    assert pd.isna(result.loc[0, "subtotal"])


def test_missing_unit_price_warning(ahsp_index, hsp_library):
    project_items = get_sample_project_items().iloc[[0]].copy()
    hsp_without_code = hsp_library[
        hsp_library["ahsp_code"] != project_items.iloc[0]["ahsp_code"]
    ]

    result, _, warnings, _ = calculate_rab(
        project_items,
        ahsp_index,
        hsp_without_code,
    )

    assert "MISSING_UNIT_PRICE" in warning_codes(warnings)
    assert pd.isna(result.loc[0, "subtotal"])


@pytest.mark.parametrize("quantity", [None, "", "abc", 0, -1])
def test_invalid_quantity_warning(
    quantity,
    ahsp_index,
    hsp_library,
):
    project_items = get_sample_project_items().iloc[[0]].copy()
    project_items["quantity"] = pd.Series([quantity], dtype="object")

    result, _, warnings, _ = calculate_rab(
        project_items,
        ahsp_index,
        hsp_library,
    )

    assert "INVALID_QUANTITY" in warning_codes(warnings)
    assert pd.isna(result.loc[0, "subtotal"])


def test_excel_export_returns_bytes_with_required_sheets(
    ahsp_index,
    hsp_library,
):
    result, summary, warnings, ahsp_used = calculate_rab(
        get_sample_project_items(),
        ahsp_index,
        hsp_library,
    )
    result.loc[0, "notes"] = "=1+1"

    export_bytes = export_rab_to_excel(
        result,
        summary,
        warnings,
        ahsp_used,
    )

    assert isinstance(export_bytes, bytes)
    assert export_bytes.startswith(b"PK")
    assert pd.ExcelFile(BytesIO(export_bytes)).sheet_names == [
        "1_RINGKASAN",
        "2_RAB",
        "3_AHSP_TERPAKAI",
        "4_WARNING",
        "5_ASUMSI",
        "6_AUDIT_LOG",
    ]
    workbook = load_workbook(BytesIO(export_bytes), data_only=False)
    assert workbook["2_RAB"]["F2"].value == "=1+1"
    assert workbook["2_RAB"]["F2"].data_type == "s"
