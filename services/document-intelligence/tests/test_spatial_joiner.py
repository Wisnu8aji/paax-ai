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


# ─── R2: slab/wall thickness joins ───────────────────────────────────────────

def test_join_slab_thickness_from_dimension_observation():
    page = _load_page("page-0043")  # DENAH BALOK LANTAI 2 has T=130mm near S1
    item = _candidate("w-S1", "slab", "S1", 43)
    result = join_written_dimensions(work_items=[item], dem_pages={43: page})
    updated = result.work_items[0]
    thickness = [f for f in updated.measurement_facts if f.field == "thickness"]
    assert len(thickness) == 1
    assert thickness[0].value == 130.0
    assert thickness[0].unit == "mm"
    assert thickness[0].verification_status == "engine_verified"
    assert thickness[0].evidence_refs
    assert result.metrics["slab_wall_thickness_joins"] >= 1


def test_join_slab_thickness_from_table_pelat_page_0052():
    page = _load_page("page-0052")  # TABEL PELAT has t=130 / t=120
    s1 = _candidate("w-S1", "slab", "S1", 52)
    s2 = _candidate("w-S2", "slab", "S2", 52)
    result = join_written_dimensions(work_items=[s1, s2], dem_pages={52: page})
    by_id = {item.work_item_id: item for item in result.work_items}
    s1_thick = [f for f in by_id["w-S1"].measurement_facts if f.field == "thickness"]
    s2_thick = [f for f in by_id["w-S2"].measurement_facts if f.field == "thickness"]
    assert s1_thick and s2_thick
    assert s1_thick[0].value == 130.0
    assert s2_thick[0].value == 120.0


def test_join_thickness_reflected_in_attributes_dimensions():
    page = _load_page("page-0043")
    item = _candidate("w-S1", "slab", "S1", 43)
    result = join_written_dimensions(work_items=[item], dem_pages={43: page})
    dims = result.work_items[0].attributes.get("dimensions")
    assert isinstance(dims, dict)
    assert dims.get("thickness") == 130.0


# ─── R2: inline label dimension joins ────────────────────────────────────────

def test_join_inline_steel_profile_from_label():
    page = _load_page("page-0055")  # 'WF 200X100X5.5X8 (KD.1)' and 'WF1 150X75X5X7'
    kd1 = _candidate("w-KD1", "steel_profile", "KD1", 55)
    result = join_written_dimensions(work_items=[kd1], dem_pages={55: page})
    updated = result.work_items[0]
    width = [f for f in updated.measurement_facts if f.field == "width"]
    depth = [f for f in updated.measurement_facts if f.field == "depth"]
    # Parenthesized code (KD.1) maps the label to item KD1; profile numbers are
    # width = flange (h=100), depth = nominal height (b=200).
    assert width and depth
    assert width[0].value == 100.0
    assert depth[0].value == 200.0
    assert result.metrics["inline_label_dimension_joins"] >= 1


def test_join_inline_steel_profile_wf1_from_label():
    page = _load_page("page-0055")  # 'WF1 150X75X5X7'
    wf1 = _candidate("w-WF1", "steel_profile", "WF1", 55)
    result = join_written_dimensions(work_items=[wf1], dem_pages={55: page})
    updated = result.work_items[0]
    width = [f for f in updated.measurement_facts if f.field == "width"]
    depth = [f for f in updated.measurement_facts if f.field == "depth"]
    assert width and depth
    assert width[0].value == 75.0
    assert depth[0].value == 150.0


def test_join_inline_lintel_from_label():
    # "Lintel 15X10" -> inline_cm 150×100 mm (Master Plan §4.3 K2 convention).
    page = _load_page("page-0046")
    lintel = _candidate("w-LINTEL", "beam", "LINTEL", 46)
    result = join_written_dimensions(work_items=[lintel], dem_pages={46: page})
    updated = result.work_items[0]
    width = [f for f in updated.measurement_facts if f.field == "width"]
    depth = [f for f in updated.measurement_facts if f.field == "depth"]
    assert width and depth
    assert width[0].value == 150.0
    assert depth[0].value == 100.0
    dims = updated.attributes.get("dimensions")
    assert isinstance(dims, dict)
    assert dims.get("width") == 150.0 and dims.get("depth") == 100.0


