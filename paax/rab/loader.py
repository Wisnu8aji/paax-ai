"""Data loading and normalization for the RAB Lite workflow."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import BinaryIO

import pandas as pd

from paax.rab.private_importer import (
    COMPONENT_MASTER_COLUMNS,
    PROCESSED_COEFFICIENT_COLUMNS,
    validate_private_ahsp_dataset,
)

PROJECT_ITEM_COLUMNS = [
    "item_name",
    "quantity",
    "unit",
    "ahsp_code",
    "notes",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data" / "ahsp"
AHSP_INDEX_PATH = DATA_DIR / "ahsp_index.csv"
HSP_LIBRARY_PATH = DATA_DIR / "hsp_library_demo.csv"
AHSP_MANIFEST_PATH = DATA_DIR / "ahsp_manifest.json"
PRIVATE_PROCESSED_DIR = (
    PROJECT_ROOT / "data_private" / "ahsp" / "processed"
)
PRIVATE_AHSP_INDEX_FILENAME = "ahsp_index.csv"
PRIVATE_COEFFICIENTS_FILENAME = "ahsp_coefficients_long.csv"
PRIVATE_COMPONENT_MASTER_FILENAME = "component_master.csv"
PRIVATE_VALIDATION_REPORT_FILENAME = "validation_report.xlsx"

COLUMN_ALIASES = {
    "item": "item_name",
    "item_name": "item_name",
    "nama_item": "item_name",
    "nama_pekerjaan": "item_name",
    "pekerjaan": "item_name",
    "quantity": "quantity",
    "qty": "quantity",
    "volume": "quantity",
    "unit": "unit",
    "satuan": "unit",
    "ahsp": "ahsp_code",
    "ahsp_code": "ahsp_code",
    "kode_ahsp": "ahsp_code",
    "notes": "notes",
    "note": "notes",
    "catatan": "notes",
}


def _validate_columns(
    dataframe: pd.DataFrame,
    required_columns: set[str],
    dataset_name: str,
) -> None:
    missing = sorted(required_columns.difference(dataframe.columns))
    if missing:
        raise ValueError(
            f"{dataset_name} is missing required columns: "
            f"{', '.join(missing)}"
        )


def load_ahsp_index(path: str | Path | None = None) -> pd.DataFrame:
    """Load an AHSP index from a path or the bundled synthetic demo."""
    dataframe = pd.read_csv(path or AHSP_INDEX_PATH, dtype=str)
    _validate_columns(
        dataframe,
        {
            "ahsp_code",
            "description",
            "unit",
            "division",
            "subdivision",
            "ahsp_type",
            "status",
            "source_page",
        },
        "AHSP index",
    )
    dataframe["ahsp_code"] = dataframe["ahsp_code"].str.strip().str.upper()
    return dataframe


def load_hsp_library(path: str | Path | None = None) -> pd.DataFrame:
    """Load an HSP library from a path or the bundled synthetic demo."""
    dataframe = pd.read_csv(path or HSP_LIBRARY_PATH)
    _validate_columns(
        dataframe,
        {
            "ahsp_code",
            "unit_price",
            "region",
            "year",
            "source_note",
            "is_verified",
        },
        "HSP library",
    )
    dataframe["ahsp_code"] = (
        dataframe["ahsp_code"].astype("string").str.strip().str.upper()
    )
    dataframe["unit_price"] = pd.to_numeric(
        dataframe["unit_price"], errors="coerce"
    )
    return dataframe


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path.resolve())


def _load_demo_bundle(
    requested_mode: str,
    fallback_warning: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    ahsp_index = load_ahsp_index(AHSP_INDEX_PATH)
    hsp_library = load_hsp_library(HSP_LIBRARY_PATH)
    with AHSP_MANIFEST_PATH.open(encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)

    metadata = {
        "requested_mode": requested_mode,
        "active_mode": "demo",
        "status": manifest["status"],
        "disclaimer": manifest["disclaimer"],
        "ahsp_index_path": _display_path(AHSP_INDEX_PATH),
        "hsp_library_path": _display_path(HSP_LIBRARY_PATH),
        "fallback_warning": fallback_warning,
    }
    return ahsp_index, hsp_library, metadata


def load_ahsp_data_bundle(
    requested_mode: str | None = None,
    private_processed_dir: str | Path | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Load demo or private AHSP data with a non-fatal demo fallback."""
    configured_mode = (
        requested_mode
        if requested_mode is not None
        else os.getenv("PAAX_AHSP_DATA_MODE", "demo")
    )
    normalized_mode = str(configured_mode).strip().lower() or "demo"
    if normalized_mode not in {"demo", "private"}:
        return _load_demo_bundle(
            normalized_mode,
            (
                "Unsupported PAAX_AHSP_DATA_MODE value "
                f"{configured_mode!r}; using demo data."
            ),
        )
    if normalized_mode == "demo":
        return _load_demo_bundle(normalized_mode)

    processed_dir = Path(private_processed_dir or PRIVATE_PROCESSED_DIR)
    index_path = processed_dir / PRIVATE_AHSP_INDEX_FILENAME
    coefficients_path = processed_dir / PRIVATE_COEFFICIENTS_FILENAME
    components_path = processed_dir / PRIVATE_COMPONENT_MASTER_FILENAME
    validation_report_path = (
        processed_dir / PRIVATE_VALIDATION_REPORT_FILENAME
    )
    required_paths = [
        index_path,
        coefficients_path,
        components_path,
        validation_report_path,
    ]
    missing_paths = [path for path in required_paths if not path.is_file()]
    if missing_paths:
        missing_names = ", ".join(path.name for path in missing_paths)
        return _load_demo_bundle(
            normalized_mode,
            (
                "Private AHSP mode was requested, but processed files are "
                f"missing ({missing_names}). Using public demo data."
            ),
        )

    try:
        ahsp_index = load_ahsp_index(index_path)
        coefficients = pd.read_csv(coefficients_path)
        components = pd.read_csv(components_path)
        report_summary = pd.read_excel(
            validation_report_path,
            sheet_name="SUMMARY",
        )
        report_issues = pd.read_excel(
            validation_report_path,
            sheet_name="ISSUES",
        )
        _validate_columns(
            report_summary,
            {"metric", "value"},
            "Private validation report summary",
        )
        _validate_columns(
            report_issues,
            {"severity", "code", "dataset", "reference", "message"},
            "Private validation report issues",
        )
        report_metrics = dict(
            zip(report_summary["metric"], report_summary["value"])
        )
        report_error_count = int(report_metrics.get("error_count", -1))
        if report_error_count != 0:
            raise ValueError(
                "private validation report contains "
                f"{report_error_count} error(s)"
            )
        _validate_columns(
            coefficients,
            set(PROCESSED_COEFFICIENT_COLUMNS),
            "Private AHSP coefficients",
        )
        _validate_columns(
            components,
            set(COMPONENT_MASTER_COLUMNS),
            "Private component master",
        )
        validation = validate_private_ahsp_dataset(
            ahsp_index,
            coefficients,
            components,
        )
        if not validation["is_valid"]:
            error_count = validation["summary"]["error_count"]
            raise ValueError(
                f"private dataset validation found {error_count} error(s)"
            )
        hsp_library = load_hsp_library(HSP_LIBRARY_PATH)
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        return _load_demo_bundle(
            normalized_mode,
            (
                "Private AHSP processed files could not be loaded "
                f"({exc}). Using public demo data."
            ),
        )

    metadata = {
        "requested_mode": normalized_mode,
        "active_mode": "private",
        "status": "PRIVATE_PROCESSED",
        "disclaimer": (
            "Private processed AHSP extraction data is active. HSP unit "
            "prices still come from the synthetic public demo library and "
            "must not be treated as official or professionally verified."
        ),
        "ahsp_index_path": _display_path(index_path),
        "hsp_library_path": _display_path(HSP_LIBRARY_PATH),
        "coefficients_path": _display_path(coefficients_path),
        "component_master_path": _display_path(components_path),
        "validation_report_path": _display_path(validation_report_path),
        "validation_issues": (
            report_issues.fillna("").to_dict(orient="records")
        ),
        "validation_warning_count": int(
            report_issues["severity"].astype("string").str.lower().eq(
                "warning"
            ).sum()
        ),
        "validation_info_count": int(
            report_issues["severity"].astype("string").str.lower().eq(
                "info"
            ).sum()
        ),
        "fallback_warning": None,
    }
    return ahsp_index, hsp_library, metadata


