from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.perception.consolidated_models import (
    ConsolidatedExtraction,
    ElementInstanceRef,
    ElementRegistryEntry,
)
from app.perception.work_items import (
    TakeoffItemForWorkItem,
    build_work_items,
    section_for_category,
)


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
    for category in ["kolom", "balok", "sloof", "plat", "ring_balok"]:
        section = section_for_category(category)
        assert section.code == "III"
        assert section.title == "Pekerjaan Struktur"


def test_work_items_endpoint_returns_grouping_response():
    client = TestClient(app)
    response = client.post(
        "/drawings/tkg/work-items",
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
