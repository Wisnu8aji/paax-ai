from __future__ import annotations

from pathlib import Path

from app.tkg.builder import build_tkg_from_text


def test_build_tkg_from_structured_text_fixture():
    raw = Path("tests/fixtures/golden_tkg_text_sheet.txt").read_text(encoding="utf-8")

    result = build_tkg_from_text(project_id="PRJ", revision_id="R1", sheet_id="S01", title="Denah", raw_text=raw)
    doc = result.tkg_json

    assert doc["prj_id"] == "PRJ"
    assert doc["sheets"][0]["grid"]["valid"] is True
    assert doc["sheets"][0]["grid"]["total"][0]["nilai"] == 6500
    assert doc["sheets"][0]["tables"][0]["records"][0]["kode"] == "K1"
    assert len(doc["sheets"][0]["elements"]) == 2
    assert result.validation_issues == []
    assert "[S01-GRID-X01]" in result.tkg_txt
    assert "[S01-TBL-K1]" in result.tkg_txt
    assert "[S01-EL-002]" in result.tkg_txt
