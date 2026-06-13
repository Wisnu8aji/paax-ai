"""Prepare private AHSP extraction workbooks for PAAX AI."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from paax.rab.private_importer import (  # noqa: E402
    build_private_component_master,
    export_private_processed_csvs,
    load_private_ahsp_index_excel,
    load_private_coeff_excel,
    validate_private_ahsp_dataset,
)

RAW_DIR = PROJECT_ROOT / "data_private" / "ahsp" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data_private" / "ahsp" / "processed"
PRIVATE_FILES = {
    "AHSP index": RAW_DIR / "ahsp_ck_index_2026_v02.xlsx",
    "Divisi 1-2 coefficients": (
        RAW_DIR / "ahsp_ck_coeff_div1_2_v02.xlsx"
    ),
    "Divisi 3 coefficients": (
        RAW_DIR / "ahsp_ck_coeff_div3_arch_v02.xlsx"
    ),
}


def main() -> int:
    """Prepare normalized private CSV files when all source files exist."""
    missing = [
        (label, path)
        for label, path in PRIVATE_FILES.items()
        if not path.is_file()
    ]
    if missing:
        print("Private AHSP preparation was not run.")
        print("Place the following private Excel files in:")
        print(f"  {RAW_DIR}")
        for label, path in missing:
            print(f"  - {label}: {path.name}")
        print("These files are private and must not be committed.")
        return 0

    try:
        index = load_private_ahsp_index_excel(PRIVATE_FILES["AHSP index"])
        div_1_2 = load_private_coeff_excel(
            PRIVATE_FILES["Divisi 1-2 coefficients"]
        )
        div_3 = load_private_coeff_excel(
            PRIVATE_FILES["Divisi 3 coefficients"]
        )
        coefficients = pd.concat([div_1_2, div_3], ignore_index=True)
        components = build_private_component_master([div_1_2, div_3])
        validation = validate_private_ahsp_dataset(
            index,
            coefficients,
            components,
        )
        output_paths = export_private_processed_csvs(
            index,
            coefficients,
            components,
            PROCESSED_DIR,
        )
    except (OSError, ValueError, ImportError) as exc:
        print(f"Private AHSP preparation failed: {exc}")
        return 1

    print("Private AHSP processed files:")
    for path in output_paths.values():
        print(f"  - {path}")
    summary = validation["summary"]
    print(
        "Validation: "
        f"{summary['error_count']} error(s), "
        f"{summary['warning_count']} warning(s)."
    )
    return 0 if validation["is_valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
