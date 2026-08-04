"""Revision R1 — definition resolution + noise filter (M2, M8).

Covers the R1 package of the APOLLO revision directive §3.3:

- golden definition resolution: K0 golden labels (LINTEL, CG1, CB1, BL,
  GORDING, PIPA, TS, WF, H, RAFTER, PEDESTAL, 1/2KD) resolve to deterministic
  (code, category) and are promoted to work items when JSON-1 evidence exists;
- K2 noise filter: project title-block labels ("JUDUL PROYEK : … JENDELA (J2)…")
  are filtered out of the label parser/vocabulary;
- M8 status: definition-resolved golden items are "belum dihitung", never
  confirmation material.

All tests are self-contained (no PDF, no DEM JSON-1 files, no network).
"""
from __future__ import annotations

from app.drawing_intelligence.definition_resolution import promote_golden_definition_items
from app.drawing_intelligence.quantities_ai_assist import (
    confirmation_status_for,
    is_perlu_konfirmasi,
)
from app.drawing_intelligence.taxonomy import (
    category_from_code,
    label_looks_like_document_noise,
    resolve_golden_definition,
    taxonomy_for,
)
from app.drawing_intelligence.vocabulary import canonical_key


# ── R1: golden definition resolution ──────────────────────────────────────────


def test_resolve_golden_definition_recognizes_golden_labels():
    cases = {
        # (label, expected_code, expected_category)
        "Lintel 15X10": ("LINTEL", "beam"),
        "LATEI 12X12": ("LATEI", "beam"),
        "Gording 150x50x20x2.3": ("GORDING", "gording"),
        "PIPA Ø8 INCHI": ("PIPA", "pipe"),
        "Trexstang Ø12mm": ("TS", "trekstang"),
        "Trekstang Ø12mm": ("TS", "trekstang"),
        "WF 200X100X5.5X8": ("WF", "steel_profile"),
        "WF 200X100X5.5X8 (KD.1)": ("WF", "steel_profile"),
        "WF1 150X75X5X7": ("WF1", "steel_profile"),
        "1/2KD": ("1/2KD", "kuda_kuda"),
        "Kolom Rafter": ("RAFTER", "steel_profile"),
        "Kolom Pedestal": ("PEDESTAL", "foundation"),
        "H 150X150X7X10": ("H", "steel_profile"),
        "H150X150X7X10": ("H", "steel_profile"),
        "BL": ("BL", "beam"),
        # P5: BAK KONTROL — drainage manhole/water tank (page-0086).
        "BAK KONTROL": ("BAK KONTROL", "water_tank"),
        "Bak Kontrol": ("BAK KONTROL", "water_tank"),
        "BAK KONTROL\n60x60 | 60x60 | 60x60": ("BAK KONTROL", "water_tank"),
    }
    for label, expected in cases.items():
        assert resolve_golden_definition(label) == expected, label


def test_resolve_golden_definition_rejects_noise_and_ordinary_codes():
    assert resolve_golden_definition("JALAN") is None
    assert resolve_golden_definition("DENAH") is None
    assert resolve_golden_definition("GEDUNG PUSAT LAYANAN HAJI DAN UMRAH TERPADU") is None
    assert resolve_golden_definition("K1") is None
    assert resolve_golden_definition("CG1") is None
    assert resolve_golden_definition("B2") is None
    assert resolve_golden_definition("") is None
    assert resolve_golden_definition(None) is None
    # A bare H is too ambiguous without profile dimensions.
    assert resolve_golden_definition("H") is None


def test_canonical_key_golden_fallback():
    assert canonical_key("Lintel 15X10") == "LINTEL"
    assert canonical_key("Gording 150x50x20x2.3") == "GORDING"
    assert canonical_key("PIPA Ø8 INCHI") == "PIPA"
    assert canonical_key("WF 200X100X5.5X8") == "WF"
    assert canonical_key("WF 200X100X5.5X8 (KD.1)") == "WF"
    assert canonical_key("1/2KD") == "1/2KD"
    assert canonical_key("Kolom Rafter") == "RAFTER"
    assert canonical_key("Kolom Pedestal") == "PEDESTAL"
    assert canonical_key("H 150X150X7X10") == "H"
    # Regression: glued H profile must not produce the mangled old key.
    assert canonical_key("H150X150X7X10") == "H"
    # Free text stays None.
    assert canonical_key("JALAN") is None
    assert canonical_key("DENAH") is None


