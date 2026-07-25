from __future__ import annotations

import pytest

from app.perception.bridging_arsitektur_area import (
    bridge_keramik_dinding,
    bridge_plafon,
    bridge_waterproofing,
)
from app.perception.consolidated_models import AiArsitekturAreaSuggestion, ElementRegistryEntry


class FakeArsitekturClient:
    def __init__(self, response: dict | None = None) -> None:
        self.payloads: list[dict] = []
        self.response = response

    def takeoff_arsitektur(self, payload: dict) -> dict:
        self.payloads.append(payload)
        if self.response is not None:
            return self.response
        for key in ("keramik_dinding", "plafon", "waterproofing"):
            if payload[key]:
                item = payload[key][0]
                return {
                    "domain": "arsitektur",
                    "items": [{
                        "kode": item["kode"],
                        "work": key,
                        "quantity": 45.0,
                        "unit": "m2",
                        "formula": f"formula-{key}",
                        "detail": "-",
                        "needs_review": False,
                        "review_reason": None,
                        "rule_id": "F-G09",
                    }],
                    "assumptions": [],
                    "warnings": [],
                    "params_used": [],
                    "n_needs_review": 0,
                }
        return {"domain": "arsitektur", "items": [], "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 0}


def _suggestion(kategori: str, fields: dict[str, float]) -> AiArsitekturAreaSuggestion:
    return AiArsitekturAreaSuggestion(
        kategori=kategori,
        fields=fields,
        confidence=0.8,
        reasoning="data eksplisit dari teks gambar",
        source_texts=["x"],
        model="gemini-2.5-flash",
        generated_at="2026-07-05T00:00:00+00:00",
    )


def _entry(kategori: str, suggestion: AiArsitekturAreaSuggestion | None) -> ElementRegistryEntry:
    return ElementRegistryEntry(
        kode=f"{kategori.upper()}-AUTO-1",
        kategori=kategori,
        status="perlu_review",
        ai_arsitektur_area_suggestion=suggestion,
    )


@pytest.mark.parametrize(
    ("kategori", "bridge_fn"),
    [
        ("keramik_dinding", bridge_keramik_dinding),
        ("plafon", bridge_plafon),
        ("waterproofing", bridge_waterproofing),
    ],
)
def test_bridge_arsitektur_area_without_ai_suggestion_requires_review(kategori, bridge_fn):
    result = bridge_fn(_entry(kategori, None), arsitektur_client=FakeArsitekturClient())

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert kategori in result.review_reason


@pytest.mark.parametrize(
    ("kategori", "bridge_fn", "fields", "required_field"),
    [
        ("keramik_dinding", bridge_keramik_dinding, {"h_pasang_m": 1.6}, "keliling_basah_m"),
        ("plafon", bridge_plafon, {"keliling_tepi_m": 28.0}, "a_neto_m2"),
        ("waterproofing", bridge_waterproofing, {"keliling_upstand_m": 22.0}, "a_bidang_m2"),
    ],
)
def test_bridge_arsitektur_area_missing_required_field_requires_specific_review(kategori, bridge_fn, fields, required_field):
    result = bridge_fn(_entry(kategori, _suggestion(kategori, fields)), arsitektur_client=FakeArsitekturClient())

    assert result.formula_status == "perlu_review"
    assert required_field in result.review_reason


def test_bridge_keramik_dinding_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("keramik_dinding", _suggestion("keramik_dinding", {
        "keliling_basah_m": 18.0,
        "h_pasang_m": 1.6,
        "bukaan_m2": 2.4,
    }))

    result = bridge_keramik_dinding(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads == [{
        "pondasi_batu": [],
        "lantai": [],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [{
            "kode": "KERAMIK_DINDING-AUTO-1",
            "keliling_basah_m": 18.0,
            "h_pasang_m": 1.6,
            "bukaan_m2": 2.4,
        }],
        "plafon": [],
        "waterproofing": [],
    }]


def test_bridge_plafon_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("plafon", _suggestion("plafon", {
        "a_neto_m2": 45.0,
        "keliling_tepi_m": 28.0,
    }))

    result = bridge_plafon(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [],
        "lantai": [],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [{
            "kode": "PLAFON-AUTO-1",
            "a_neto_m2": 45.0,
            "keliling_tepi_m": 28.0,
        }],
        "waterproofing": [],
    }


def test_bridge_waterproofing_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("waterproofing", _suggestion("waterproofing", {
        "a_bidang_m2": 32.0,
        "keliling_upstand_m": 22.0,
        "h_upstand_m": 0.25,
    }))

    result = bridge_waterproofing(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [],
        "lantai": [],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [{
            "kode": "WATERPROOFING-AUTO-1",
            "a_bidang_m2": 32.0,
            "keliling_upstand_m": 22.0,
            "h_upstand_m": 0.25,
        }],
    }


@pytest.mark.parametrize(
    ("kategori", "bridge_fn", "fields"),
    [
        ("keramik_dinding", bridge_keramik_dinding, {"keliling_basah_m": 18.0}),
        ("plafon", bridge_plafon, {"a_neto_m2": 45.0}),
        ("waterproofing", bridge_waterproofing, {"a_bidang_m2": 32.0}),
    ],
)
def test_bridge_arsitektur_area_without_client_requires_review(kategori, bridge_fn, fields):
    result = bridge_fn(_entry(kategori, _suggestion(kategori, fields)), arsitektur_client=None)

    assert result.formula_status == "perlu_review"
    assert "takeoff arsitektur belum tersedia" in result.review_reason

