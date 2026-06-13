"""Excel generation for RAB input templates and calculated estimates."""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

import pandas as pd

from paax.rab.estimator import WARNING_COLUMNS
from paax.rab.loader import PROJECT_ITEM_COLUMNS

ASSUMPTIONS = [
    "AHSP index records are synthetic demo data and are not official.",
    "HSP unit prices are synthetic demo values and are not verified.",
    "Quantities are supplied by the user; PAAX AI performs no drawing takeoff.",
    "Only rows with valid quantity, code, unit, and unit price are totaled.",
    "Official AHSP references and local HSD/HSP must be professionally verified.",
]

EXCEL_WRITER_OPTIONS = {
    "options": {
        "strings_to_formulas": False,
        "strings_to_urls": False,
    }
}


def _format_workbook(
    writer: pd.ExcelWriter,
    sheet_names: list[str],
) -> None:
    workbook = writer.book
    header_format = workbook.add_format(
        {
            "bold": True,
            "font_color": "white",
            "bg_color": "#1F4E78",
            "border": 1,
        }
    )
    money_format = workbook.add_format({"num_format": '#,##0.00'})

    for sheet_name in sheet_names:
        worksheet = writer.sheets[sheet_name]
        worksheet.freeze_panes(1, 0)
        worksheet.autofilter(0, 0, 0, max(0, worksheet.dim_colmax))
        worksheet.set_row(0, None, header_format)
        worksheet.set_column(0, max(0, worksheet.dim_colmax), 18)

    if "2_RAB" in writer.sheets:
        rab_sheet = writer.sheets["2_RAB"]
        rab_sheet.set_column("B:B", 32)
        rab_sheet.set_column("G:G", 40)
        rab_sheet.set_column("M:N", 18, money_format)
    if "3_AHSP_TERPAKAI" in writer.sheets:
        writer.sheets["3_AHSP_TERPAKAI"].set_column("B:B", 40)
    if "4_WARNING" in writer.sheets:
        writer.sheets["4_WARNING"].set_column("E:E", 55)
    if "5_ASUMSI" in writer.sheets:
        writer.sheets["5_ASUMSI"].set_column("B:B", 90)
    if "6_AUDIT_LOG" in writer.sheets:
        writer.sheets["6_AUDIT_LOG"].set_column("C:C", 80)


def create_project_template_excel() -> bytes:
    """Create a blank project-item workbook with the required columns."""
    output = BytesIO()
    template = pd.DataFrame(columns=PROJECT_ITEM_COLUMNS)
    guidance = pd.DataFrame(
        {
            "field": PROJECT_ITEM_COLUMNS,
            "guidance": [
                "Project work item name.",
                "Positive numeric quantity.",
                "Unit matching the selected AHSP code.",
                "Code from the bundled AHSP index.",
                "Optional project note.",
            ],
        }
    )

    with pd.ExcelWriter(
        output,
        engine="xlsxwriter",
        engine_kwargs=EXCEL_WRITER_OPTIONS,
    ) as writer:
        template.to_excel(writer, sheet_name="PROJECT_ITEMS", index=False)
        guidance.to_excel(writer, sheet_name="PETUNJUK", index=False)
        workbook = writer.book
        header_format = workbook.add_format(
            {
                "bold": True,
                "font_color": "white",
                "bg_color": "#1F4E78",
                "border": 1,
            }
        )
        for sheet_name in ("PROJECT_ITEMS", "PETUNJUK"):
            sheet = writer.sheets[sheet_name]
            sheet.freeze_panes(1, 0)
            sheet.set_row(0, None, header_format)
            sheet.set_column(0, sheet.dim_colmax, 24)
        writer.sheets["PROJECT_ITEMS"].set_column("A:A", 38)
        writer.sheets["PROJECT_ITEMS"].set_column("E:E", 38)
        writer.sheets["PETUNJUK"].set_column("B:B", 60)

    return output.getvalue()


def export_rab_to_excel(
    result_df: pd.DataFrame,
    summary: dict[str, Any],
    warnings: list[dict[str, Any]] | pd.DataFrame,
    ahsp_used_df: pd.DataFrame,
) -> bytes:
    """Export a deterministic RAB result and audit context to Excel bytes."""
    output = BytesIO()
    warning_df = (
        warnings.copy()
        if isinstance(warnings, pd.DataFrame)
        else pd.DataFrame(warnings, columns=WARNING_COLUMNS)
    )
    summary_df = pd.DataFrame(
        [
            {"metric": "Currency", "value": summary.get("currency", "IDR")},
            {
                "metric": "Total estimated cost",
                "value": summary.get("total_estimated_cost", 0),
            },
            {"metric": "Input items", "value": summary.get("item_count", 0)},
            {
                "metric": "Calculated items",
                "value": summary.get("calculated_item_count", 0),
            },
            {
                "metric": "Items requiring review",
                "value": summary.get("review_item_count", 0),
            },
            {
                "metric": "Warning count",
                "value": summary.get("warning_count", len(warning_df)),
            },
        ]
    )
    assumptions_df = pd.DataFrame(
        {
            "assumption_no": range(1, len(ASSUMPTIONS) + 1),
            "assumption": ASSUMPTIONS,
        }
    )
    audit_df = pd.DataFrame(
        [
            {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "event": "RAB_CALCULATED",
                "detail": (
                    "Numeric subtotals and total were calculated by Python. "
                    "Gemini was not used for numeric calculation."
                ),
            },
            {
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "event": "DATA_CLASSIFICATION",
                "detail": (
                    "Bundled AHSP and HSP records are synthetic, unverified "
                    "demo data."
                ),
            },
        ]
    )

    sheet_names = [
        "1_RINGKASAN",
        "2_RAB",
        "3_AHSP_TERPAKAI",
        "4_WARNING",
        "5_ASUMSI",
        "6_AUDIT_LOG",
    ]
    with pd.ExcelWriter(
        output,
        engine="xlsxwriter",
        engine_kwargs=EXCEL_WRITER_OPTIONS,
    ) as writer:
        summary_df.to_excel(writer, sheet_name=sheet_names[0], index=False)
        result_df.to_excel(writer, sheet_name=sheet_names[1], index=False)
        ahsp_used_df.to_excel(writer, sheet_name=sheet_names[2], index=False)
        warning_df.to_excel(writer, sheet_name=sheet_names[3], index=False)
        assumptions_df.to_excel(writer, sheet_name=sheet_names[4], index=False)
        audit_df.to_excel(writer, sheet_name=sheet_names[5], index=False)
        _format_workbook(writer, sheet_names)

    return output.getvalue()
