from __future__ import annotations

from pathlib import Path

from app.tkg.builder import build_tkg_from_text, classification_to_jenis


def test_build_tkg_from_structured_text_fixture():
    raw = Path("tests/fixtures/golden_tkg_text_sheet.txt").read_text(encoding="utf-8")

    result = build_tkg_from_text(
        project_id="PRJ", revision_id="R1", sheet_id="S01", title="Denah", raw_text=raw, jenis="denah",
    )
    doc = result.tkg_json
    sheet = doc["sheets"][0]

    # Nilai acuan dihitung manual dari fixture:
    # GRID X: A-B=3000 + B-C=3500 = 6500 == TOTAL A-C=6500 -> valid, tanpa issue.
    # GRID Y: 1-2=4000 == TOTAL 1-2=4000 -> valid, tanpa issue.
    assert doc["prj_id"] == "PRJ"
    assert sheet["jenis"] == "denah"
    assert sheet["meta"]["judul"] == "Denah"
    assert len(sheet["grid"]["bentang_x"]) == 2
    assert sheet["grid"]["total_x"]["nilai"] == 6500
    assert len(sheet["grid"]["bentang_y"]) == 1
    assert sheet["grid"]["total_y"]["nilai"] == 4000
    assert sheet["tables"][0]["records"][0]["kode"] == "K1"
    assert sheet["tables"][0]["records"][0]["tulangan"][0]["posisi"] == "tul_utama"
    assert len(sheet["elements"]) == 2
    assert sheet["elements"][0]["alamat"] == "A/1"
    assert sheet["unclassified"] == []
    assert result.validation_issues == []
    assert "[S01-GRID-X01]" in result.tkg_txt
    assert "[S01-GRID-Y01]" in result.tkg_txt
    assert "[S01-TBL-K1]" in result.tkg_txt
    assert "[S01-EL-002]" in result.tkg_txt


def test_build_tkg_grid_mismatch_flagged_not_guessed():
    raw = "GRID X: A-B=3000; B-C=3000; TOTAL A-C=6500"  # sum 6000 != total 6500
    result = build_tkg_from_text(project_id="PRJ", revision_id="R1", sheet_id="S02", title="Denah", raw_text=raw)
    assert result.validation_issues[0]["code"] == "E-GRID"
    assert "sumbu X" in result.validation_issues[0]["message"]


def test_build_tkg_unmatched_lines_go_to_unclassified_not_dropped():
    raw = "Catatan bebas yang tidak cocok pola manapun."
    result = build_tkg_from_text(project_id="PRJ", revision_id="R1", sheet_id="S03", title="Notes", raw_text=raw)
    sheet = result.tkg_json["sheets"][0]
    assert sheet["unclassified"] == [{"raw": raw, "alasan": "tidak cocok pola grammar SK-07 (MVP)"}]
    assert sheet["elements"] == []


def test_classification_to_jenis_mapping():
    assert classification_to_jenis("DENAH") == "denah"
    assert classification_to_jenis("SCHEDULE") == "tabel"
    assert classification_to_jenis("MEP") == "campuran"
    assert classification_to_jenis("UNCLASSIFIED") == "campuran"
