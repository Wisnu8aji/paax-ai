"""Import and validate private AHSP extraction workbooks."""

from __future__ import annotations

from collections.abc import Iterable
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd

PRIVATE_INDEX_SHEET = "1_AHSP_INDEX"
PRIVATE_COEFFICIENT_SHEET = "2_COEFFICIENTS_LONG"

PRIVATE_INDEX_COLUMNS = [
    "ahsp_code",
    "description",
    "unit",
    "division",
    "subdivision",
    "sub_subdivision",
    "ahsp_type",
    "status",
    "source_page",
    "raw_text",
    "confidence",
    "notes",
]

PRIVATE_COEFFICIENT_COLUMNS = [
    "ahsp_code",
    "component_section",
    "component_no",
    "component_name",
    "component_code",
    "component_unit",
    "coefficient",
    "source_page",
    "raw_text",
    "confidence",
    "notes",
]

COMPONENT_MASTER_COLUMNS = [
    "component_id",
    "component_section",
    "component_code",
    "component_name",
    "component_unit",
    "ahsp_usage_count",
    "coefficient_row_count",
]

VALID_COMPONENT_SECTIONS = {
    "labor",
    "material",
    "equipment",
    "formula",
    "other",
}

EXCEL_WRITER_OPTIONS = {
    "options": {
        "strings_to_formulas": False,
        "strings_to_urls": False,
    }
}


def _normalize_column_names(dataframe: pd.DataFrame) -> pd.DataFrame:
    normalized = dataframe.copy()
    normalized.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in normalized.columns
    ]
    duplicate_columns = normalized.columns[normalized.columns.duplicated()]
    if len(duplicate_columns):
        duplicates = ", ".join(sorted(set(duplicate_columns)))
        raise ValueError(
            f"Dataset contains duplicate normalized columns: {duplicates}"
        )
    return normalized


def _require_columns(
    dataframe: pd.DataFrame,
    required_columns: list[str],
    dataset_name: str,
) -> None:
    missing = [
        column for column in required_columns if column not in dataframe.columns
    ]
    if missing:
        raise ValueError(
            f"{dataset_name} is missing required columns: "
            f"{', '.join(missing)}"
        )


def _load_required_sheet(
    path: str | Path,
    sheet_name: str,
    required_columns: list[str],
    dataset_name: str,
) -> pd.DataFrame:
    workbook_path = Path(path)
    try:
        workbook = pd.ExcelFile(workbook_path)
    except (OSError, ValueError, ImportError) as exc:
        raise ValueError(
            f"Could not open {dataset_name} workbook: {workbook_path}"
        ) from exc

    if sheet_name not in workbook.sheet_names:
        raise ValueError(
            f"{dataset_name} workbook is missing required sheet: {sheet_name}"
        )

    dataframe = pd.read_excel(workbook, sheet_name=sheet_name, dtype=object)
    normalized_columns = _normalize_column_names(dataframe)
    _require_columns(normalized_columns, required_columns, dataset_name)
    return dataframe


def _clean_text_columns(
    dataframe: pd.DataFrame,
    columns: Iterable[str],
) -> None:
    for column in columns:
        dataframe[column] = dataframe[column].astype("string").str.strip()
        dataframe[column] = dataframe[column].replace("", pd.NA)


def load_private_ahsp_index_excel(path: str | Path) -> pd.DataFrame:
    """Load and normalize the required private AHSP index worksheet."""
    dataframe = _load_required_sheet(
        path,
        PRIVATE_INDEX_SHEET,
        PRIVATE_INDEX_COLUMNS,
        "Private AHSP index",
    )
    return normalize_private_ahsp_index(dataframe)


def load_private_coeff_excel(path: str | Path) -> pd.DataFrame:
    """Load and normalize a required private coefficient worksheet."""
    dataframe = _load_required_sheet(
        path,
        PRIVATE_COEFFICIENT_SHEET,
        PRIVATE_COEFFICIENT_COLUMNS,
        "Private AHSP coefficients",
    )
    return normalize_private_coefficients(dataframe)