def test_category_from_code_golden_digitless():
    assert category_from_code("TS") == "trekstang"
    assert category_from_code("WF") == "steel_profile"
    assert category_from_code("RAFTER") == "steel_profile"
    assert category_from_code("PEDESTAL") == "foundation"
    assert category_from_code("GORDING") == "gording"
    assert category_from_code("PIPA") == "pipe"


def test_taxonomy_registry_has_trekstang():
    taxonomy = taxonomy_for("trekstang")
    assert taxonomy.category == "trekstang"
    assert taxonomy.discipline == "structure"
    assert taxonomy.code_pattern is not None
    assert taxonomy.code_pattern.fullmatch("TS")
    assert taxonomy.code_pattern.fullmatch("TS-2")


# ── R1: K2 noise filter (project title block) ────────────────────────────────


def test_title_block_label_with_embedded_code_is_noise():
    # F4 finding: "JUDUL PROYEK : … JENDELA (J2) KACA BENING …" was captured as
    # a J2 window item with the whole project title as its label.
    label = (
        "JUDUL PROYEK : GEDUNG PUSAT LAYANAN HAJI DAN UMRAH TERPADU "
        "KOTA SURAKARTA ±0.000 R.STAFF JENDELA (J2) KACA BENING"
    )
    assert label_looks_like_document_noise(label, "J2") is True


def test_concise_explicit_element_reference_is_kept():
    # Concise definitions that are genuine element references stay usable.
    assert label_looks_like_document_noise("JENDELA (J2)", "J2") is False
    assert label_looks_like_document_noise("PINTU D1", "D1") is False
    assert label_looks_like_document_noise("KOLOM K1", "K1") is False


def test_plain_project_title_is_noise():
    assert label_looks_like_document_noise(
        "JUDUL PROYEK : GEDUNG PUSAT LAYANAN HAJI DAN UMRAH TERPADU", "J2"
    ) is True
    assert label_looks_like_document_noise("NAMA PROYEK: PEMBANGUNAN GEDUNG", "P3") is True


# ── R1: golden definition promotion stage ─────────────────────────────────────


def _make_dem_page(labels: list[tuple[str, dict]]) -> dict:
    rows = []
    for raw, extra in labels:
        row = {
            "raw": raw,
            "normalized": raw,
            "bbox": [0.1, 0.1, 0.2, 0.2],
            "evidence_refs": [f"ev-{raw}"],
            "confidence": 0.9,
        }
        row.update(extra)
        rows.append(row)
    return {
        "source": {"page_index": 55, "width_px": 2482, "height_px": 1755},
        "sheet_identity": {"title": {"value": "GORDING & PD"}},
        "observations": {"element_labels": rows, "symbols": [], "dimensions": []},
    }


def test_promote_golden_definition_items_creates_work_items():
    dem_pages = {
        55: _make_dem_page(
            [
                ("Gording 150x50x20x2.3", {}),
                ("PIPA Ø8 INCHI", {}),
                ("Trexstang Ø12mm", {}),
                ("WF 200X100X5.5X8", {}),
                ("1/2KD", {}),
                ("Kolom Rafter", {}),
                ("H 150X150X7X10", {}),
                ("Kolom Pedestal", {}),
            ]
        )
    }
    semantics = {}
    result = promote_golden_definition_items(work_items=[], dem_pages=dem_pages, semantics=semantics)
    by_code = {item.code: item for item in result}
    assert by_code["GORDING"].category == "gording"
    assert by_code["PIPA"].category == "pipe"
    assert by_code["TS"].category == "trekstang"
    assert by_code["WF"].category == "steel_profile"
    assert by_code["1/2KD"].category == "kuda_kuda"
    assert by_code["RAFTER"].category == "steel_profile"
    assert by_code["H"].category == "steel_profile"
    assert by_code["PEDESTAL"].category == "foundation"
    # Every promoted item is definition-resolved, evidenced, and classified.
    for item in result:
        assert item.attributes["definition_resolution"] == "golden"
        assert item.evidence_refs
        assert item.maturity == "classified"
        assert item.page_indices == [55]
    # Inline steel/section dimensions are attached where the label carries them.
    wf = by_code["WF"]
    assert wf.attributes["dimensions"]["profile"] == "WF"
    gording = by_code["GORDING"]
    assert gording.attributes["dimensions"]["profile"] == "GORDING"
    h = by_code["H"]
    assert h.attributes["dimensions"]["profile"] == "H"


