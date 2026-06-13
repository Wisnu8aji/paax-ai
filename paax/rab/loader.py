"""Data loading and normalization for the RAB Lite workflow."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO

import pandas as pd

PROJECT_ITEM_COLUMNS = [
    "item_name",
    "quantity",
    "unit",
    "ahsp_code",
    "notes",
]

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "ahsp"
AHSP_INDEX_PATH = DATA_DIR / "ahsp_index.csv"
HSP_LIBRARY_PATH = DATA_DIR / "hsp_library_demo.csv"

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
    """Load the bundled synthetic AHSP index."""
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
    """Load the bundled synthetic HSP unit-price library."""
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
