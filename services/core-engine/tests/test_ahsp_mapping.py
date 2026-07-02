from __future__ import annotations

from app.mapping.ahsp_search import map_workitem_to_ahsp, search_ahsp
from app.mapping.models import AhspMapRequest, AhspSearchRequest, PriceBindRequest, WorkItemForMapping
from app.mapping.price_binding import bind_prices
from app.rab.models import AHSPItem, Component, ResourcePrice


def _ahsp():
    return {
        "A1": AHSPItem(
            code="A1",
            name="Pekerjaan pasangan dinding bata ringan",
            unit="m2",
            components=[
                Component(resource_code="R1", category="bahan", coefficient=1),
                Component(resource_code="R2", category="upah", coefficient=2),
            ],
        ),
        "A2": AHSPItem(
            code="A2",
            name="Pekerjaan beton mutu K-250 termasuk perancah",
            unit="m3",
            components=[Component(resource_code="R3", category="bahan", coefficient=1)],
        ),
    }


def _price(code):
    return ResourcePrice(code=code, name=code, category="bahan", unit="unit", price=100)


def test_ahsp_search_token_dan_unit_anchor():
    result = search_ahsp(AhspSearchRequest(query="pasangan dinding bata ringan", unit="m2", top_k=2), _ahsp())

    assert result.candidates[0].ahsp_code == "A1"
    assert result.candidates[0].unit_ok is True


def test_ahsp_unit_mismatch_tidak_ok():
    result = search_ahsp(AhspSearchRequest(query="pasangan dinding bata ringan", unit="m3", top_k=1), _ahsp())

    assert result.candidates[0].ahsp_code == "A1"
    assert result.candidates[0].unit_ok is False


def test_mapping_included_content_double_count_warning():
    result = map_workitem_to_ahsp(
        AhspMapRequest(
            workitem=WorkItemForMapping(work_id="W1", uraian="beton mutu K-250", unit="m3"),
            sibling_work_types=["perancah"],
            top_k=2,
        ),
        _ahsp(),
    )

    assert result.candidates[0].ahsp_code == "A2"
    assert any("perancah" in w for w in result.warnings)


def test_price_binding_missing_dan_complete_anchor():
    missing = bind_prices(PriceBindRequest(ahsp_code="A1", region_code="jateng"), _ahsp(), {"R1": _price("R1")})
    complete = bind_prices(
        PriceBindRequest(ahsp_code="A1", region_code="jateng"),
        _ahsp(),
        {"R1": _price("R1"), "R2": _price("R2")},
    )

    assert missing.coverage_ratio == 0.5
    assert missing.missing_resources == ["R2"]
    assert complete.coverage_ratio == 1.0
    assert complete.missing_resources == []