def test_promote_golden_definition_items_skips_existing_and_unknown():
    dem_pages = {
        50: _make_dem_page(
            [
                ("G1", {}),
                ("CG1", {}),
                ("CB1", {}),
                ("BL", {}),
                ("JALAN", {}),
            ]
        )
    }
    semantics = {}
    # G1 already exists as a beam work item at L1.
    from app.drawing_intelligence.models import WorkItemCandidate

    existing = [
        WorkItemCandidate(
            work_item_id="work-beam-G1-L1",
            category="beam",
            code="G1",
            label="G1",
            page_indices=[49],
            maturity="classified",  # type: ignore[arg-type]
            occurrence_count_observed=1,
            accepted_detection_count=0,
            geometry_kind="count",
            evidence_refs=["ev-g1"],
            source_candidate_ids=["candidate-g1"],
            attributes={"level": "L1"},
            missing_information=[],
            review_task_ids=[],
            user_accepted=False,
        )
    ]
    result = promote_golden_definition_items(
        work_items=existing, dem_pages=dem_pages, semantics=semantics
    )
    codes = {item.code for item in result}
    assert codes == {"G1", "CG1", "CB1", "BL"}  # JALAN never promoted
    assert sum(1 for item in result if item.code == "G1") == 1  # no duplicate


def test_promote_golden_definition_items_requires_evidence():
    dem_pages = {
        55: _make_dem_page([("WF 200X100X5.5X8", {"evidence_refs": []})])
    }
    result = promote_golden_definition_items(work_items=[], dem_pages=dem_pages, semantics={})
    assert result == []


def test_promote_bak_kontrol_from_table_page_0086():
    """P5: the page-0086 table 'BAK KONTROL\\n60x60 | 60x60 | 60x60' promotes a
    water_tank work item with real 600×600 mm dimensions (DEM evidence)."""
    dem_pages = {
        86: {
            "source": {"page_index": 86, "width_px": 2482, "height_px": 1755},
            "sheet_identity": {"title": {"value": "DENAH SALURAN AIR HUJAN"}},
            "observations": {
                "element_labels": [],
                "symbols": [],
                "dimensions": [],
                "tables": [
                    {
                        "raw": "BAK KONTROL\n60x60 | 60x60 | 60x60",
                        "normalized": "Bak Kontrol dengan ukuran 600x600 mm",
                        "numeric_value": None,
                        "unit": None,
                        "bbox": [100.0, 250.0, 400.0, 350.0],
                        "confidence": 0.97,
                        "status": "extracted",
                        "evidence_refs": ["ev-table-bak-kontrol"],
                    }
                ],
            },
        }
    }
    semantics = {}
    result = promote_golden_definition_items(work_items=[], dem_pages=dem_pages, semantics=semantics)
    assert len(result) == 1
    item = result[0]
    assert item.category == "water_tank"
    assert item.code == "BAK KONTROL"
    assert item.page_indices == [86]
    assert item.evidence_refs == ["ev-table-bak-kontrol"]
    assert item.attributes["definition_resolution"] == "golden"
    dims = item.attributes["dimensions"]
    assert dims["width"] == 600.0
    assert dims["depth"] == 600.0
    assert dims["unit"] == "mm"
    assert dims["source"] == "inline_table"


def test_promote_bak_kontrol_water_tank_naming_and_registry():
    """P5: water_tank is in the taxonomy registry and names canonically."""
    from app.drawing_intelligence.taxonomy import name_formatter, taxonomy_for

    assert taxonomy_for("water_tank").code_pattern.fullmatch("BAK KONTROL")
    assert name_formatter(category="water_tank", code="BAK KONTROL") == "Bak Kontrol BAK KONTROL"


