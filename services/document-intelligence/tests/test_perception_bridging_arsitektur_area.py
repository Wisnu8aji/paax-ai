from __future__ import annotations

import pytest

from app.perception.bridging_arsitektur_area import (
    bridge_keramik_dinding,
    bridge_plafon,
    bridge_waterproofing,
    bridge_pondasi_batu,
    bridge_lantai,
    bridge_atap_miring,
    bridge_aanstamping,
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
        for key in ("keramik_dinding", "plafon", "waterproofing", "pondasi_batu", "lantai", "atap", "aanstamping"):
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
        ("pondasi_batu", bridge_pondasi_batu),
        ("lantai", bridge_lantai),
        ("atap_miring", bridge_atap_miring),
        ("aanstamping", bridge_aanstamping),
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
        ("pondasi_batu", bridge_pondasi_batu, {"a_atas": 0.3, "a_bawah": 0.6, "h_pond": 0.8}, "l"),
        ("lantai", bridge_lantai, {"panjang": 5.0}, "lebar"),
        ("atap_miring", bridge_atap_miring, {"theta_deg": 30.0}, "a_proyeksi"),
        ("aanstamping", bridge_aanstamping, {"t_aanstamping_m": 0.2, "panjang_m": 10.0}, "a_bawah_m"),
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


def test_bridge_pondasi_batu_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("pondasi_batu", _suggestion("pondasi_batu", {
        "a_atas": 0.3,
        "a_bawah": 0.6,
        "h_pond": 0.8,
        "l": 10.0,
    }))

    result = bridge_pondasi_batu(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [{
            "kode": "PONDASI_BATU-AUTO-1",
            "a_atas": 0.3,
            "a_bawah": 0.6,
            "h_pond": 0.8,
            "l": 10.0,
        }],
        "lantai": [],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [],
    }


def test_bridge_lantai_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("lantai", _suggestion("lantai", {
        "panjang": 5.0,
        "lebar": 4.0,
        "lebar_pintu_total": 0.9,
    }))

    result = bridge_lantai(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [],
        "lantai": [{
            "kode": "LANTAI-AUTO-1",
            "panjang": 5.0,
            "lebar": 4.0,
            "lebar_pintu_total": 0.9,
            "plin": True,
        }],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [],
    }


def test_bridge_atap_miring_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("atap_miring", _suggestion("atap_miring", {
        "a_proyeksi": 100.0,
        "theta_deg": 30.0,
    }))

    result = bridge_atap_miring(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [],
        "lantai": [],
        "atap": [{
            "kode": "ATAP_MIRING-AUTO-1",
            "a_proyeksi": 100.0,
            "theta_deg": 30.0,
        }],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [],
    }


def test_bridge_aanstamping_sends_exact_arsitektur_payload():
    client = FakeArsitekturClient()
    entry = _entry("aanstamping", _suggestion("aanstamping", {
        "a_bawah_m": 0.8,
        "t_aanstamping_m": 0.2,
        "panjang_m": 10.0,
    }))

    result = bridge_aanstamping(entry, arsitektur_client=client)

    assert result.formula_status == "dihitung"
    assert client.payloads[0] == {
        "pondasi_batu": [],
        "lantai": [],
        "atap": [],
        "aanstamping": [{
            "kode": "AANSTAMPING-AUTO-1",
            "a_bawah_m": 0.8,
            "t_aanstamping_m": 0.2,
            "panjang_m": 10.0,
        }],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [],
    }


@pytest.mark.parametrize(
    ("kategori", "bridge_fn", "fields"),
    [
        ("keramik_dinding", bridge_keramik_dinding, {"keliling_basah_m": 18.0}),
        ("plafon", bridge_plafon, {"a_neto_m2": 45.0}),
        ("waterproofing", bridge_waterproofing, {"a_bidang_m2": 32.0}),
        ("pondasi_batu", bridge_pondasi_batu, {"a_atas": 0.3, "a_bawah": 0.6, "h_pond": 0.8, "l": 10.0}),
        ("lantai", bridge_lantai, {"panjang": 5.0, "lebar": 4.0}),
        ("atap_miring", bridge_atap_miring, {"a_proyeksi": 100.0, "theta_deg": 30.0}),
        ("aanstamping", bridge_aanstamping, {"a_bawah_m": 0.8, "t_aanstamping_m": 0.2, "panjang_m": 10.0}),
    ],
)
def test_bridge_arsitektur_area_without_client_requires_review(kategori, bridge_fn, fields):
    result = bridge_fn(_entry(kategori, _suggestion(kategori, fields)), arsitektur_client=None)

    assert result.formula_status == "perlu_review"
    assert "takeoff arsitektur belum tersedia" in result.review_reason

