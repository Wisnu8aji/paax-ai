"""Import and validate private AHSP extraction workbooks."""

from __future__ import annotations

from collections.abc import Iterable
from io import BytesIO
from pathlib import Path
import re
from typing import Any

import pandas as pd

PRIVATE_INDEX_SHEET = "1_AHSP_INDEX"
PRIVATE_AHSP_ITEMS_SHEET = "1_AHSP_ITEMS"
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

PRIVATE_AHSP_ITEMS_COLUMNS = [
    "ahsp_code",
    "description",
    "unit",
    "division",
    "subdivision",
    "sub_subdivision",
    "source_page_start",
    "source_page_end",
    "has_labor",
    "has_material",
    "has_equipment",
    "has_formula_block",
    "confidence",
    "notes",
]

PRIVATE_INDEX_METADATA_COLUMNS = [
    "index_row_source",
    "source_workbook_scope",
    "supplement_reason",
]

COEFFICIENT_RECONCILIATION_COLUMNS = [
    "source_ahsp_code",
    "ahsp_code_reconciliation_status",
    "ahsp_code_reconciliation_note",
]

PROCESSED_COEFFICIENT_COLUMNS = [
    "source_ahsp_code",
    *PRIVATE_COEFFICIENT_COLUMNS,
    "ahsp_code_reconciliation_status",
    "ahsp_code_reconciliation_note",
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

RECONCILIATION_STATUSES = (
    "exact_match",
    "suffix_stripped_match",
    "unresolved",
)

TRAILING_DOT_LETTER_SUFFIX = re.compile(r"\.([A-D])$", re.IGNORECASE)
DIVISION_1_TO_3_PATTERN = re.compile(
    r"\b(?:divisi|division)\s*([1-3])\b",
    re.IGNORECASE,
)
NUMERIC_DIVISION_1_TO_3_PATTERN = re.compile(r"^\s*[1-3](?:\b|[._-])")

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


def _normalize_numeric_or_text(series: pd.Series) -> pd.Series:
    """Preserve numeric values while retaining meaningful text markers."""
    text = series.astype("string").str.strip().replace("", pd.NA)
    numeric = pd.to_numeric(text, errors="coerce")
    result = pd.Series(pd.NA, index=series.index, dtype="object")
    numeric_mask = numeric.notna()
    result.loc[numeric_mask] = numeric.loc[numeric_mask]
    result.loc[~numeric_mask & text.notna()] = text.loc[
        ~numeric_mask & text.notna()
    ]
    return result


def load_private_ahsp_index_excel(path: str | Path) -> pd.DataFrame:
    """Load and normalize the required private AHSP index worksheet."""
    dataframe = _load_required_sheet(
        path,
        PRIVATE_INDEX_SHEET,
        PRIVATE_INDEX_COLUMNS,
        "Private AHSP index",
    )
    return normalize_private_ahsp_index(dataframe)


def load_private_coeff_excel(
    path: str | Path,
    include_ahsp_items: bool = False,
    source_workbook_scope: str | None = None,
) -> pd.DataFrame | tuple[pd.DataFrame, pd.DataFrame]:
    """Load coefficients and optionally the workbook's AHSP item index."""
    coefficients = _load_required_sheet(
        path,
        PRIVATE_COEFFICIENT_SHEET,
        PRIVATE_COEFFICIENT_COLUMNS,
        "Private AHSP coefficients",
    )
    normalized_coefficients = normalize_private_coefficients(coefficients)
    if not include_ahsp_items:
        return normalized_coefficients

    workbook = pd.ExcelFile(path)
    if PRIVATE_AHSP_ITEMS_SHEET not in workbook.sheet_names:
        ahsp_items = pd.DataFrame(columns=PRIVATE_AHSP_ITEMS_COLUMNS)
    else:
        ahsp_items = pd.read_excel(
            workbook,
            sheet_name=PRIVATE_AHSP_ITEMS_SHEET,
            dtype=object,
        )
        ahsp_items = normalize_private_ahsp_items(ahsp_items)
    ahsp_items["source_workbook_scope"] = source_workbook_scope
    return normalized_coefficients, ahsp_items


def normalize_private_ahsp_index(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize private AHSP index headings, text fields, and confidence."""
    inherited_attrs = dict(dataframe.attrs)
    normalized = _normalize_column_names(dataframe)
    _require_columns(
        normalized,
        PRIVATE_INDEX_COLUMNS,
        "Private AHSP index",
    )
    optional_columns = [
        column
        for column in PRIVATE_INDEX_METADATA_COLUMNS
        if column in normalized.columns
    ]
    normalized = normalized[
        PRIVATE_INDEX_COLUMNS + optional_columns
    ].copy()
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
    normalized["confidence"] = _normalize_numeric_or_text(
        normalized["confidence"]
    )
    for column in optional_columns:
        normalized[column] = (
            normalized[column]
            .astype("string")
            .str.strip()
            .replace("", pd.NA)
        )
    normalized = normalized.reset_index(drop=True)
    normalized.attrs.update(inherited_attrs)
    return normalized


def normalize_private_ahsp_items(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize the optional AHSP item sheet from coefficient workbooks."""
    normalized = _normalize_column_names(dataframe)
    _require_columns(
        normalized,
        PRIVATE_AHSP_ITEMS_COLUMNS,
        "Private coefficient AHSP items",
    )
    optional_columns = (
        ["source_workbook_scope"]
        if "source_workbook_scope" in normalized.columns
        else []
    )
    normalized = normalized[
        PRIVATE_AHSP_ITEMS_COLUMNS + optional_columns
    ].copy()
    _clean_text_columns(
        normalized,
        [
            "ahsp_code",
            "description",
            "unit",
            "division",
            "subdivision",
            "sub_subdivision",
            "source_page_start",
            "source_page_end",
            "notes",
        ],
    )
    normalized["ahsp_code"] = normalized["ahsp_code"].str.upper()
    normalized["confidence"] = _normalize_numeric_or_text(
        normalized["confidence"]
    )
    if "source_workbook_scope" in normalized.columns:
        normalized["source_workbook_scope"] = (
            normalized["source_workbook_scope"]
            .astype("string")
            .str.strip()
            .replace("", pd.NA)
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
    optional_columns = [
        column
        for column in COEFFICIENT_RECONCILIATION_COLUMNS
        if column in normalized.columns
    ]
    normalized = normalized[
        PRIVATE_COEFFICIENT_COLUMNS + optional_columns
    ].copy()
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
    normalized["coefficient"] = _normalize_numeric_or_text(
        normalized["coefficient"]
    )
    normalized["confidence"] = _normalize_numeric_or_text(
        normalized["confidence"]
    )

    if "source_ahsp_code" in normalized.columns:
        normalized["source_ahsp_code"] = (
            normalized["source_ahsp_code"]
            .astype("string")
            .str.strip()
            .str.upper()
            .replace("", pd.NA)
        )
    if "ahsp_code_reconciliation_status" in normalized.columns:
        normalized["ahsp_code_reconciliation_status"] = (
            normalized["ahsp_code_reconciliation_status"]
            .astype("string")
            .str.strip()
            .str.lower()
            .replace("", pd.NA)
        )
    if "ahsp_code_reconciliation_note" in normalized.columns:
        normalized["ahsp_code_reconciliation_note"] = (
            normalized["ahsp_code_reconciliation_note"]
            .astype("string")
            .str.strip()
            .replace("", pd.NA)
        )
    return normalized.reset_index(drop=True)


def reconcile_coefficient_ahsp_codes(
    coeff_df: pd.DataFrame,
    index_df: pd.DataFrame,
) -> pd.DataFrame:
    """Reconcile coefficient AHSP codes against the normalized index."""
    coefficients = normalize_private_coefficients(coeff_df)
    index = normalize_private_ahsp_index(index_df)
    known_codes = set(index["ahsp_code"].dropna())

    if "source_ahsp_code" in coefficients.columns:
        source_codes = coefficients["source_ahsp_code"].where(
            coefficients["source_ahsp_code"].notna(),
            coefficients["ahsp_code"],
        )
    else:
        source_codes = coefficients["ahsp_code"]
    source_codes = (
        source_codes.astype("string").str.strip().str.upper().replace("", pd.NA)
    )

    resolved_codes: list[Any] = []
    statuses: list[str] = []
    notes: list[str] = []
    for source_code in source_codes:
        if pd.isna(source_code):
            resolved_codes.append(pd.NA)
            statuses.append("unresolved")
            notes.append("Source AHSP code is empty.")
            continue

        source_code_text = str(source_code)
        if source_code_text in known_codes:
            resolved_codes.append(source_code_text)
            statuses.append("exact_match")
            notes.append("Source AHSP code matched the index exactly.")
            continue

        suffix_match = TRAILING_DOT_LETTER_SUFFIX.search(source_code_text)
        base_code = (
            source_code_text[: suffix_match.start()]
            if suffix_match
            else None
        )
        if base_code and base_code in known_codes:
            resolved_codes.append(base_code)
            statuses.append("suffix_stripped_match")
            notes.append(
                "Trailing dot-letter suffix was stripped because the base "
                f"AHSP code {base_code} exists in the index."
            )
            continue

        resolved_codes.append(source_code_text)
        statuses.append("unresolved")
        notes.append(
            "Source AHSP code was not found in the index and no supported "
            "suffix reconciliation matched."
        )

    coefficients["source_ahsp_code"] = source_codes
    coefficients["ahsp_code"] = pd.Series(
        resolved_codes,
        dtype="string",
    )
    coefficients["ahsp_code_reconciliation_status"] = statuses
    coefficients["ahsp_code_reconciliation_note"] = notes

    ordered_columns = [
        column
        for column in PROCESSED_COEFFICIENT_COLUMNS
        if column in coefficients.columns
    ]
    return coefficients[ordered_columns].reset_index(drop=True)


def supplement_index_from_private_ahsp_items(
    index_df: pd.DataFrame,
    ahsp_items_dfs: Iterable[pd.DataFrame] | pd.DataFrame,
    coeff_df: pd.DataFrame,
) -> pd.DataFrame:
    """Supplement unresolved coefficient codes from workbook AHSP items."""
    index = normalize_private_ahsp_index(index_df)
    coefficients = reconcile_coefficient_ahsp_codes(coeff_df, index)
    unresolved_codes = set(
        coefficients.loc[
            coefficients["ahsp_code_reconciliation_status"].eq("unresolved"),
            "source_ahsp_code",
        ].dropna()
    )

    if isinstance(ahsp_items_dfs, pd.DataFrame):
        item_frames = [ahsp_items_dfs]
    else:
        item_frames = list(ahsp_items_dfs)

    normalized_item_frames = []
    for item_frame in item_frames:
        if item_frame.empty:
            continue
        normalized_item_frames.append(
            normalize_private_ahsp_items(item_frame)
        )

    inherited_issues = list(
        index.attrs.get("supplementation_issues", [])
    )
    inherited_rows = list(
        index.attrs.get("supplemented_index_rows", [])
    )
    if not unresolved_codes or not normalized_item_frames:
        index.attrs["supplementation_issues"] = inherited_issues
        index.attrs["supplemented_index_rows"] = inherited_rows
        return index

    all_items = pd.concat(normalized_item_frames, ignore_index=True)
    matched_items = all_items[
        all_items["ahsp_code"].isin(unresolved_codes)
    ].copy()
    if matched_items.empty:
        index.attrs["supplementation_issues"] = inherited_issues
        index.attrs["supplemented_index_rows"] = inherited_rows
        return index

    supplementation_issues = list(inherited_issues)
    supplemental_rows = list(inherited_rows)
    new_index_rows: list[dict[str, Any]] = []
    supplement_reason = (
        "Supplemented from coefficient AHSP_ITEMS because code was missing "
        "from AHSP_INDEX extraction."
    )
    for ahsp_code, group in matched_items.groupby(
        "ahsp_code",
        sort=True,
        dropna=False,
    ):
        if len(group) > 1:
            supplementation_issues.append(
                _issue(
                    "warning",
                    "DUPLICATE_AHSP_ITEMS_CODE",
                    "ahsp_items",
                    str(ahsp_code),
                    (
                        "Multiple AHSP_ITEMS rows matched the unresolved "
                        "coefficient code. The first row was used."
                    ),
                )
            )

        item = group.iloc[0]
        source_page = (
            item["source_page_start"]
            if pd.notna(item["source_page_start"])
            else item["source_page_end"]
        )
        source_scope = (
            item.get("source_workbook_scope")
            if "source_workbook_scope" in item.index
            else pd.NA
        )
        supplemental_row = {
            "ahsp_code": item["ahsp_code"],
            "description": item["description"],
            "unit": item["unit"],
            "division": item["division"],
            "subdivision": item["subdivision"],
            "sub_subdivision": item["sub_subdivision"],
            "ahsp_type": "Supplemented AHSP item",
            "status": "PRIVATE_SUPPLEMENTED",
            "source_page": source_page,
            "raw_text": pd.NA,
            "confidence": "Supplemented",
            "notes": supplement_reason,
            "index_row_source": "ahsp_items_supplement",
            "source_workbook_scope": source_scope,
            "supplement_reason": supplement_reason,
        }
        new_index_rows.append(supplemental_row)
        supplemental_rows.append(
            {
                "ahsp_code": item["ahsp_code"],
                "description": item["description"],
                "unit": item["unit"],
                "division": item["division"],
                "subdivision": item["subdivision"],
                "source_page": source_page,
                "supplement_reason": supplement_reason,
                "source_workbook_scope": source_scope,
            }
        )
        supplementation_issues.append(
            _issue(
                "warning",
                "COEFFICIENT_AHSP_CODE_SUPPLEMENTED_FROM_ITEMS",
                "ahsp_index",
                str(ahsp_code),
                (
                    "Missing AHSP index code was supplemented from the "
                    "coefficient workbook AHSP_ITEMS sheet."
                ),
            )
        )

    supplemented = pd.concat(
        [index, pd.DataFrame(new_index_rows)],
        ignore_index=True,
    )
    supplemented = normalize_private_ahsp_index(supplemented)
    supplemented.attrs.update(index.attrs)
    supplemented.attrs["supplementation_issues"] = supplementation_issues
    supplemented.attrs["supplemented_index_rows"] = supplemental_rows
    return supplemented


def _normalized_comparison_value(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().casefold()


def _is_division_1_to_3(values: Iterable[Any]) -> bool:
    return any(
        DIVISION_1_TO_3_PATTERN.search(str(value).strip())
        or NUMERIC_DIVISION_1_TO_3_PATTERN.search(str(value).strip())
        for value in values
        if not pd.isna(value)
    )


def deduplicate_private_ahsp_index(
    index_df: pd.DataFrame,
) -> pd.DataFrame:
    """Keep canonical index rows and attach duplicate trace metadata."""
    inherited_issues = list(
        index_df.attrs.get("deduplication_issues", [])
    )
    inherited_rows = list(
        index_df.attrs.get("duplicate_index_rows", [])
    )
    inherited_supplementation_issues = list(
        index_df.attrs.get("supplementation_issues", [])
    )
    inherited_supplemented_rows = list(
        index_df.attrs.get("supplemented_index_rows", [])
    )
    index = normalize_private_ahsp_index(index_df)
    duplicate_mask = (
        index["ahsp_code"].notna()
        & index["ahsp_code"].duplicated(keep=False)
    )
    duplicate_rows = index.loc[duplicate_mask].copy()
    issues: list[dict[str, str]] = []
    report_rows: list[dict[str, Any]] = []

    for ahsp_code, group in duplicate_rows.groupby(
        "ahsp_code",
        sort=True,
        dropna=False,
    ):
        description_values = {
            _normalized_comparison_value(value)
            for value in group["description"]
        }
        unit_values = {
            _normalized_comparison_value(value)
            for value in group["unit"]
        }
        identity_fields = [
            "description",
            "unit",
            "division",
            "subdivision",
        ]
        identical_identity = all(
            len(
                {
                    _normalized_comparison_value(value)
                    for value in group[column]
                }
            )
            == 1
            for column in identity_fields
        )
        has_description_or_unit_conflict = (
            len(description_values) > 1 or len(unit_values) > 1
        )
        issue_code = (
            "DUPLICATE_AHSP_CODE_CONFLICT"
            if has_description_or_unit_conflict
            else "DUPLICATE_AHSP_CODE_DEDUPED"
        )
        if has_description_or_unit_conflict:
            message = (
                "Duplicate AHSP rows conflict in description or unit. "
                "The first row was kept as the canonical processed row."
            )
        elif identical_identity:
            message = (
                "Duplicate AHSP rows have identical core identity fields. "
                "The first row was kept as the canonical processed row."
            )
        else:
            message = (
                "Duplicate AHSP rows share description and unit but differ "
                "in division metadata. The first row was kept."
            )
        issues.append(
            _issue(
                "warning",
                issue_code,
                "ahsp_index",
                str(ahsp_code),
                message,
            )
        )

        canonical_index = group.index[0]
        for row_index, row in group.iterrows():
            report_row = row.to_dict()
            report_row.update(
                {
                    "source_row_number": int(row_index + 2),
                    "is_canonical_row": row_index == canonical_index,
                    "duplicate_issue_code": issue_code,
                    "duplicate_core_identity_identical": identical_identity,
                    "duplicate_description_or_unit_conflict": (
                        has_description_or_unit_conflict
                    ),
                    "duplicate_affects_division_1_to_3": (
                        _is_division_1_to_3(group["division"])
                    ),
                }
            )
            report_rows.append(report_row)

    deduplicated = (
        index.drop_duplicates("ahsp_code", keep="first")
        .reset_index(drop=True)
    )
    deduplicated.attrs["deduplication_issues"] = (
        issues or inherited_issues
    )
    deduplicated.attrs["duplicate_index_rows"] = (
        report_rows or inherited_rows
    )
    deduplicated.attrs["supplementation_issues"] = (
        inherited_supplementation_issues
    )
    deduplicated.attrs["supplemented_index_rows"] = (
        inherited_supplemented_rows
    )
    return deduplicated


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
    """Validate reconciled private AHSP data and return structured issues."""
    index = deduplicate_private_ahsp_index(index_df)
    coefficients = reconcile_coefficient_ahsp_codes(coeff_df, index)
    components = component_df.copy()
    _require_columns(
        components,
        COMPONENT_MASTER_COLUMNS,
        "Private component master",
    )

    issues: list[dict[str, str]] = []
    duplicate_index_rows = list(
        index.attrs.get("duplicate_index_rows", [])
    )
    supplemented_index_rows = list(
        index.attrs.get("supplemented_index_rows", [])
    )
    if not supplemented_index_rows and "index_row_source" in index.columns:
        supplemented_rows_df = index[
            index["index_row_source"].eq("ahsp_items_supplement")
        ]
        for _, row in supplemented_rows_df.iterrows():
            supplemented_index_rows.append(
                {
                    "ahsp_code": row["ahsp_code"],
                    "description": row["description"],
                    "unit": row["unit"],
                    "division": row["division"],
                    "subdivision": row["subdivision"],
                    "source_page": row["source_page"],
                    "supplement_reason": row.get("supplement_reason"),
                    "source_workbook_scope": row.get(
                        "source_workbook_scope"
                    ),
                }
            )

    coefficient_codes_used = set(coefficients["ahsp_code"].dropna())
    duplicate_rows_by_code: dict[str, list[dict[str, Any]]] = {}
    for duplicate_row in duplicate_index_rows:
        duplicate_rows_by_code.setdefault(
            str(duplicate_row["ahsp_code"]),
            [],
        ).append(duplicate_row)

    for duplicate_issue in index.attrs.get("deduplication_issues", []):
        issue = dict(duplicate_issue)
        ahsp_code = issue["reference"]
        duplicate_rows = duplicate_rows_by_code.get(ahsp_code, [])
        affects_division_1_to_3 = any(
            bool(row.get("duplicate_affects_division_1_to_3"))
            for row in duplicate_rows
        )
        is_used = ahsp_code in coefficient_codes_used
        if (
            issue["code"] == "DUPLICATE_AHSP_CODE_CONFLICT"
            and affects_division_1_to_3
            and is_used
        ):
            issue["severity"] = "error"
            issue["message"] += (
                " This unresolved conflict affects a Divisi 1-3 AHSP code "
                "used by coefficient rows."
            )
        elif issue["code"] == "DUPLICATE_AHSP_CODE_CONFLICT":
            issue["message"] += (
                " It is non-blocking because it does not affect a Divisi "
                "1-3 AHSP code used by coefficient rows."
            )
        issues.append(issue)

    supplementation_issues = list(
        index.attrs.get("supplementation_issues", [])
    )
    supplemented_issue_references = {
        issue["reference"]
        for issue in supplementation_issues
        if issue["code"]
        == "COEFFICIENT_AHSP_CODE_SUPPLEMENTED_FROM_ITEMS"
    }
    for supplemented_row in supplemented_index_rows:
        ahsp_code = str(supplemented_row["ahsp_code"])
        if ahsp_code not in supplemented_issue_references:
            supplementation_issues.append(
                _issue(
                    "warning",
                    "COEFFICIENT_AHSP_CODE_SUPPLEMENTED_FROM_ITEMS",
                    "ahsp_index",
                    ahsp_code,
                    (
                        "Missing AHSP index code was supplemented from the "
                        "coefficient workbook AHSP_ITEMS sheet."
                    ),
                )
            )
    issues.extend(supplementation_issues)

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

    source_codes = coefficients["source_ahsp_code"]
    missing_source_codes = source_codes.isna()
    for row_index in coefficients.index[missing_source_codes]:
        issues.append(
            _issue(
                "error",
                "MISSING_COEFFICIENT_AHSP_CODE",
                "ahsp_coefficients_long",
                f"row {row_index + 2}",
                "Coefficient AHSP code is empty.",
            )
        )

    reconciled_rows = coefficients[
        coefficients["ahsp_code_reconciliation_status"].eq(
            "suffix_stripped_match"
        )
    ]
    for source_code, group in reconciled_rows.groupby(
        "source_ahsp_code",
        sort=True,
        dropna=False,
    ):
        resolved_code = str(group.iloc[0]["ahsp_code"])
        issues.append(
            _issue(
                "warning",
                "COEFFICIENT_AHSP_CODE_RECONCILED",
                "ahsp_coefficients_long",
                str(source_code),
                (
                    f"Coefficient AHSP code was reconciled to {resolved_code} "
                    "by stripping a trailing dot-letter suffix."
                ),
            )
        )

    unresolved_rows = coefficients[
        coefficients["ahsp_code_reconciliation_status"].eq("unresolved")
        & ~missing_source_codes
    ]
    for source_code in sorted(
        unresolved_rows["source_ahsp_code"].dropna().unique()
    ):
        issues.append(
            _issue(
                "error",
                "COEFFICIENT_AHSP_CODE_NOT_FOUND",
                "ahsp_coefficients_long",
                str(source_code),
                (
                    "Coefficient AHSP code remains unresolved after "
                    "supported reconciliation."
                ),
            )
        )

    exact_match_count = int(
        coefficients["ahsp_code_reconciliation_status"]
        .eq("exact_match")
        .sum()
    )
    if exact_match_count:
        issues.append(
            _issue(
                "info",
                "COEFFICIENT_AHSP_CODE_EXACT_MATCH",
                "ahsp_coefficients_long",
                f"{exact_match_count} row(s)",
                "Coefficient AHSP codes matched the index exactly.",
            )
        )

    invalid_reconciliation_statuses = sorted(
        set(
            coefficients[
                "ahsp_code_reconciliation_status"
            ].dropna()
        ).difference(RECONCILIATION_STATUSES)
    )
    for status in invalid_reconciliation_statuses:
        issues.append(
            _issue(
                "error",
                "INVALID_RECONCILIATION_STATUS",
                "ahsp_coefficients_long",
                str(status),
                "Coefficient reconciliation status is not supported.",
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

    reconciliation_summary = []
    reconciliation_counts = coefficients[
        "ahsp_code_reconciliation_status"
    ].value_counts(dropna=False)
    for status in RECONCILIATION_STATUSES:
        reconciliation_summary.append(
            {
                "status": status,
                "row_count": int(reconciliation_counts.get(status, 0)),
            }
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
    info_count = (
        int(issue_df["severity"].eq("info").sum())
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
            "info_count": info_count,
            "duplicate_index_row_count": int(len(duplicate_index_rows)),
            "supplemented_index_row_count": int(
                len(supplemented_index_rows)
            ),
            "reconciled_coefficient_row_count": int(
                reconciliation_counts.get("suffix_stripped_match", 0)
            ),
            "unresolved_coefficient_row_count": int(
                reconciliation_counts.get("unresolved", 0)
            ),
        },
        "issues": issues,
        "reconciliation_summary": reconciliation_summary,
        "duplicate_index_rows": duplicate_index_rows,
        "supplemented_index_rows": supplemented_index_rows,
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
    reconciliation_df = pd.DataFrame(
        validation_result.get("reconciliation_summary", []),
        columns=["status", "row_count"],
    )
    duplicate_rows_df = pd.DataFrame(
        validation_result.get("duplicate_index_rows", [])
    )
    supplemented_rows_df = pd.DataFrame(
        validation_result.get("supplemented_index_rows", []),
        columns=[
            "ahsp_code",
            "description",
            "unit",
            "division",
            "subdivision",
            "source_page",
            "supplement_reason",
            "source_workbook_scope",
        ],
    )

    with pd.ExcelWriter(
        output,
        engine="xlsxwriter",
        engine_kwargs=EXCEL_WRITER_OPTIONS,
    ) as writer:
        summary_df.to_excel(writer, sheet_name="SUMMARY", index=False)
        issues_df.to_excel(writer, sheet_name="ISSUES", index=False)
        reconciliation_df.to_excel(
            writer,
            sheet_name="RECONCILIATION_SUMMARY",
            index=False,
        )
        supplemented_rows_df.to_excel(
            writer,
            sheet_name="SUPPLEMENTED_INDEX_ROWS",
            index=False,
        )
        if not duplicate_rows_df.empty:
            duplicate_rows_df.to_excel(
                writer,
                sheet_name="DUPLICATE_INDEX_ROWS",
                index=False,
            )
        workbook = writer.book
        header_format = workbook.add_format(
            {
                "bold": True,
                "font_color": "white",
                "bg_color": "#1F4E78",
                "border": 1,
            }
        )
        report_sheet_names = [
            "SUMMARY",
            "ISSUES",
            "RECONCILIATION_SUMMARY",
            "SUPPLEMENTED_INDEX_ROWS",
        ]
        if not duplicate_rows_df.empty:
            report_sheet_names.append("DUPLICATE_INDEX_ROWS")
        for sheet_name in report_sheet_names:
            worksheet = writer.sheets[sheet_name]
            worksheet.freeze_panes(1, 0)
            worksheet.set_row(0, None, header_format)
            worksheet.set_column(0, worksheet.dim_colmax, 22)
        writer.sheets["ISSUES"].set_column("E:E", 70)
        writer.sheets["SUPPLEMENTED_INDEX_ROWS"].set_column("B:B", 42)
        writer.sheets["SUPPLEMENTED_INDEX_ROWS"].set_column("G:G", 72)
        if not duplicate_rows_df.empty:
            writer.sheets["DUPLICATE_INDEX_ROWS"].set_column("J:J", 70)

    return output.getvalue()


def export_private_processed_csvs(
    index_df: pd.DataFrame,
    coeff_df: pd.DataFrame,
    component_df: pd.DataFrame,
    output_dir: str | Path,
    validation_result: dict[str, Any] | None = None,
) -> dict[str, Path]:
    """Export normalized private datasets and their validation workbook."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    index = deduplicate_private_ahsp_index(index_df)
    coefficients = reconcile_coefficient_ahsp_codes(coeff_df, index)
    components = component_df[COMPONENT_MASTER_COLUMNS].copy()
    validation = (
        validation_result
        if validation_result is not None
        else validate_private_ahsp_dataset(
            index,
            coefficients,
            components,
        )
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