def test_join_inline_does_not_fabricate_for_bare_labels():
    # "CG2A" has no inline dimension and no nearby pair -> no width/depth facts.
    page = _load_page("page-0043")
    item = _candidate("w-CG2A", "beam", "CG2A", 43)
    result = join_written_dimensions(work_items=[item], dem_pages={43: page})
    updated = result.work_items[0]
    assert not [f for f in updated.measurement_facts if f.field in {"width", "depth"}]


# ─── Cycle-002 C2-2: golden-family alias, RAFTER profile, materials, span ───

def test_join_lintel_alias_lt1_reaches_lintel_labels():
    # Item LT1 (from the sheet title "TABEL BALOK LT.1") is the same lintel
    # family as LINTEL; "Lintel 15X10" labels must join 150×100 mm.
    page = _load_page("page-0046")
    lt1 = _candidate("w-LT1", "beam", "LT1", 46)
    result = join_written_dimensions(work_items=[lt1], dem_pages={46: page})
    updated = result.work_items[0]
    widths = [f for f in updated.measurement_facts if f.field == "width"]
    depths = [f for f in updated.measurement_facts if f.field == "depth"]
    assert widths and depths
    assert widths[0].value == 150.0
    assert depths[0].value == 100.0
    assert result.metrics["inline_label_dimension_joins"] >= 1


def test_join_rafter_steel_profile_from_label():
    # "RAFTER 150X75X5X7" on page-0054 is a written steel profile (C2-2).
    page = _load_page("page-0054")
    rafter = _candidate("w-RAFTER", "steel_profile", "RAFTER", 54)
    result = join_written_dimensions(work_items=[rafter], dem_pages={54: page})
    updated = result.work_items[0]
    widths = [f for f in updated.measurement_facts if f.field == "width"]
    depths = [f for f in updated.measurement_facts if f.field == "depth"]
    # Steel convention: width = flange h (75), depth = nominal b (150).
    assert widths and depths
    assert widths[0].value == 75.0
    assert depths[0].value == 150.0


def test_join_foundation_material_dimension_from_legend():
    # "F1 = FLOOR ex.HOMOGENEOUS TILE 600x600mm" is a written section for F1.
    page = _load_page("page-0016")
    f1 = _candidate("w-F1", "foundation", "F1", 16)
    result = join_written_dimensions(work_items=[f1], dem_pages={16: page})
    updated = result.work_items[0]
    widths = [f for f in updated.measurement_facts if f.field == "width"]
    depths = [f for f in updated.measurement_facts if f.field == "depth"]
    assert widths and depths
    assert widths[0].value == 600.0
    assert depths[0].value == 600.0
    assert result.metrics["materials_section_joins"] >= 1


def test_join_material_dimension_does_not_hit_architectural_codes():
    # L2 = CERAMIC TILE on page-0006 must NOT become a structural section.
    page = _load_page("page-0006")
    l2 = _candidate("w-L2", "lighting_fixture", "L2", 6)
    result = join_written_dimensions(work_items=[l2], dem_pages={6: page})
    updated = result.work_items[0]
    assert not [f for f in updated.measurement_facts if f.field in {"width", "depth"}]


def test_join_beam_span_from_nearby_dimension_with_ambiguity_guard():
    # RB1 on page-0054 sits next to the 7000 mm span dimension (unambiguous).
    page = _load_page("page-0054")
    rb1 = _candidate("w-RB1", "beam", "RB1", 54)
    result = join_written_dimensions(work_items=[rb1], dem_pages={54: page})
    updated = result.work_items[0]
    spans = [f for f in updated.measurement_facts if f.field == "span_length"]
    assert spans
    assert spans[0].value == 7000.0
    assert "span_length" not in updated.missing_information
    assert result.metrics["beam_span_length_joins"] >= 1


def test_join_beam_span_rejects_ambiguous_shared_dimension():
    # CG2A on page-0043 has several grid dimensions at comparable distance;
    # the ambiguity guard must NOT attach a fabricated span.
    page = _load_page("page-0043")
    cg2a = _candidate("w-CG2A", "beam", "CG2A", 43)
    result = join_written_dimensions(work_items=[cg2a], dem_pages={43: page})
    updated = result.work_items[0]
    spans = [f for f in updated.measurement_facts if f.field == "span_length"]
    assert not spans
    assert "span_length" in updated.missing_information
