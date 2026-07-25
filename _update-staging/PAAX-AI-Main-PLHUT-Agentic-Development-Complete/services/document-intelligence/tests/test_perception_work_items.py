from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.perception.consolidated_models import (
    AiArsitekturAreaSuggestion,
    ConsolidatedExtraction,
    ElementDefinisi,
    ElementInstanceRef,
    ElementRegistryEntry,
)
from app.perception.work_items import (
    TakeoffItemForWorkItem,
    build_work_items,
    known_tkg_categories,
    section_for_category,
)

AUTH_HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "test-suite"}
_TEST_DIR = Path(__file__).resolve().parent
_SERVICE_DIR = _TEST_DIR.parent
_SERVICES_DIR = _SERVICE_DIR.parent


class FakeArsitekturClient:
    def takeoff_arsitektur(self, payload: dict) -> dict:
        item = payload["plafon"][0]
        return {
            "domain": "arsitektur",
            "items": [{
                "kode": item["kode"],
                "work": "plafon",
                "quantity": item["a_neto_m2"],
                "unit": "m2",
                "formula": "a_neto_m2",
                "detail": "plafon dari bridge arsitektur",
                "needs_review": False,
                "review_reason": None,
                "rule_id": "F-G09",
            }],
            "assumptions": [],
            "warnings": [],
            "params_used": [],
            "n_needs_review": 0,
        }


def test_work_items_grouping_marks_calculated_and_unsupported_without_fabricating_volume():
    consolidated = ConsolidatedExtraction(element_registry=[
        ElementRegistryEntry(
            kode="K1",
            kode_asli=["K1", "KOLOM K1"],
            kategori="kolom",
            instances=[ElementInstanceRef(sheet_page=1, alamat="A1", kode_raw="KOLOM K1")],
        ),
        ElementRegistryEntry(
            kode="SAN1",
            kategori="sanitasi",
            instances=[ElementInstanceRef(sheet_page=7, alamat="Detail sanitasi")],
        ),
    ])
    takeoff_items = [
        TakeoffItemForWorkItem(
            kode="K1",
            kategori="kolom",
            work_type="beton",
            quantity=0.42,
            unit="m3",
            formula="F-B01",
            detail="volume dari core-engine",
            rule_id="F-B01",
        )
    ]

    result = build_work_items(consolidated, takeoff_items)

    calculated = next(item for item in result.work_items if item.kode == "K1")
    assert calculated.formula_status == "dihitung"
    assert calculated.volume == 0.42
    assert calculated.unit == "m3"
    assert calculated.wbs_section == "III"
    assert calculated.source_pages == [1]
    assert calculated.kode_asli == ["K1", "KOLOM K1"]

    unsupported = next(item for item in result.work_items if item.kode == "SAN1")
    assert unsupported.formula_status == "belum_didukung"
    assert unsupported.volume is None
    assert unsupported.unit is None
    assert unsupported.wbs_section == "V"
    assert unsupported.review_reason == "kategori belum memiliki rumus takeoff deterministik"


def test_structural_categories_map_to_wbs_section_iii_via_core_normalize_section():
    for category in ["kolom", "balok", "sloof", "plat", "ring_balok", "gording", "kuda_kuda", "ikatan_angin", "trekstang"]:
        section = section_for_category(category)
        assert section.code == "III"
        assert section.title == "Pekerjaan Struktur"


def test_all_known_tkg_categories_map_to_explicit_wbs_section_not_lainnya():
    categories = known_tkg_categories()

    assert {"gording", "kuda_kuda", "ikatan_angin", "trekstang"} <= categories
    for category in categories:
        assert section_for_category(category).code != "LAINNYA", category