def normalize_project_item_columns(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize common Indonesian and English project-item headings."""
    normalized = dataframe.copy()
    normalized.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in normalized.columns
    ]
    normalized = normalized.rename(
        columns={
            column: COLUMN_ALIASES[column]
            for column in normalized.columns
            if column in COLUMN_ALIASES
        }
    )

    duplicate_columns = normalized.columns[normalized.columns.duplicated()]
    if len(duplicate_columns):
        duplicates = ", ".join(sorted(set(duplicate_columns)))
        raise ValueError(
            f"Project items contain duplicate normalized columns: {duplicates}"
        )

    for column in PROJECT_ITEM_COLUMNS:
        if column not in normalized:
            normalized[column] = pd.NA

    normalized = normalized[PROJECT_ITEM_COLUMNS].copy().reset_index(drop=True)
    for column in ("item_name", "unit", "ahsp_code", "notes"):
        normalized[column] = normalized[column].astype("string").str.strip()
    normalized["ahsp_code"] = normalized["ahsp_code"].str.upper()
    return normalized


def load_project_items(
    file_or_path: str | Path | BinaryIO,
) -> pd.DataFrame:
    """Load project items from CSV or Excel and normalize their columns."""
    filename = getattr(file_or_path, "name", str(file_or_path))
    suffix = Path(filename).suffix.lower()

    if hasattr(file_or_path, "seek"):
        file_or_path.seek(0)

    if suffix == ".csv":
        dataframe = pd.read_csv(file_or_path)
    elif suffix in {".xlsx", ".xlsm"}:
        dataframe = pd.read_excel(file_or_path)
    else:
        raise ValueError(
            "Project items must be supplied as a .csv, .xlsx, or .xlsm file."
        )

    return normalize_project_item_columns(dataframe)
