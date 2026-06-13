"""Deterministic validation and cost calculation for RAB Lite."""

from __future__ import annotations

from typing import Any

import pandas as pd

from paax.rab.loader import normalize_project_item_columns

WARNING_COLUMNS = [
    "row_number",
    "item_name",
    "ahsp_code",
    "warning_code",
    "message",
]


def _clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def _warning(
    row_number: int,
    row: pd.Series,
    warning_code: str,
    message: str,
) -> dict[str, Any]:
    return {
        "row_number": row_number,
        "item_name": _clean_text(row.get("item_name")),
        "ahsp_code": _clean_text(row.get("ahsp_code")),
        "warning_code": warning_code,
        "message": message,
    }


def validate_project_items(
    dataframe: pd.DataFrame,
) -> list[dict[str, Any]]:
    """Return row-level warnings that can be checked before joining data."""
    project_items = normalize_project_item_columns(dataframe)
    warnings = []

    for index, row in project_items.iterrows():
        row_number = index + 2
        quantity = pd.to_numeric(row["quantity"], errors="coerce")
        if pd.isna(quantity) or quantity <= 0:
            warnings.append(
                _warning(
                    row_number,
                    row,
                    "INVALID_QUANTITY",
                    "Quantity is empty, non-numeric, zero, or negative.",
                )
            )

        if not _clean_text(row["ahsp_code"]):
            warnings.append(
                _warning(
                    row_number,
                    row,
                    "MISSING_AHSP_CODE",
                    "AHSP code is empty.",
                )
            )

    return warnings


def _select_hsp_prices(hsp_library: pd.DataFrame) -> pd.DataFrame:
    hsp = hsp_library.copy()
    hsp["ahsp_code"] = (
        hsp["ahsp_code"].astype("string").str.strip().str.upper()
    )
    hsp["unit_price"] = pd.to_numeric(hsp["unit_price"], errors="coerce")
    hsp["year"] = pd.to_numeric(hsp["year"], errors="coerce")
    hsp["_verified_sort"] = (
        hsp["is_verified"]
        .astype("string")
        .str.lower()
        .map({"true": 1, "false": 0})
        .fillna(0)
    )
    return (
        hsp.sort_values(
            ["ahsp_code", "_verified_sort", "year"],
            ascending=[True, False, False],
            kind="stable",
        )
        .drop_duplicates("ahsp_code", keep="first")
        .drop(columns="_verified_sort")
    )


def calculate_rab(
    project_items_df: pd.DataFrame,
    ahsp_index_df: pd.DataFrame,
    hsp_library_df: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    dict[str, Any],
    list[dict[str, Any]],
    pd.DataFrame,
]:
    """Join project items to AHSP/HSP data and calculate valid subtotals."""
    project_items = normalize_project_item_columns(project_items_df)
    project_items.insert(0, "item_no", range(1, len(project_items) + 1))
    project_items["quantity"] = pd.to_numeric(
        project_items["quantity"], errors="coerce"
    )

    ahsp = ahsp_index_df.copy()
    ahsp["ahsp_code"] = (
        ahsp["ahsp_code"].astype("string").str.strip().str.upper()
    )
    ahsp = ahsp.rename(
        columns={
            "description": "ahsp_description",
            "unit": "ahsp_unit",
            "status": "ahsp_status",
        }
    )
    hsp = _select_hsp_prices(hsp_library_df).rename(
        columns={"year": "price_year"}
    )

    result = project_items.merge(
        ahsp[
            [
                "ahsp_code",
                "ahsp_description",
                "ahsp_unit",
                "division",
                "subdivision",
                "ahsp_type",
                "ahsp_status",
                "source_page",
            ]
        ],
        on="ahsp_code",
        how="left",
        validate="many_to_one",
    )
    result = result.merge(
        hsp[
            [
                "ahsp_code",
                "unit_price",
                "region",
                "price_year",
                "source_note",
                "is_verified",
            ]
        ],
        on="ahsp_code",
        how="left",
        validate="many_to_one",
    )

    warnings = validate_project_items(project_items_df)
    valid_quantity = result["quantity"].notna() & result["quantity"].gt(0)
    code_present = result["ahsp_code"].fillna("").str.strip().ne("")
    code_found = result["ahsp_description"].notna()
    item_unit = result["unit"].fillna("").str.strip().str.lower()
    ahsp_unit = result["ahsp_unit"].fillna("").str.strip().str.lower()
    unit_matches = item_unit.ne("") & item_unit.eq(ahsp_unit)
    price_present = result["unit_price"].notna()

    for index, row in result.iterrows():
        row_number = index + 2
        if code_present.iloc[index] and not code_found.iloc[index]:
            warnings.append(
                _warning(
                    row_number,
                    row,
                    "AHSP_CODE_NOT_FOUND",
                    "AHSP code was not found in the bundled demo index.",
                )
            )
        if code_found.iloc[index] and not unit_matches.iloc[index]:
            warnings.append(
                _warning(
                    row_number,
                    row,
                    "UNIT_MISMATCH",
                    "Project unit does not match the AHSP index unit "
                    f"({_clean_text(row['ahsp_unit'])}).",
                )
            )
        if code_found.iloc[index] and not price_present.iloc[index]:
            warnings.append(
                _warning(
                    row_number,
                    row,
                    "MISSING_UNIT_PRICE",
                    "No demo unit price is available for this AHSP code.",
                )
            )

    calculable = (
        valid_quantity
        & code_present
        & code_found
        & unit_matches
        & price_present
    )
    result["subtotal"] = (
        result["quantity"] * result["unit_price"]
    ).where(calculable)
    result["calculation_status"] = calculable.map(
        {True: "CALCULATED", False: "REVIEW_REQUIRED"}
    )

    result_columns = [
        "item_no",
        "item_name",
        "quantity",
        "unit",
        "ahsp_code",
        "notes",
        "ahsp_description",
        "ahsp_unit",
        "division",
        "subdivision",
        "region",
        "price_year",
        "unit_price",
        "subtotal",
        "calculation_status",
    ]
    result = result[result_columns]

    ahsp_used = (
        result.loc[
            result["ahsp_description"].notna(),
            [
                "ahsp_code",
                "ahsp_description",
                "ahsp_unit",
                "division",
                "subdivision",
                "region",
                "price_year",
                "unit_price",
            ],
        ]
        .drop_duplicates("ahsp_code")
        .reset_index(drop=True)
    )

    summary = {
        "currency": "IDR",
        "item_count": int(len(result)),
        "calculated_item_count": int(calculable.sum()),
        "review_item_count": int((~calculable).sum()),
        "warning_count": int(len(warnings)),
        "total_estimated_cost": float(result["subtotal"].sum()),
    }
    return result, summary, warnings, ahsp_used
