"""K3 — spatial joiner and inline table parser tests."""

from __future__ import annotations

import json
from pathlib import Path

from app.drawing_intelligence.models import WorkItemCandidate
from app.drawing_intelligence.spatial_joiner import (
    _parse_dimension_pair,
    join_written_dimensions,
    parse_inline_table_rows,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PAGES = _REPO_ROOT / "dem_extraction_88pages" / "pages"


def _load_page(page_name: str) -> dict:
    with open(_PAGES / f"{page_name}.json", encoding="utf-8") as handle:
        return json.load(handle)


def _candidate(work_item_id: str, category: str, code: str, page_index: int) -> WorkItemCandidate:
    return WorkItemCandidate(
        work_item_id=work_item_id,
        category=category,
        code=code,
        label=code,
        page_indices=[page_index],
        maturity="observed",
    )


# ─── Dimension pair parsing ──────────────────────────────────────────────────

def test_parse_dimension_pair_mm_with_unit():
    parsed = _parse_dimension_pair("300X600 mm")
    assert parsed == {"width": 300.0, "depth": 600.0, "unit": "mm"}


def test_parse_dimension_pair_spaces_and_lowercase():
    assert _parse_dimension_pair("400 x 400 mm") == {"width": 400.0, "depth": 400.0, "unit": "mm"}


def test_parse_dimension_pair_with_leading_element_token():
    assert _parse_dimension_pair("K1 400X400 mm") == {"width": 400.0, "depth": 400.0, "unit": "mm"}
    assert _parse_dimension_pair("K2 250X600 mm") == {"width": 250.0, "depth": 600.0, "unit": "mm"}


def test_parse_dimension_pair_bare_pair_is_cm_per_master_plan():
    # Master Plan §4.3 K2: "Lintel 15X10" -> 150×100 mm
    assert _parse_dimension_pair("Lintel 15X10") == {"width": 150.0, "depth": 100.0, "unit": "mm"}
    assert _parse_dimension_pair("15X10") == {"width": 150.0, "depth": 100.0, "unit": "mm"}


def test_parse_dimension_pair_rejects_steel_profile():
    # WF 200X100X5.5X8 is a steel profile, not a beam/column section.
    assert _parse_dimension_pair("WF 200X100X5.5X8") is None


def test_parse_dimension_pair_rejects_single_numbers():
    assert _parse_dimension_pair("250") is None
    assert _parse_dimension_pair("1500") is None


# ─── Inline table parsing (page-0050 TABEL BALOK) ────────────────────────────

def test_inline_table_parses_beam_rows_with_dimensions():
    page = _load_page("page-0050")
    rows = parse_inline_table_rows(page["observations"]["tables"][0]["raw"])
    codes = [row["code"] for row in rows]
    assert codes == ["G1", "G2", "G3", "B1", "B2", "B3", "CG1", "CB1", "BL"]
    by_code = {row["code"]: row for row in rows}
    assert by_code["G1"]["dimension"] == {"width": 300.0, "depth": 600.0, "unit": "mm"}
    assert by_code["B2"]["dimension"] == {"width": 200.0, "depth": 400.0, "unit": "mm"}
    assert by_code["BL"]["dimension"] == {"width": 150.0, "depth": 250.0, "unit": "mm"}
    # No explicit span column in the TABEL BALOK sheet.
    assert by_code["G1"]["span_length"] is None


# ─── Spatial join on real DEM pages ──────────────────────────────────────────

def test_join_written_dimensions_bbox_column_page_0049():
    page = _load_page("page-0049")
    item = _candidate("w-K1", "column", "K1", 49)
    result = join_written_dimensions(work_items=[item], dem_pages={49: page})
    updated = result.work_items[0]
    facts = {(fact.field, fact.source_method): fact for fact in updated.measurement_facts}
    assert facts[("width", "written_dimension")].value == 400.0
    assert facts[("depth", "written_dimension")].value == 400.0
    assert facts[("width", "written_dimension")].verification_status == "engine_verified"
    assert facts[("width", "written_dimension")].evidence_refs
    assert result.metrics["bbox_dimension_joins"] >= 1


def test_join_written_dimensions_table_beam_page_0050():
    page = _load_page("page-0050")
    g1 = _candidate("w-G1", "beam", "G1", 50)
    bl = _candidate("w-BL", "beam", "BL", 50)
    result = join_written_dimensions(work_items=[g1, bl], dem_pages={50: page})
    by_id = {item.work_item_id: item for item in result.work_items}
    g1_facts = {(f.field, f.source_method): f for f in by_id["w-G1"].measurement_facts}
    assert g1_facts[("width", "written_dimension")].value == 300.0
    assert g1_facts[("depth", "written_dimension")].value == 600.0
    bl_facts = {(f.field, f.source_method): f for f in by_id["w-BL"].measurement_facts}
    assert bl_facts[("width", "written_dimension")].value == 150.0
    assert bl_facts[("depth", "written_dimension")].value == 250.0


def test_join_beam_without_span_flags_missing_information_not_blocked():
    page = _load_page("page-0050")
    item = _candidate("w-G1", "beam", "G1", 50)
    result = join_written_dimensions(work_items=[item], dem_pages={50: page})
    updated = result.work_items[0]
    # Beam volume contract fallback: dimensions present, span missing -> flag,
    # never a fabricated number, and never a total block.
    assert updated.missing_information == ["span_length"]
    assert result.metrics["beam_span_length_fallbacks"] == 1


def test_join_beam_with_explicit_span_column_attaches_span_length():
    page = _load_page("page-0050")
    table = page["observations"]["tables"][0]
    table["raw"] = "TYPE\nBENTANG\nDIMENSI\nG1\n3750\n300X600 mm\n"
    item = _candidate("w-G1", "beam", "G1", 50)
    result = join_written_dimensions(work_items=[item], dem_pages={50: page})
    updated = result.work_items[0]
    spans = [f for f in updated.measurement_facts if f.field == "span_length"]
    assert len(spans) == 1
    assert spans[0].value == 3750.0
    assert spans[0].source_method == "written_dimension"
    assert "span_length" not in updated.missing_information


def test_join_maps_level_and_location_from_sheet_title():
    page = _load_page("page-0050")  # TABEL BALOK LANTAI 1 & SLOOF
    item = _candidate("w-B1", "beam", "B1", 50)
    result = join_written_dimensions(work_items=[item], dem_pages={50: page})
    updated = result.work_items[0]
    assert updated.attributes.get("level") == "L1"
    assert updated.attributes.get("location") == "Lantai 1"


def test_join_preserves_existing_facts():
    from app.drawing_intelligence.models import ElementMeasurementFact

    page = _load_page("page-0049")
    existing = ElementMeasurementFact(
        measurement_id="mf-existing-width", work_item_id="w-K1", field="width", value=399.0,
        unit="mm", source_method="written_dimension", verification_status="engine_verified",
        evidence_refs=["ev-1"], source_page_indices=[49], formula_input="width",
    )
    item = _candidate("w-K1", "column", "K1", 49)
    item.measurement_facts.append(existing)
    result = join_written_dimensions(work_items=[item], dem_pages={49: page})
    updated = result.work_items[0]
    widths = [f for f in updated.measurement_facts if f.field == "width"]
    assert widths[0].value == 399.0  # existing fact preserved, joiner did not overwrite
