from io import BytesIO

import pandas as pd
import pytest

from paax.rab.loader import load_ahsp_data_bundle
from paax.rab.private_importer import (
    PRIVATE_COEFFICIENT_COLUMNS,
    PRIVATE_COEFFICIENT_SHEET,
    PRIVATE_INDEX_COLUMNS,
    PRIVATE_INDEX_SHEET,
    build_private_component_master,
    export_private_processed_csvs,
    load_private_ahsp_index_excel,
    load_private_coeff_excel,
    validate_private_ahsp_dataset,
)
from scripts import prepare_private_ahsp


def synthetic_private_index():
    return pd.DataFrame(
        [
            {
                "ahsp_code": " prv-001 ",
                "description": "Synthetic excavation item",
                "unit": "m3",
                "division": "Synthetic Division 1",
                "subdivision": "Synthetic earthwork",
                "sub_subdivision": "Synthetic manual work",
                "ahsp_type": "Synthetic AHSP",
                "status": "PRIVATE_TEST_UNVERIFIED",
                "source_page": "TEST-001",
                "raw_text": "Synthetic fixture text only",
                "confidence": 0.95,
                "notes": "Not official data",
            },
            {
                "ahsp_code": "PRV-002",
                "description": "Synthetic wall item",
                "unit": "m2",
                "division": "Synthetic Division 3",
                "subdivision": "Synthetic architecture",
                "sub_subdivision": "Synthetic wall",
                "ahsp_type": "Synthetic AHSP",
                "status": "PRIVATE_TEST_UNVERIFIED",
                "source_page": "TEST-002",
                "raw_text": "Synthetic fixture text only",
                "confidence": 0.9,
                "notes": "Not official data",
            },
        ],
        columns=PRIVATE_INDEX_COLUMNS,
    )


def synthetic_private_coefficients():
    return pd.DataFrame(
        [
            {
                "ahsp_code": "prv-001",
                "component_section": " Labor ",
                "component_no": "A.1",
                "component_name": "Synthetic worker",
                "component_code": "lab-test",
                "component_unit": "OH",
                "coefficient": 0.5,
                "source_page": "TEST-001",
                "raw_text": "Synthetic fixture text only",
                "confidence": 0.92,
                "notes": "Not official data",
            },
            {
                "ahsp_code": "PRV-002",
                "component_section": "material",
                "component_no": "B.1",
                "component_name": "Synthetic block",
                "component_code": "MAT-TEST",
                "component_unit": "unit",
                "coefficient": 8,
                "source_page": "TEST-002",
                "raw_text": "Synthetic fixture text only",
                "confidence": 0.91,
                "notes": "Not official data",
            },
        ],
        columns=PRIVATE_COEFFICIENT_COLUMNS,
    )


def write_workbook(path, sheet_name, dataframe):
    with pd.ExcelWriter(path, engine="xlsxwriter") as writer:
        dataframe.to_excel(writer, sheet_name=sheet_name, index=False)


def issue_codes(validation_result):
    return {issue["code"] for issue in validation_result["issues"]}


def test_private_index_excel_loading(tmp_path):
    workbook_path = tmp_path / "synthetic_private_index.xlsx"
    write_workbook(
        workbook_path,
        PRIVATE_INDEX_SHEET,
        synthetic_private_index(),
    )

    loaded = load_private_ahsp_index_excel(workbook_path)

    assert loaded.columns.tolist() == PRIVATE_INDEX_COLUMNS
    assert loaded["ahsp_code"].tolist() == ["PRV-001", "PRV-002"]
    assert loaded["confidence"].tolist() == [0.95, 0.9]


def test_private_coefficient_excel_loading(tmp_path):
    workbook_path = tmp_path / "synthetic_private_coefficients.xlsx"
    write_workbook(
        workbook_path,
        PRIVATE_COEFFICIENT_SHEET,
        synthetic_private_coefficients(),
    )

    loaded = load_private_coeff_excel(workbook_path)

    assert loaded.columns.tolist() == PRIVATE_COEFFICIENT_COLUMNS
    assert loaded["ahsp_code"].tolist() == ["PRV-001", "PRV-002"]
    assert loaded["component_section"].tolist() == ["labor", "material"]
    assert loaded["component_code"].tolist() == ["LAB-TEST", "MAT-TEST"]


def test_missing_required_sheet_raises_error(tmp_path):
    workbook_path = tmp_path / "missing_sheet.xlsx"
    write_workbook(workbook_path, "WRONG_SHEET", synthetic_private_index())

    with pytest.raises(ValueError, match=PRIVATE_INDEX_SHEET):
        load_private_ahsp_index_excel(workbook_path)


def test_missing_required_column_raises_error(tmp_path):
    workbook_path = tmp_path / "missing_column.xlsx"
    incomplete = synthetic_private_coefficients().drop(columns=["coefficient"])
    write_workbook(
        workbook_path,
        PRIVATE_COEFFICIENT_SHEET,
        incomplete,
    )

    with pytest.raises(ValueError, match="coefficient"):
        load_private_coeff_excel(workbook_path)