def normalize_private_ahsp_index(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize private AHSP index headings, text fields, and confidence."""
    normalized = _normalize_column_names(dataframe)
    _require_columns(
        normalized,
        PRIVATE_INDEX_COLUMNS,
        "Private AHSP index",
    )
    normalized = normalized[PRIVATE_INDEX_COLUMNS].copy()
    _clean_text_columns(
        normalized,
        [
            "ahsp_code",
            "description",
            "unit",
            "division",
            "subdivision",
            "sub_subdivision",
            "ahsp_type",
            "status",
            "source_page",
            "raw_text",
            "notes",
        ],
    )
    normalized["ahsp_code"] = normalized["ahsp_code"].str.upper()
    normalized["confidence"] = pd.to_numeric(
        normalized["confidence"], errors="coerce"
    )
    return normalized.reset_index(drop=True)


def normalize_private_coefficients(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize private coefficient headings and deterministic numeric data."""
    normalized = _normalize_column_names(dataframe)
    _require_columns(
        normalized,
        PRIVATE_COEFFICIENT_COLUMNS,
        "Private AHSP coefficients",
    )
    normalized = normalized[PRIVATE_COEFFICIENT_COLUMNS].copy()
    _clean_text_columns(
        normalized,
        [
            "ahsp_code",
            "component_section",
            "component_no",
            "component_name",
            "component_code",
            "component_unit",
            "source_page",
            "raw_text",
            "notes",
        ],
    )
    normalized["ahsp_code"] = normalized["ahsp_code"].str.upper()
    normalized["component_code"] = normalized["component_code"].str.upper()
    normalized["component_section"] = (
        normalized["component_section"].str.lower()
    )
    coefficient_text = (
        normalized["coefficient"].astype("string").str.strip()
    )
    coefficient_numeric = pd.to_numeric(
        coefficient_text,
        errors="coerce",
    )
    normalized["coefficient"] = coefficient_numeric.where(
        coefficient_numeric.notna(),
        coefficient_text,
    )
    normalized["confidence"] = pd.to_numeric(
        normalized["confidence"], errors="coerce"
    )
    return normalized.reset_index(drop=True)


def build_private_component_master(
    coeff_dfs: Iterable[pd.DataFrame] | pd.DataFrame,
) -> pd.DataFrame:
    """Build a deterministic component master from coefficient tables."""
    if isinstance(coeff_dfs, pd.DataFrame):
        coefficient_frames = [coeff_dfs]
    else:
        coefficient_frames = list(coeff_dfs)

    if not coefficient_frames:
        return pd.DataFrame(columns=COMPONENT_MASTER_COLUMNS)

    coefficients = pd.concat(
        [
            normalize_private_coefficients(dataframe)
            for dataframe in coefficient_frames
        ],
        ignore_index=True,
    )
    component_fields = [
        "component_section",
        "component_code",
        "component_name",
        "component_unit",
    ]
    working = coefficients.copy()
    for column in component_fields:
        working[column] = working[column].fillna("")

    grouped = (
        working.groupby(component_fields, dropna=False, sort=True)
        .agg(
            ahsp_usage_count=("ahsp_code", "nunique"),
            coefficient_row_count=("ahsp_code", "size"),
        )
        .reset_index()
    )
    for column in component_fields:
        grouped[column] = grouped[column].replace("", pd.NA)
    grouped.insert(
        0,
        "component_id",
        [f"COMP-{number:05d}" for number in range(1, len(grouped) + 1)],
    )
    return grouped[COMPONENT_MASTER_COLUMNS]


def _issue(
    severity: str,
    code: str,
    dataset: str,
    reference: str,
    message: str,
) -> dict[str, str]:
    return {
        "severity": severity,
        "code": code,
        "dataset": dataset,
        "reference": reference,
        "message": message,
    }


def validate_private_ahsp_dataset(
    index_df: pd.DataFrame,
    coeff_df: pd.DataFrame,
    component_df: pd.DataFrame,
) -> dict[str, Any]:
    """Validate normalized private AHSP data and return structured issues."""
    index = normalize_private_ahsp_index(index_df)
    coefficients = normalize_private_coefficients(coeff_df)
    components = component_df.copy()
    _require_columns(
        components,
        COMPONENT_MASTER_COLUMNS,
        "Private component master",
    )

    issues: list[dict[str, str]] = []
    missing_index_codes = index["ahsp_code"].isna()
    for row_index in index.index[missing_index_codes]:
        issues.append(
            _issue(
                "error",
                "MISSING_AHSP_CODE",
                "ahsp_index",
                f"row {row_index + 2}",
                "AHSP code is empty.",
            )
        )

    for column, issue_code in (
        ("description", "MISSING_AHSP_DESCRIPTION"),
        ("unit", "MISSING_AHSP_UNIT"),
    ):
        for row_index in index.index[index[column].isna()]:
            issues.append(
                _issue(
                    "error",
                    issue_code,
                    "ahsp_index",
                    f"row {row_index + 2}",
                    f"Required AHSP field {column!r} is empty.",
                )
            )

    duplicate_codes = sorted(
        index.loc[
            index["ahsp_code"].notna()
            & index["ahsp_code"].duplicated(keep=False),
            "ahsp_code",
        ]
        .dropna()
        .unique()
    )
    for ahsp_code in duplicate_codes:
        issues.append(
            _issue(
                "error",
                "DUPLICATE_AHSP_CODE",
                "ahsp_index",
                ahsp_code,
                "AHSP code appears more than once in the private index.",
            )
        )

    known_codes = set(index["ahsp_code"].dropna())
    for row_index in coefficients.index[coefficients["ahsp_code"].isna()]:
        issues.append(
            _issue(
                "error",
                "MISSING_COEFFICIENT_AHSP_CODE",
                "ahsp_coefficients_long",
                f"row {row_index + 2}",
                "Coefficient AHSP code is empty.",
            )
        )

    coefficient_codes = set(coefficients["ahsp_code"].dropna())
    for ahsp_code in sorted(coefficient_codes.difference(known_codes)):
        issues.append(
            _issue(
                "error",
                "COEFFICIENT_AHSP_CODE_NOT_FOUND",
                "ahsp_coefficients_long",
                ahsp_code,
                "Coefficient AHSP code was not found in the private index.",
            )
        )

    for row_index in coefficients.index[
        coefficients["component_section"].isna()
    ]:
        issues.append(
            _issue(
                "error",
                "MISSING_COMPONENT_SECTION",
                "ahsp_coefficients_long",
                f"row {row_index + 2}",
                "Component section is empty.",
            )
        )

    invalid_sections = sorted(
        set(coefficients["component_section"].dropna()).difference(
            VALID_COMPONENT_SECTIONS
        )
    )
    for section in invalid_sections:
        issues.append(
            _issue(
                "error",
                "INVALID_COMPONENT_SECTION",
                "ahsp_coefficients_long",
                section,
                "Component section is outside the supported value set.",
            )
        )

    numeric_sections = {"labor", "material", "equipment"}
    invalid_coefficients = (
        coefficients["component_section"].isin(numeric_sections)
        & pd.to_numeric(
            coefficients["coefficient"],
            errors="coerce",
        ).isna()
    )
    for row_index in coefficients.index[invalid_coefficients]:
        issues.append(
            _issue(
                "error",
                "INVALID_COEFFICIENT",
                "ahsp_coefficients_long",
                f"row {row_index + 2}",
                "Coefficient is empty or non-numeric.",
            )
        )

    missing_component_names = coefficients["component_name"].isna()
    for row_index in coefficients.index[missing_component_names]:
        issues.append(
            _issue(
                "warning",
                "MISSING_COMPONENT_NAME",
                "ahsp_coefficients_long",
                f"row {row_index + 2}",
                "Component name is empty.",
            )
        )

    duplicate_component_ids = sorted(
        components.loc[
            components["component_id"].notna()
            & components["component_id"].duplicated(keep=False),
            "component_id",
        ]
        .astype(str)
        .unique()
    )
    for component_id in duplicate_component_ids:
        issues.append(
            _issue(
                "error",
                "DUPLICATE_COMPONENT_ID",
                "component_master",
                component_id,
                "Component ID appears more than once.",
            )
        )

    component_fields = [
        "component_section",
        "component_code",
        "component_name",
        "component_unit",
    ]
    expected_components = build_private_component_master(coefficients)
    expected_keys = {
        tuple("" if pd.isna(value) else str(value) for value in row)
        for row in expected_components[component_fields].itertuples(
            index=False,
            name=None,
        )
    }
    actual_keys = {
        tuple("" if pd.isna(value) else str(value) for value in row)
        for row in components[component_fields].itertuples(
            index=False,
            name=None,
        )
    }
    if actual_keys != expected_keys:
        issues.append(
            _issue(
                "error",
                "COMPONENT_MASTER_MISMATCH",
                "component_master",
                "component set",
                (
                    "Component master does not match the distinct components "
                    "in the coefficient dataset."
                ),
            )
        )

    issue_df = pd.DataFrame(issues)
    error_count = (
        int(issue_df["severity"].eq("error").sum())
        if not issue_df.empty
        else 0
    )
    warning_count = (
        int(issue_df["severity"].eq("warning").sum())
        if not issue_df.empty
        else 0
    )
    return {
        "is_valid": error_count == 0,
        "summary": {
            "index_rows": int(len(index)),
            "coefficient_rows": int(len(coefficients)),
            "component_rows": int(len(components)),
            "error_count": error_count,
            "warning_count": warning_count,
        },
        "issues": issues,
    }


def create_private_validation_report(
    validation_result: dict[str, Any],
) -> bytes:
    """Create an Excel validation report from structured validation output."""
    output = BytesIO()
    summary = validation_result.get("summary", {})
    summary_rows = [
        {"metric": "is_valid", "value": validation_result.get("is_valid")},
        *[
            {"metric": key, "value": value}
            for key, value in summary.items()
        ],
    ]
    summary_df = pd.DataFrame(summary_rows)
    issues_df = pd.DataFrame(
        validation_result.get("issues", []),
        columns=["severity", "code", "dataset", "reference", "message"],
    )

    with pd.ExcelWriter(
        output,
        engine="xlsxwriter",
        engine_kwargs=EXCEL_WRITER_OPTIONS,
    ) as writer:
        summary_df.to_excel(writer, sheet_name="SUMMARY", index=False)
        issues_df.to_excel(writer, sheet_name="ISSUES", index=False)
        workbook = writer.book
        header_format = workbook.add_format(
            {
                "bold": True,
                "font_color": "white",
                "bg_color": "#1F4E78",
                "border": 1,
            }
        )
        for sheet_name in ("SUMMARY", "ISSUES"):
            worksheet = writer.sheets[sheet_name]
            worksheet.freeze_panes(1, 0)
            worksheet.set_row(0, None, header_format)
            worksheet.set_column(0, worksheet.dim_colmax, 22)
        writer.sheets["ISSUES"].set_column("E:E", 70)

    return output.getvalue()


def export_private_processed_csvs(
    index_df: pd.DataFrame,
    coeff_df: pd.DataFrame,
    component_df: pd.DataFrame,
    output_dir: str | Path,
) -> dict[str, Path]:
    """Export normalized private datasets and their validation workbook."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    index = normalize_private_ahsp_index(index_df)
    coefficients = normalize_private_coefficients(coeff_df)
    components = component_df[COMPONENT_MASTER_COLUMNS].copy()
    validation = validate_private_ahsp_dataset(
        index,
        coefficients,
        components,
    )

    paths = {
        "ahsp_index": output_path / "ahsp_index.csv",
        "ahsp_coefficients": output_path / "ahsp_coefficients_long.csv",
        "component_master": output_path / "component_master.csv",
        "validation_report": output_path / "validation_report.xlsx",
    }
    index.to_csv(paths["ahsp_index"], index=False, encoding="utf-8")
    coefficients.to_csv(
        paths["ahsp_coefficients"],
        index=False,
        encoding="utf-8",
    )
    components.to_csv(
        paths["component_master"],
        index=False,
        encoding="utf-8",
    )
    paths["validation_report"].write_bytes(
        create_private_validation_report(validation)
    )
    return paths
