from __future__ import annotations

from app.perception.bridging_tanah import bridge_galian_footplat
from app.perception.consolidated_models import (
    ElementDefinisi,
    ElementInstanceRef,
    ElementRegistryEntry,
)


class FakeTanahClient:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def takeoff_tanah(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {
            "domain": "tanah",
            "items": [
                {
                    "kode": "PC1",
                    "work": "galian_footplat",
                    "quantity": 15.36,
                    "unit": "m3 (bank)",
                    "formula": "(b_ft + 2*w_kerja) x (l_ft + 2*w_kerja) x d_gali x n",
                    "detail": "(1+2x0.3) x (1+2x0.3) x 1.5 x 4 = 15.36 m3",
                    "needs_review": False,
                    "review_reason": None,
                    "rule_id": "F-F01",
                }
            ],
            "assumptions": [],
            "warnings": [],
            "params_used": [],
            "n_needs_review": 0,
        }


def _entry(dimensi: dict[str, float]) -> ElementRegistryEntry:
    return ElementRegistryEntry(
        kode="PC1",
        kode_asli=["PC1"],
        kategori="pondasi_telapak",
        instances=[
            ElementInstanceRef(sheet_page=1, alamat="A1", kode_raw="PC1"),
            ElementInstanceRef(sheet_page=1, alamat="B1", kode_raw="PC1"),
            ElementInstanceRef(sheet_page=2, alamat="A1", kode_raw="P C1"),
            ElementInstanceRef(sheet_page=2, alamat="B1", kode_raw="P C1"),
        ],
        definisi=ElementDefinisi(dimensi=dimensi, satuan_dimensi="m", sumber_halaman=5),
    )


def test_bridge_galian_footplat_without_depth_requires_review_and_no_volume():
    result = bridge_galian_footplat(_entry({"b": 1.0, "l": 1.0}), tanah_client=FakeTanahClient())

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert result.review_reason == "kedalaman galian tidak tersedia dari gambar, perlu input manual"


def test_bridge_galian_footplat_incomplete_dimensions_requires_specific_review():
    result = bridge_galian_footplat(_entry({"b": 1.0}), tanah_client=FakeTanahClient())

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert result.review_reason == "dimensi footplat tidak lengkap di gambar: l"


def test_bridge_galian_footplat_complete_dimensions_calls_tanah_engine_client():
    client = FakeTanahClient()

    result = bridge_galian_footplat(_entry({"b": 1.0, "l": 1.0, "d_gali": 1.5}), tanah_client=client)

    assert result.formula_status == "dihitung"
    assert result.quantity == 15.36
    assert result.unit == "m3 (bank)"
    assert result.rule_id == "F-F01"
    assert client.payloads == [
        {
            "footplats": [{"kode": "PC1", "b_ft": 1.0, "l_ft": 1.0, "d_gali": 1.5, "n": 4}],
            "galian_menerus": [],
            "urugan": [],
            "pemadatan": [],
        }
    ]