def test_duplicate_ahsp_code_detection():
    index = synthetic_private_index()
    index.loc[1, "ahsp_code"] = "PRV-001"
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    components = build_private_component_master(coefficients)

    validation = validate_private_ahsp_dataset(
        index,
        coefficients,
        components,
    )

    assert not validation["is_valid"]
    assert "DUPLICATE_AHSP_CODE" in issue_codes(validation)


def test_coefficient_code_not_found_in_index_detection():
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients()
    coefficients.loc[0, "ahsp_code"] = "PRV-UNKNOWN"
    components = build_private_component_master(coefficients)

    validation = validate_private_ahsp_dataset(
        index,
        coefficients,
        components,
    )

    assert not validation["is_valid"]
    assert (
        "COEFFICIENT_AHSP_CODE_NOT_FOUND" in issue_codes(validation)
    )


def test_processed_csv_export(tmp_path):
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients()
    components = build_private_component_master(coefficients)
    output_dir = tmp_path / "processed"

    paths = export_private_processed_csvs(
        index,
        coefficients,
        components,
        output_dir,
    )

    assert all(path.is_file() for path in paths.values())
    assert pd.read_csv(paths["ahsp_index"])["ahsp_code"].tolist() == [
        "PRV-001",
        "PRV-002",
    ]
    report = pd.ExcelFile(
        BytesIO(paths["validation_report"].read_bytes())
    )
    assert report.sheet_names == ["SUMMARY", "ISSUES"]


def test_private_mode_falls_back_to_demo_when_files_are_missing(tmp_path):
    ahsp_index, hsp_library, metadata = load_ahsp_data_bundle(
        requested_mode="private",
        private_processed_dir=tmp_path / "missing",
    )

    assert metadata["requested_mode"] == "private"
    assert metadata["active_mode"] == "demo"
    assert "processed files are missing" in metadata["fallback_warning"]
    assert not ahsp_index.empty
    assert not hsp_library.empty


def test_private_mode_loads_processed_synthetic_data(tmp_path):
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients()
    components = build_private_component_master(coefficients)
    processed_dir = tmp_path / "processed"
    export_private_processed_csvs(
        index,
        coefficients,
        components,
        processed_dir,
    )

    ahsp_index, hsp_library, metadata = load_ahsp_data_bundle(
        requested_mode="private",
        private_processed_dir=processed_dir,
    )

    assert metadata["active_mode"] == "private"
    assert metadata["fallback_warning"] is None
    assert ahsp_index["ahsp_code"].tolist() == ["PRV-001", "PRV-002"]
    assert not hsp_library.empty


def test_private_mode_falls_back_when_processed_validation_fails(tmp_path):
    index = synthetic_private_index()
    index.loc[1, "ahsp_code"] = "PRV-001"
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    components = build_private_component_master(coefficients)
    processed_dir = tmp_path / "invalid_processed"
    export_private_processed_csvs(
        index,
        coefficients,
        components,
        processed_dir,
    )

    ahsp_index, _, metadata = load_ahsp_data_bundle(
        requested_mode="private",
        private_processed_dir=processed_dir,
    )

    assert metadata["active_mode"] == "demo"
    assert "validation found" in metadata["fallback_warning"]
    assert not ahsp_index["ahsp_code"].eq("PRV-001").all()


def test_prepare_private_ahsp_script_with_synthetic_workbooks(
    tmp_path,
    monkeypatch,
):
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    index_path = raw_dir / "ahsp_ck_index_2026_v02.xlsx"
    div_1_2_path = raw_dir / "ahsp_ck_coeff_div1_2_v02.xlsx"
    div_3_path = raw_dir / "ahsp_ck_coeff_div3_arch_v02.xlsx"
    write_workbook(
        index_path,
        PRIVATE_INDEX_SHEET,
        synthetic_private_index(),
    )
    coefficients = synthetic_private_coefficients()
    write_workbook(
        div_1_2_path,
        PRIVATE_COEFFICIENT_SHEET,
        coefficients.iloc[[0]],
    )
    write_workbook(
        div_3_path,
        PRIVATE_COEFFICIENT_SHEET,
        coefficients.iloc[[1]],
    )
    processed_dir = tmp_path / "processed"
    monkeypatch.setattr(
        prepare_private_ahsp,
        "PRIVATE_FILES",
        {
            "AHSP index": index_path,
            "Divisi 1-2 coefficients": div_1_2_path,
            "Divisi 3 coefficients": div_3_path,
        },
    )
    monkeypatch.setattr(
        prepare_private_ahsp,
        "PROCESSED_DIR",
        processed_dir,
    )

    exit_code = prepare_private_ahsp.main()

    assert exit_code == 0
    assert (processed_dir / "ahsp_index.csv").is_file()
    assert (processed_dir / "ahsp_coefficients_long.csv").is_file()
    assert (processed_dir / "component_master.csv").is_file()
    assert (processed_dir / "validation_report.xlsx").is_file()
