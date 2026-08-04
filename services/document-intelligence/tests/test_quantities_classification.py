"""Official unit tests for ORION-F2 quantities K0–K2 engine functions.

Covers the deterministic (0% AI) quantities classification engine built in
this task, per Master Plan §4.2/§4.3:

- K1 sheet-context classification: ``sheet_identity.classify_sheet_context``,
  ``sheet_context_category``, ``infer_level``, ``canonical_discipline``,
  ``classify_drawing_type`` — title/drawing-type → discipline + L2 category + level.
- K2 label/code parser + canonical naming dictionary: ``taxonomy.extract_item_code``,
  ``category_from_code`` (wires ``_REGISTRY`` code patterns), ``parse_inline_dimensions``,
  ``name_formatter``, ``dimensions_text``, ``level_display_name``.
- K0 baseline/golden helpers: ``scripts.quantities_k0_baseline.measure_page`` and
  ``scripts.quantities_k0_golden.build_golden_item`` on synthetic rows.

All tests are self-contained (no PDF, no DEM JSON-1 files, no network).
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

from app.drawing_intelligence.sheet_identity import (
    canonical_discipline,
    classify_drawing_type,
    classify_sheet_context,
    infer_level,
    sheet_context_category,
)
from app.drawing_intelligence.taxonomy import (
    category_from_code,
    dimensions_text,
    extract_item_code,
    level_display_name,
    name_formatter,
    parse_inline_dimensions,
    resolve_user_category,
    taxonomy_for,
)
from app.drawing_intelligence.vocabulary import infer_category

_SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"


def _load_script_module(name: str):
    """Load one of scripts/quantities_k0_*.py without making scripts a package."""
    path = _SCRIPTS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


# ── K1: sheet-context classification ─────────────────────────────────────────


def test_sheet_context_denah_kolom_lantai1():
    result = classify_sheet_context(title="DENAH KOLOM LANTAI 1")
    assert result["discipline"] == "structure"
    assert result["category"] == "column"
    assert result["level"] == "L1"
    assert result["drawing_type"] == "column_plan"


def test_sheet_context_tabel_balok():
    result = classify_sheet_context(title="TABEL BALOK")
    assert result["drawing_type"] == "schedule"
    assert result["category"] == "beam"
    assert result["discipline"] == "structure"
    assert result["level"] is None  # schedule title carries no spatial level


def test_sheet_context_footplat_and_lintel():
    foundation = classify_sheet_context(title="DENAH FOOTPLAT")
    assert foundation["category"] == "foundation"
    assert foundation["level"] == "foundation"
    lintel = classify_sheet_context(title="DENAH BALOK LINTEL LT.1")
    assert lintel["category"] == "beam"
    assert lintel["level"] == "L1"


def test_sheet_context_unknown_title_stays_unknown():
    result = classify_sheet_context(title="CATATAN UMUM")
    assert result["category"] == "unknown"
    assert result["discipline"] == "unknown"
    assert result["level"] is None


def test_sheet_context_category_title_keyword_over_drawing_type():
    # Title keyword wins even when drawing_type points elsewhere.
    assert sheet_context_category(title="TABEL BALOK", drawing_type="column_plan") == "beam"
    # Fallback path for terse titles relies on the drawing type mapping.
    assert sheet_context_category(title="", drawing_type="column_plan") == "column"
    assert sheet_context_category(title="", drawing_type="beam_plan") == "beam"
    assert sheet_context_category(title="", drawing_type="foundation_plan") == "foundation"
    assert sheet_context_category(title="UNRELATED") == "unknown"


def test_infer_level_deterministic():
    assert infer_level("DENAH LANTAI 1") == "L1"
    assert infer_level("DENAH LANTAI 2") == "L2"
    assert infer_level("DENAH PLAFOND LT.2") == "L2"
    assert infer_level("LANTAI 0") == "ground"
    assert infer_level("BASEMENT 3 PARKING PLAN") == "B3"
    assert infer_level("DENAH ATAP") == "roof"
    assert infer_level("RENCANA PAVING") == "site"
    assert infer_level("TABEL BALOK") is None
    assert infer_level("") is None


def test_canonical_discipline_from_title():
    assert canonical_discipline(None, "DENAH KOLOM LANTAI 1") == "structure"
    assert canonical_discipline(None, "DENAH PINTU & JENDELA") == "architecture"
    assert canonical_discipline(None, "TITIK LAMPU") == "electrical"
    assert canonical_discipline("structure", "DENAH KOLOM") == "structure"


def test_classify_drawing_type_deterministic():
    assert classify_drawing_type("DENAH KOLOM LANTAI 1") == "column_plan"
    assert classify_drawing_type("TABEL BALOK") == "schedule"
    assert classify_drawing_type("DENAH FOOTPLAT") == "foundation_plan"
    assert classify_drawing_type("DETAIL KUSEN") == "detail"
    assert classify_drawing_type("CATATAN UMUM") == "technical_note"
    assert classify_drawing_type("") == "unknown"


# ── K2: code grammar & taxonomy wiring ────────────────────────────────────────


def test_extract_item_code_master_plan_grammar():
    assert extract_item_code("Kolom K1") == "K1"
    assert extract_item_code("K1A") == "K1A"
    assert extract_item_code("K-01") == "K-01"
    assert extract_item_code("STK-2") == "STK-2"
    assert extract_item_code("PC1") == "PC1"
    assert extract_item_code("WF1 150X75X5X7") == "WF1"
    # Digitless element code accepted only when the label IS the code.
    assert extract_item_code("BL") == "BL"
    assert extract_item_code("LINTEL") == "LINTEL"
    # Free text and dimension fragments are never codes.
    assert extract_item_code("JALAN") is None
    assert extract_item_code("DENAH") is None
    assert extract_item_code("Lintel 15X10") is None  # X10 must not look like a code
    assert extract_item_code("") is None
    assert extract_item_code(None) is None


def test_category_from_code_wires_registry_patterns():
    assert category_from_code("K1") == "column"
    assert category_from_code("B2") == "beam"
    assert category_from_code("G1") == "beam"
    assert category_from_code("RB3") == "beam"
    assert category_from_code("SL1") == "beam"
    assert category_from_code("PC1") == "foundation"
    assert category_from_code("J1") == "window"
    assert category_from_code("BV1") == "window"
    assert category_from_code("PJ1") == "door_window_assembly"
    assert category_from_code("WF1") == "steel_profile"
    assert category_from_code("STK-2") == "electrical_fixture"
    assert category_from_code("BL") == "beam"  # digitless element code
    assert category_from_code("LINTEL") == "beam"


def test_category_from_code_ambiguous_prefixes_need_context():
    # Bare P: PINTU (door) vs PONDASI/FOOTPLAT (foundation).
    assert category_from_code("P1", title="DENAH PINTU & JENDELA") == "door"
    assert category_from_code("P1", title="DENAH FOOTPLAT") == "foundation"
    assert category_from_code("P1") == "unknown"
    # Bare C: PLAFON (ceiling) vs KOLOM variant (column).
    assert category_from_code("C1", title="DENAH PLAFOND LANTAI 1") == "ceiling_type"
    assert category_from_code("C1") == "unknown"
    # D-<digits> is a detail callout marker, never a door.
    assert category_from_code("D-01") == "unknown"
    assert category_from_code("") == "unknown"
    assert category_from_code(None) == "unknown"


def test_taxonomy_registry_patterns_accept_golden_codes():
    for code, category in (
        ("K1", "column"), ("K2", "column"), ("B2", "beam"), ("G1", "beam"),
        ("PC1", "foundation"), ("J1", "window"), ("WF1", "steel_profile"),
    ):
        pattern = taxonomy_for(category).code_pattern
        assert pattern is not None and pattern.fullmatch(code), f"{code} not {category}"
    # Digitless element codes (Master Plan §4.2) resolve via the registry's
    # digitless dictionary, not the numeric regex.
    assert category_from_code("BL") == "beam"
    assert category_from_code("LINTEL") == "beam"


def test_infer_category_uses_sheet_context_disambiguation():
    assert infer_category("SL1", title="DENAH BALOK LANTAI 1", raw="SL1") == "beam"
    # Same compact code on a lighting plan must not become a structural beam.
    assert infer_category("SL1", title="DENAH TITIK LAMPU LANTAI 1", raw="SL1") == "lighting_fixture"
    assert infer_category("PC1", title="DENAH FOOTPLAT", raw="PC1") == "foundation"
    assert infer_category("K1", title="DENAH KOLOM LANTAI 1", raw="Kolom K1") == "column"


# ── K2: inline dimension parsing ──────────────────────────────────────────────


def test_parse_inline_dimensions_lintel_cm_shorthand():
    parsed = parse_inline_dimensions("Lintel 15X10")
    assert parsed is not None
    assert parsed["width"] == 150
    assert parsed["depth"] == 100
    assert parsed["unit"] == "mm"
    assert parsed["source"] == "inline_cm"


def test_parse_inline_dimensions_explicit_mm():
    parsed = parse_inline_dimensions("400 x 400 mm")
    assert parsed is not None
    assert parsed["width"] == 400
    assert parsed["depth"] == 400
    assert parsed["unit"] == "mm"
    assert parsed["source"] == "inline_text"
    parsed_slash = parse_inline_dimensions("250/600")
    assert parsed_slash is not None
    assert parsed_slash["width"] == 250
    assert parsed_slash["depth"] == 600


def test_parse_inline_dimensions_steel_profile():
    parsed = parse_inline_dimensions("WF 200X100X5.5X8")
    assert parsed is not None
    assert parsed["profile"] == "WF"
    assert parsed["b"] == 200
    assert parsed["h"] == 100
    assert parsed["tw"] == 5.5
    assert parsed["tf"] == 8
    assert parsed["unit"] == "mm"
    assert parsed["source"] == "inline_steel_profile"


def test_parse_inline_dimensions_thickness_and_none():
    parsed = parse_inline_dimensions("t=120")
    assert parsed is not None
    assert parsed["thickness"] == 120
    assert parsed["unit"] == "mm"
    assert parse_inline_dimensions("Kolom") is None
    assert parse_inline_dimensions("") is None
    assert parse_inline_dimensions(None) is None


# ─── P3: pipe/MEP diameter parsing ───────────────────────────────────────────


def test_parse_inline_dimensions_diameter_mm():
    parsed = parse_inline_dimensions("Ø25mm")
    assert parsed is not None
    assert parsed["diameter"] == 25
    assert parsed["unit"] == "mm"
    assert parsed["source"] == "inline_diameter"
    assert parse_inline_dimensions("Trexstang Ø12mm")["diameter"] == 12


def test_parse_inline_dimensions_diameter_inch():
    # 1 in = 25.4 mm — "Ø8 INCHI" → 203.2 mm, "PVC O 4\"" → 101.6 mm,
    # bare "3\"" → 76.2 mm.
    assert parse_inline_dimensions("PIPA Ø8 INCHI")["diameter"] == 203.2
    assert parse_inline_dimensions("PVC O 4\"")["diameter"] == 101.6
    assert parse_inline_dimensions("3\"")["diameter"] == 76.2
    assert parse_inline_dimensions("PIPA 2 INCH")["diameter"] == 50.8


def test_parse_inline_dimensions_diameter_requires_pipe_context():
    # A bare metric number in an unrelated note is never a pipe diameter.
    assert parse_inline_dimensions("LOKASI 25MM") is None
    # Rebar spacing / bolt callouts are not pipe sizes.
    assert parse_inline_dimensions("SENG.Ø10-100") is None
    assert parse_inline_dimensions("BAUT 4Ø12") is None
    # A section pair stays a section — the diameter parser must not hijack it.
    section = parse_inline_dimensions("400 x 400 mm")
    assert section is not None and "diameter" not in section
    assert section["width"] == 400 and section["depth"] == 400


def test_dimensions_text_renders_steel_profile_and_diameter():
    profile = {"profile": "WF", "b": 200.0, "h": 100.0, "tw": 5.5, "tf": 8.0, "unit": "mm"}
    assert dimensions_text({"dimensions": profile}) == "WF 200×100×5.5×8 mm"
    gording = {"profile": "GORDING", "b": 150.0, "h": 50.0, "tw": 20.0, "tf": 2.3, "unit": "mm"}
    assert dimensions_text({"dimensions": gording}) == "GORDING 150×50×20×2.3 mm"
    diameter = {"diameter": 203.2, "unit": "mm"}
    assert dimensions_text({"dimensions": diameter}) == "Ø203.2 mm"
    diameter_int = {"diameter": 12, "unit": "mm"}
    assert dimensions_text({"dimensions": diameter_int}) == "Ø12 mm"


# ── K2: canonical naming dictionary (Master Plan §4.2) ───────────────────────


def test_name_formatter_canonical_names():
    assert name_formatter(category="column", code="K1") == "Kolom Beton Bertulang K1"
    assert name_formatter(category="beam", code="B2") == "Balok Beton Bertulang B2"
    assert name_formatter(category="beam", code="BL") == "Balok Beton Bertulang BL"
    assert name_formatter(category="sloof", code="S1") == "Sloof Beton Bertulang S1"
    assert name_formatter(category="slab", level="L1") == "Pelat Beton Bertulang Lt.1"
    assert name_formatter(category="foundation", code="PC1") == "Pondasi Footplat PC1"
    assert name_formatter(category="foundation", code="P2") == "Pondasi Tiang P2"
    assert name_formatter(category="wall") == "Dinding Bata"
    assert name_formatter(category="door", code="P1") == "Pintu Kayu P1"
    assert name_formatter(category="window", code="J1") == "Jendela Aluminium J1"
    assert name_formatter(category="steel_profile", code="WF1") == "Profil Baja WF1"


def test_name_formatter_never_invents_missing_attributes():
    assert name_formatter(category="column") is None  # code required
    assert name_formatter(category="beam") is None
    assert name_formatter(category="slab") is None  # lantai required
    assert name_formatter(category="foundation", code="X1") is None  # subtype unresolvable
    assert name_formatter(category="unknown") is None
    assert name_formatter(category="mep_fixture") is None


def test_dimensions_text_formats_integer_mm_without_float_leak():
    attrs = {"dimensions": {"width": 250, "depth": 600, "unit": "mm"}}
    assert dimensions_text(attrs) == "250 × 600 mm"
    # Regression: parsed float dimensions must not leak "250.0 × 600.0 mm".
    parsed = parse_inline_dimensions("250 x 600 mm")
    assert dimensions_text({"dimensions": parsed}) == "250 × 600 mm"
    assert "250.0" not in (dimensions_text({"dimensions": parsed}) or "")
    # Missing width/depth → None (no invented value).
    assert dimensions_text({}) is None
    assert dimensions_text({"dimensions": {"width": 250}}) is None


def test_level_display_name():
    assert level_display_name("L1") == "Lantai 1"
    assert level_display_name("L2") == "Lantai 2"
    assert level_display_name("B3") == "Basement 3"
    assert level_display_name("foundation") == "Fondasi/Substruktur"
    assert level_display_name("site") == "Area Tapak"
    assert level_display_name("roof") == "Atap"
    assert level_display_name(None) == "Belum diketahui"


def test_resolve_user_category_sheet_context():
    assert resolve_user_category("unknown", "PC1", "PC1", {"sheet_title": "DENAH FOOTPLAT"}) == "foundation"
    assert resolve_user_category("unknown", "C1", "C1", {"sheet_title": "DENAH PLAFOND LANTAI 1"}) == "ceiling_type"
    assert resolve_user_category("unknown", "WF1", "WF1 150X75X5X7", {"sheet_title": "DETAIL BAJA"}) == "steel_profile"


# ── K0: baseline measurement helper ───────────────────────────────────────────


def test_k0_measure_page_counts_coded_classified_joinable():
    baseline = _load_script_module("quantities_k0_baseline")
    page = baseline.measure_page(6, {
        "source": {"page_index": 6, "width_px": 1000, "height_px": 1000},
        "sheet_identity": {"title": {"value": "DENAH LANTAI 1"}},
        "observations": {
            "element_labels": [
                {"raw": "K1", "bbox": [200, 200, 210, 210]},          # near dimension row 1
                {"raw": "Kolom K1A 400 x 400 mm", "bbox": [200, 220, 260, 240]},  # inline dim
                {"raw": "JALAN", "bbox": [300, 300, 320, 310]},      # not a code, far from dims
            ],
            "dimensions": [
                {"raw": "400 x 400 mm", "bbox": [205, 200, 260, 215], "unit": "mm"},
                {"raw": "no unit", "bbox": [500, 500, 550, 510], "unit": None},
            ],
        },
    })
    assert page["label_count"] == 3
    assert page["label_coded"] == 2          # K1, K1A (JALAN is not a code)
    assert page["label_classified"] == 2     # both resolve to column
    assert page["label_joinable"] == 2       # K1 inline-free but near dimension? K1A inline
    assert page["level_from_title"] is True  # "DENAH LANTAI 1"
    assert page["codes"] == {"K1": 1, "K1A": 1}


def test_k0_measure_page_unknown_title_level_false():
    baseline = _load_script_module("quantities_k0_baseline")
    page = baseline.measure_page(1, {
        "source": {"page_index": 1, "width_px": 1000, "height_px": 1000},
        "sheet_identity": {"title": {"value": "DAFTAR SINGKATAN"}},
        "observations": {"element_labels": [], "dimensions": []},
    })
    assert page["label_count"] == 0
    assert page["label_coded"] == 0
    assert page["level_from_title"] is False


# ── K0: golden set builder ────────────────────────────────────────────────────


def test_k0_golden_build_item_column_with_inline_dimension():
    golden = _load_script_module("quantities_k0_golden")
    item = golden.build_golden_item(
        page_index=49,
        source_path="G:\\paax-ai-contextual-integration\\dem_extraction_88pages\\pages\\page-0049.json",
        row={"raw": "K2 250 x 600 mm", "normalized": "K2", "evidence_refs": ["ev-1"]},
        title="TABEL KOLOM",
        drawing_type="schedule",
        discipline="structure",
        level=None,
        reason="K2 kolom pada TABEL KOLOM (golden page-0049).",
    )
    assert item["code"] == "K2"
    assert item["category"] == "column"
    assert item["category_technical_name"] == "Kolom"
    assert item["unit"] == "m3"
    assert item["dimensions"]["display"] == "250 × 600 mm"
    assert item["dimensions"]["width_mm"] == 250
    assert item["dimensions"]["depth_mm"] == 600
    assert item["validation"] == "engine"


def test_k0_golden_build_item_lintel_cm_to_mm():
    golden = _load_script_module("quantities_k0_golden")
    # The real script passes a manual code/category for the digitless LINTEL
    # row (page-0046); dimensions still come from the inline cm→mm parser.
    item = golden.build_golden_item(
        page_index=46,
        source_path="page-0046.json",
        row={"raw": "Lintel 15X10", "evidence_refs": []},
        title="DENAH BALOK LINTEL LT.1",
        drawing_type="beam_plan",
        discipline="structure",
        level="L1",
        reason="Lintel 15X10 pada DENAH BALOK LINTEL LT.1.",
        manual={"code": "LINTEL", "category": "beam"},
    )
    assert item["category"] == "beam"
    assert item["level"] == "L1"
    assert item["dimensions"]["display"] == "150 × 100 mm"
    assert item["dimensions"]["width_mm"] == 150
    assert item["dimensions"]["depth_mm"] == 100


def test_k0_golden_build_item_foundation_manual_category():
    golden = _load_script_module("quantities_k0_golden")
    item = golden.build_golden_item(
        page_index=38,
        source_path="page-0038.json",
        row={"raw": "PC1", "evidence_refs": ["ev-pc1"]},
        title="DENAH FOOTPLAT",
        drawing_type="foundation_plan",
        discipline="structure",
        level="foundation",
        reason="PC1 pondasi footplat pada DENAH FOOTPLAT.",
        manual={"code": "PC1", "category": "foundation",
                "dimensions": {"display": "tidak tersedia di label; lihat tabel/detail", "source": "none"}},
    )
    assert item["category"] == "foundation"
    assert item["canonical_name"] == "Fondasi PC1"
    assert item["level_display"] == "Fondasi/Substruktur"
    assert item["unit"] == "m3"
    assert item["dimensions"]["source"] == "none"


def test_k0_golden_build_item_steel_profile_no_keyerror():
    # Regression: _dimension_value returns a steel-profile dict without
    # width/depth keys; build_golden_item must not KeyError (page-0055 rows).
    golden = _load_script_module("quantities_k0_golden")
    item = golden.build_golden_item(
        page_index=55,
        source_path="page-0055.json",
        row={"raw": "WF 200X100X5.5X8", "evidence_refs": ["ev-wf"]},
        title="GORDING & PD",
        drawing_type="detail",
        discipline="structure",
        level=None,
        reason="WF 200X100X5.5X8 baja pada GORDING & PD.",
        manual={"code": "WF", "category": "steel_profile", "unit": "kg"},
    )
    assert item["category"] == "steel_profile"
    assert item["unit"] == "kg"
    assert item["dimensions"] is not None
    assert item["dimensions"]["profile"] == "WF"
    # Whole millimetre values render as integers, fractions preserved.
    assert item["dimensions"]["display"] == "WF 200×100×5.5×8 mm"
    assert item["dimensions"]["width_mm"] == 200
    assert item["dimensions"]["tw_mm"] == 5.5
