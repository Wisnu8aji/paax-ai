from io import BytesIO

import pandas as pd
import pytest

from paax.rab.loader import load_ahsp_data_bundle
from paax.rab.private_importer import (
    PRIVATE_AHSP_ITEMS_COLUMNS,
    PRIVATE_AHSP_ITEMS_SHEET,
    PRIVATE_COEFFICIENT_COLUMNS,
    PRIVATE_COEFFICIENT_SHEET,
    PRIVATE_INDEX_COLUMNS,
    PRIVATE_INDEX_SHEET,
    build_private_component_master,
    deduplicate_private_ahsp_index,
    export_private_processed_csvs,
    load_private_ahsp_index_excel,
    load_private_coeff_excel,
    reconcile_coefficient_ahsp_codes,
    supplement_index_from_private_ahsp_items,
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


def synthetic_private_ahsp_items():
    return pd.DataFrame(
        [
            {
                "ahsp_code": "PRV-MISSING",
                "description": "Synthetic supplemented item",
                "unit": "m2",
                "division": "Synthetic Division 2",
                "subdivision": "Synthetic supplemental work",
                "sub_subdivision": "Synthetic item",
                "source_page_start": "TEST-010",
                "source_page_end": "TEST-011",
                "has_labor": True,
                "has_material": True,
                "has_equipment": False,
                "has_formula_block": False,
                "confidence": 0.88,
                "notes": "Synthetic AHSP_ITEMS fixture only",
            }
        ],
        columns=PRIVATE_AHSP_ITEMS_COLUMNS,
    )


def write_workbook(path, sheet_name, dataframe):
    with pd.ExcelWriter(path, engine="xlsxwriter") as writer:
        dataframe.to_excel(writer, sheet_name=sheet_name, index=False)


def write_coefficient_workbook(path, coefficients, ahsp_items):
    with pd.ExcelWriter(path, engine="xlsxwriter") as writer:
        ahsp_items.to_excel(
            writer,
            sheet_name=PRIVATE_AHSP_ITEMS_SHEET,
            index=False,
        )
        coefficients.to_excel(
            writer,
            sheet_name=PRIVATE_COEFFICIENT_SHEET,
            index=False,
        )


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


def test_private_coefficient_excel_optionally_loads_ahsp_items(tmp_path):
    workbook_path = tmp_path / "synthetic_coefficients_with_items.xlsx"
    write_coefficient_workbook(
        workbook_path,
        synthetic_private_coefficients(),
        synthetic_private_ahsp_items(),
    )

    coefficients, ahsp_items = load_private_coeff_excel(
        workbook_path,
        include_ahsp_items=True,
        source_workbook_scope="div1_2",
    )

    assert len(coefficients) == 2
    assert ahsp_items["ahsp_code"].tolist() == ["PRV-MISSING"]
    assert ahsp_items["source_workbook_scope"].tolist() == ["div1_2"]


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
    index = pd.concat(
        [
            synthetic_private_index(),
            synthetic_private_index().iloc[[0]],
        ],
        ignore_index=True,
    )
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    components = build_private_component_master(coefficients)
    deduplicated = deduplicate_private_ahsp_index(index)

    validation = validate_private_ahsp_dataset(
        deduplicated,
        coefficients,
        components,
    )

    assert validation["is_valid"]
    assert len(deduplicated) == 2
    assert (
        "DUPLICATE_AHSP_CODE_DEDUPED" in issue_codes(validation)
    )
    assert validation["summary"]["warning_count"] == 1
    assert len(validation["duplicate_index_rows"]) == 2


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
    assert report.sheet_names == [
        "SUMMARY",
        "ISSUES",
        "RECONCILIATION_SUMMARY",
        "SUPPLEMENTED_INDEX_ROWS",
    ]


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
    assert "validation report contains" in metadata["fallback_warning"]
    assert not ahsp_index["ahsp_code"].eq("PRV-001").all()


@pytest.mark.parametrize("suffix", ["A", "B", "C", "D"])
def test_suffix_reconciliation_matches_existing_base_code(suffix):
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    coefficients.loc[0, "ahsp_code"] = f"PRV-001.{suffix}"

    reconciled = reconcile_coefficient_ahsp_codes(coefficients, index)

    assert reconciled.loc[0, "source_ahsp_code"] == f"PRV-001.{suffix}"
    assert reconciled.loc[0, "ahsp_code"] == "PRV-001"
    assert (
        reconciled.loc[0, "ahsp_code_reconciliation_status"]
        == "suffix_stripped_match"
    )


def test_exact_coefficient_code_stays_exact():
    reconciled = reconcile_coefficient_ahsp_codes(
        synthetic_private_coefficients().iloc[[0]],
        synthetic_private_index(),
    )

    assert reconciled.loc[0, "source_ahsp_code"] == "PRV-001"
    assert reconciled.loc[0, "ahsp_code"] == "PRV-001"
    assert (
        reconciled.loc[0, "ahsp_code_reconciliation_status"]
        == "exact_match"
    )


def test_unresolved_coefficient_code_remains_error():
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    coefficients.loc[0, "ahsp_code"] = "PRV-UNKNOWN.A"
    reconciled = reconcile_coefficient_ahsp_codes(coefficients, index)
    components = build_private_component_master(reconciled)

    validation = validate_private_ahsp_dataset(
        index,
        reconciled,
        components,
    )

    assert reconciled.loc[0, "ahsp_code"] == "PRV-UNKNOWN.A"
    assert (
        reconciled.loc[0, "ahsp_code_reconciliation_status"]
        == "unresolved"
    )
    assert not validation["is_valid"]
    assert (
        "COEFFICIENT_AHSP_CODE_NOT_FOUND" in issue_codes(validation)
    )


def test_duplicate_conflict_outside_divisions_1_to_3_is_warning():
    base_row = synthetic_private_index().iloc[0].to_dict()
    base_row.update(
        {
            "ahsp_code": "PRV-OUT",
            "division": "Synthetic Division 4",
            "description": "Outside division item",
            "unit": "m2",
        }
    )
    conflicting_row = dict(base_row)
    conflicting_row["description"] = "Conflicting outside division item"
    conflicting_row["unit"] = "m3"
    index = pd.concat(
        [
            synthetic_private_index(),
            pd.DataFrame([base_row, conflicting_row]),
        ],
        ignore_index=True,
    )
    coefficients = synthetic_private_coefficients()
    components = build_private_component_master(coefficients)

    validation = validate_private_ahsp_dataset(
        index,
        coefficients,
        components,
    )

    conflict_issues = [
        issue
        for issue in validation["issues"]
        if issue["code"] == "DUPLICATE_AHSP_CODE_CONFLICT"
    ]
    assert validation["is_valid"]
    assert len(conflict_issues) == 1
    assert conflict_issues[0]["severity"] == "warning"


def test_duplicate_conflict_used_by_coefficients_is_error():
    index = synthetic_private_index()
    conflicting_row = index.iloc[0].copy()
    conflicting_row["description"] = "Conflicting used item"
    conflicting_row["unit"] = "m2"
    index = pd.concat(
        [index, conflicting_row.to_frame().T],
        ignore_index=True,
    )
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    components = build_private_component_master(coefficients)

    validation = validate_private_ahsp_dataset(
        index,
        coefficients,
        components,
    )

    conflict_issues = [
        issue
        for issue in validation["issues"]
        if issue["code"] == "DUPLICATE_AHSP_CODE_CONFLICT"
    ]
    assert not validation["is_valid"]
    assert len(conflict_issues) == 1
    assert conflict_issues[0]["severity"] == "error"


def test_private_mode_loads_processed_data_with_only_warnings(tmp_path):
    index = synthetic_private_index()
    duplicate_row = index.iloc[0].copy()
    index = pd.concat(
        [index, duplicate_row.to_frame().T],
        ignore_index=True,
    )
    coefficients = synthetic_private_coefficients()
    coefficients.loc[0, "ahsp_code"] = "PRV-001.A"
    canonical_index = deduplicate_private_ahsp_index(index)
    reconciled = reconcile_coefficient_ahsp_codes(
        coefficients,
        canonical_index,
    )
    components = build_private_component_master(reconciled)
    validation = validate_private_ahsp_dataset(
        canonical_index,
        reconciled,
        components,
    )
    processed_dir = tmp_path / "warning_processed"
    export_private_processed_csvs(
        canonical_index,
        reconciled,
        components,
        processed_dir,
        validation_result=validation,
    )

    ahsp_index, _, metadata = load_ahsp_data_bundle(
        requested_mode="private",
        private_processed_dir=processed_dir,
    )

    assert validation["summary"]["error_count"] == 0
    assert validation["summary"]["warning_count"] == 2
    assert metadata["active_mode"] == "private"
    assert metadata["validation_warning_count"] == 2
    assert not ahsp_index["ahsp_code"].duplicated().any()
    report = pd.ExcelFile(processed_dir / "validation_report.xlsx")
    assert report.sheet_names == [
        "SUMMARY",
        "ISSUES",
        "RECONCILIATION_SUMMARY",
        "SUPPLEMENTED_INDEX_ROWS",
        "DUPLICATE_INDEX_ROWS",
    ]
    duplicate_rows = pd.read_excel(
        processed_dir / "validation_report.xlsx",
        sheet_name="DUPLICATE_INDEX_ROWS",
    )
    assert len(duplicate_rows) == 2


def test_missing_code_found_in_ahsp_items_is_supplemented():
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    coefficients.loc[0, "ahsp_code"] = "PRV-MISSING"
    reconciled = reconcile_coefficient_ahsp_codes(coefficients, index)
    ahsp_items = synthetic_private_ahsp_items()
    ahsp_items["source_workbook_scope"] = "div1_2"

    supplemented_index = supplement_index_from_private_ahsp_items(
        index,
        [ahsp_items],
        reconciled,
    )
    reconciled_again = reconcile_coefficient_ahsp_codes(
        reconciled,
        supplemented_index,
    )
    components = build_private_component_master(reconciled_again)
    validation = validate_private_ahsp_dataset(
        supplemented_index,
        reconciled_again,
        components,
    )

    supplemental_row = supplemented_index[
        supplemented_index["ahsp_code"].eq("PRV-MISSING")
    ].iloc[0]
    assert supplemental_row["confidence"] == "Supplemented"
    assert supplemental_row["index_row_source"] == "ahsp_items_supplement"
    assert supplemental_row["source_workbook_scope"] == "div1_2"
    assert (
        reconciled_again.loc[0, "ahsp_code_reconciliation_status"]
        == "exact_match"
    )
    assert validation["is_valid"]
    assert (
        "COEFFICIENT_AHSP_CODE_SUPPLEMENTED_FROM_ITEMS"
        in issue_codes(validation)
    )


def test_missing_code_not_found_in_ahsp_items_remains_error():
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    coefficients.loc[0, "ahsp_code"] = "PRV-NOT-IN-ITEMS"
    reconciled = reconcile_coefficient_ahsp_codes(coefficients, index)

    supplemented_index = supplement_index_from_private_ahsp_items(
        index,
        [synthetic_private_ahsp_items()],
        reconciled,
    )
    reconciled_again = reconcile_coefficient_ahsp_codes(
        reconciled,
        supplemented_index,
    )
    components = build_private_component_master(reconciled_again)
    validation = validate_private_ahsp_dataset(
        supplemented_index,
        reconciled_again,
        components,
    )

    assert not validation["is_valid"]
    assert (
        "COEFFICIENT_AHSP_CODE_NOT_FOUND" in issue_codes(validation)
    )
    assert validation["supplemented_index_rows"] == []


def test_supplemented_index_rows_sheet_is_produced(tmp_path):
    index = synthetic_private_index()
    coefficients = synthetic_private_coefficients().iloc[[0]].copy()
    coefficients.loc[0, "ahsp_code"] = "PRV-MISSING"
    reconciled = reconcile_coefficient_ahsp_codes(coefficients, index)
    ahsp_items = synthetic_private_ahsp_items()
    ahsp_items["source_workbook_scope"] = "div3_arch"
    supplemented_index = supplement_index_from_private_ahsp_items(
        index,
        [ahsp_items],
        reconciled,
    )
    reconciled_again = reconcile_coefficient_ahsp_codes(
        reconciled,
        supplemented_index,
    )
    components = build_private_component_master(reconciled_again)
    validation = validate_private_ahsp_dataset(
        supplemented_index,
        reconciled_again,
        components,
    )
    output_dir = tmp_path / "supplemented_processed"

    paths = export_private_processed_csvs(
        supplemented_index,
        reconciled_again,
        components,
        output_dir,
        validation_result=validation,
    )

    report = pd.ExcelFile(paths["validation_report"])
    assert "SUPPLEMENTED_INDEX_ROWS" in report.sheet_names
    supplemented_rows = pd.read_excel(
        paths["validation_report"],
        sheet_name="SUPPLEMENTED_INDEX_ROWS",
    )
    assert supplemented_rows["ahsp_code"].tolist() == ["PRV-MISSING"]
    assert supplemented_rows["source_workbook_scope"].tolist() == [
        "div3_arch"
    ]


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