def test_work_items_does_not_import_core_engine_sections_by_filesystem_path():
    source = (_SERVICE_DIR / "app" / "perception" / "work_items.py").read_text(encoding="utf-8")
    takeoff_source = (_SERVICES_DIR / "core-engine" / "app" / "tkg" / "takeoff.py").read_text(encoding="utf-8")

    assert "spec_from_file_location" not in source
    assert "core-engine" not in source
    assert "sys.path.insert" not in source
    assert "except ModuleNotFoundError" not in source
    assert "sys.path.insert" not in takeoff_source
    assert "except ModuleNotFoundError" not in takeoff_source


def test_work_items_pondasi_telapak_without_depth_is_review_not_unsupported():
    consolidated = ConsolidatedExtraction(element_registry=[
        ElementRegistryEntry(
            kode="PC1",
            kode_asli=["PC1"],
            kategori="pondasi_telapak",
            instances=[ElementInstanceRef(sheet_page=1, alamat="A1", kode_raw="PC1")],
            definisi=ElementDefinisi(dimensi={"b": 1.0, "l": 1.0}, satuan_dimensi="m", sumber_halaman=5),
        )
    ])

    result = build_work_items(consolidated, [])
    item = result.work_items[0]

    assert item.work_type == "galian_footplat"
    assert item.formula_status == "perlu_review"
    assert item.volume is None
    assert item.wbs_section == "II"
    assert item.review_reason == "kedalaman galian tidak tersedia dari gambar, perlu input manual"


def test_work_items_derives_pondasi_telapak_category_from_code_when_missing():
    consolidated = ConsolidatedExtraction(element_registry=[
        ElementRegistryEntry(
            kode="PC1",
            kode_asli=["PC1"],
            instances=[ElementInstanceRef(sheet_page=1, alamat="A1", kode_raw="PC1")],
        )
    ])

    result = build_work_items(consolidated, [])
    item = result.work_items[0]

    assert item.kategori == "pondasi_telapak"
    assert item.work_type == "galian_footplat"
    assert item.formula_status == "perlu_review"
    assert item.review_reason == "dimensi footplat tidak lengkap di gambar: b, l"


def test_work_items_bridges_plafon_ai_suggestion_to_arsitektur_section():
    consolidated = ConsolidatedExtraction(element_registry=[
        ElementRegistryEntry(
            kode="PLAFON-AUTO-1",
            kategori="plafon",
            status="perlu_review",
            ai_arsitektur_area_suggestion=AiArsitekturAreaSuggestion(
                kategori="plafon",
                fields={"a_neto_m2": 45.0, "keliling_tepi_m": 28.0},
                confidence=0.8,
                reasoning="area plafon disebut eksplisit",
                source_texts=["PLAFON AREA NETO 45 M2"],
                model="gemini-2.5-flash",
                generated_at="2026-07-05T00:00:00+00:00",
            ),
        )
    ])

    result = build_work_items(consolidated, [], arsitektur_area_client=FakeArsitekturClient())
    item = result.work_items[0]

    assert item.kode == "PLAFON-AUTO-1"
    assert item.kategori == "plafon"
    assert item.work_type == "plafon"
    assert item.formula_status == "dihitung"
    assert item.volume == 45.0
    assert item.unit == "m2"
    assert item.wbs_section == "IV"
    assert item.rule_id == "F-G09"


def test_work_items_endpoint_returns_grouping_response():
    client = TestClient(app)
    response = client.post(
        "/drawings/tkg/work-items",
        headers=AUTH_HEADERS,
        json={
            "consolidated": {
                "element_registry": [
                    {
                        "kode": "K1",
                        "kode_asli": ["K1"],
                        "kategori": "kolom",
                        "instances": [{"sheet_page": 1, "alamat": "A1", "kode_raw": "K1"}],
                    }
                ]
            },
            "takeoff_items": [
                {
                    "kode": "K1",
                    "kategori": "kolom",
                    "work_type": "beton",
                    "quantity": 0.42,
                    "unit": "m3",
                    "formula": "F-B01",
                    "detail": "volume dari core-engine",
                    "rule_id": "F-B01",
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["work_items"][0]["formula_status"] == "dihitung"
    assert data["work_items"][0]["volume"] == 0.42