# ── R1: M8 status of definition-resolved items ────────────────────────────────


def test_golden_definition_item_without_dimensions_is_belum_dihitung_not_confirmation():
    dem_pages = {
        50: _make_dem_page([("CG1", {})])
    }
    result = promote_golden_definition_items(work_items=[], dem_pages=dem_pages, semantics={})
    assert len(result) == 1
    item = result[0]
    assert item.category == "beam" and item.code == "CG1"
    assert is_perlu_konfirmasi(item) is False
    assert confirmation_status_for(item) == "belum_dihitung"


def test_golden_definition_item_with_dimensions_is_belum_didukung():
    dem_pages = {
        55: _make_dem_page([("WF 200X100X5.5X8", {})])
    }
    result = promote_golden_definition_items(work_items=[], dem_pages=dem_pages, semantics={})
    item = result[0]
    assert is_perlu_konfirmasi(item) is False
    assert confirmation_status_for(item) in {"belum_didukung", "belum_dihitung"}


def test_plain_coded_item_without_dimensions_stays_confirmation():
    # Regression guard: the R1 gate must NOT change the status of ordinary
    # coded-but-undimensioned items (they remain confirmation material).
    from app.drawing_intelligence.models import WorkItemCandidate

    item = WorkItemCandidate(
        work_item_id="work-column-K1-L1",
        category="column",
        code="K1",
        label="K1",
        page_indices=[0],
        maturity="classified",  # type: ignore[arg-type]
        occurrence_count_observed=1,
        accepted_detection_count=0,
        geometry_kind="count",
        evidence_refs=["ev-k1"],
        source_candidate_ids=["candidate-k1"],
        attributes={"level": "L1"},
        missing_information=[],
        review_task_ids=[],
        user_accepted=False,
    )
    assert is_perlu_konfirmasi(item) is True


# ── R1: golden precedence in infer_category / sheet compatibility ────────────


def test_infer_category_golden_precedence_over_keyword_heuristics():
    from app.drawing_intelligence.vocabulary import infer_category

    # "Kolom Rafter" is a rafter (steel_profile), NOT a column — the incidental
    # "KOLOM" word must not override the golden definition.
    assert infer_category("RAFTER", title="GORDING & PD", raw="Kolom Rafter") == "steel_profile"
    assert infer_category("PEDESTAL", title="GORDING & PD", raw="Kolom Pedestal") == "foundation"
    assert infer_category("1/2KD", title="DENAH ATAP", raw="1/2KD.1") == "kuda_kuda"
    assert infer_category("PIPA", title="DENAH AIR BERSIH", raw="PIPA") == "pipe"
    assert infer_category("WF", title="DENAH ATAP", raw="WF.1") == "steel_profile"
    # Ordinary codes still flow through the keyword/grammar heuristics.
    assert infer_category("K1", title="DENAH KOLOM LANTAI 1", raw="Kolom K1") == "column"
    assert infer_category("J2", title="DENAH PINTU & JENDELA", raw="JENDELA (J2)") == "window"


def test_category_is_compatible_pipe_on_plumbing_sheet():
    from app.drawing_intelligence.cross_reference import _category_is_compatible
    from app.drawing_intelligence.models import SheetSemanticProfile

    plumbing = SheetSemanticProfile(
        page_index=77, title="DENAH AIR BERSIH", discipline="plumbing",
        drawing_type="plumbing_plan", level="L1",
    )
    assert _category_is_compatible("pipe", plumbing) is True
    assert _category_is_compatible("plumbing_fixture", plumbing) is True
    assert _category_is_compatible("pipe", plumbing.model_copy(update={"drawing_type": "drainage_plan"})) is True


def test_title_block_signature_phrases_are_noise():
    assert label_looks_like_document_noise(
        "NAMA TANDA TANGAN RB3 GROUTING T=25MM", "RB3"
    ) is True
    assert label_looks_like_document_noise("DIGAMBAR OLEH: ARSITEK", "RB3") is True
