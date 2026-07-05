from __future__ import annotations

from app.perception.bridging_atap import bridge_gording, bridge_ikatan_angin, bridge_trekstang
from app.perception.consolidated_models import (
    AiRoofFrameSuggestion,
    ElementDefinisi,
    ElementRegistryEntry,
)


class FakeAtapClient:
    def __init__(self, response: dict | None = None) -> None:
        self.payloads: list[dict] = []
        self.response = response

    def takeoff_atap(self, payload: dict) -> dict:
        self.payloads.append(payload)
        if self.response is not None:
            return self.response
        # tebak work item dari domain yang dikirim (mirip perilaku engine nyata)
        for work, items in payload.items():
            if work == "params" or not items:
                continue
            item = items[0]
            return {
                "domain": "atap",
                "items": [{
                    "kode": item["kode"], "work": work, "quantity": 42.0,
                    "unit": "kg" if work != "trekstang" else "bh",
                    "formula": f"formula-{work}", "detail": "-",
                    "needs_review": False, "review_reason": None, "rule_id": "F-G07",
                }],
                "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 0,
            }
        return {"domain": "atap", "items": [], "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 0}


def _suggestion(kategori: str, fields: dict) -> AiRoofFrameSuggestion:
    return AiRoofFrameSuggestion(
        kategori=kategori, fields=fields, confidence=0.8,
        reasoning="lengkap dari catatan teks", source_texts=["x"],
        model="gemini-2.5-flash", generated_at="2026-07-05T00:00:00+00:00",
    )


def test_bridge_gording_without_any_source_requires_review():
    entry = ElementRegistryEntry(kode="GD1", kategori="gording")
    result = bridge_gording(entry, atap_client=FakeAtapClient())
    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "l_miring_sisi_m" in result.review_reason


def test_bridge_gording_from_rule_based_dimensi_table():
    """Kalau `entry.definisi.dimensi` KEBETULAN punya field dgn nama PERSIS
    sama (mis. dari tabel), pakai itu -- TIDAK perlu AI-assist sama sekali."""
    entry = ElementRegistryEntry(
        kode="GD1", kategori="gording",
        definisi=ElementDefinisi(dimensi={
            "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2.0,
        }),
    )
    client = FakeAtapClient()
    result = bridge_gording(entry, atap_client=client)
    assert result.formula_status == "dihitung"
    assert result.quantity == 42.0
    assert client.payloads[0]["gording"] == [{
        "kode": "GD1", "l_miring_sisi_m": 6.0, "s_gording_m": 1.2,
        "l_arah_gording_m": 8.0, "n_sisi_atap": 2,
    }]


def test_bridge_gording_from_ai_suggestion_when_rule_based_incomplete():
    entry = ElementRegistryEntry(
        kode="GD1", kategori="gording",
        ai_roof_frame_suggestion=_suggestion("gording", {
            "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2.0,
        }),
    )
    result = bridge_gording(entry, atap_client=FakeAtapClient())
    assert result.formula_status == "dihitung"
    assert result.quantity == 42.0


def test_bridge_trekstang_complete_calls_engine():
    entry = ElementRegistryEntry(
        kode="TS1", kategori="trekstang",
        ai_roof_frame_suggestion=_suggestion("trekstang", {
            "panjang_per_batang_m": 3.0, "jumlah": 12.0,
        }),
    )
    client = FakeAtapClient()
    result = bridge_trekstang(entry, atap_client=client)
    assert result.formula_status == "dihitung"
    assert client.payloads[0]["trekstang"] == [{"kode": "TS1", "panjang_per_batang_m": 3.0, "jumlah": 12}]


def test_bridge_ikatan_angin_complete_calls_engine():
    entry = ElementRegistryEntry(
        kode="IA1", kategori="ikatan_angin",
        ai_roof_frame_suggestion=_suggestion("ikatan_angin", {"a_m": 3.0, "b_m": 2.0, "qty": 4.0}),
    )
    client = FakeAtapClient()
    result = bridge_ikatan_angin(entry, atap_client=client)
    assert result.formula_status == "dihitung"
    assert client.payloads[0]["ikatan_angin"] == [{"kode": "IA1", "a_m": 3.0, "b_m": 2.0, "qty": 4}]


def test_bridge_gording_without_client_requires_review():
    entry = ElementRegistryEntry(
        kode="GD1", kategori="gording",
        ai_roof_frame_suggestion=_suggestion("gording", {
            "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2.0,
        }),
    )
    result = bridge_gording(entry, atap_client=None)
    assert result.formula_status == "perlu_review"
    assert "belum tersedia untuk bridging" in result.review_reason


def test_bridge_gording_engine_needs_review_response_propagates():
    entry = ElementRegistryEntry(
        kode="GD1", kategori="gording",
        ai_roof_frame_suggestion=_suggestion("gording", {
            "l_miring_sisi_m": 6.0, "s_gording_m": 1.2, "l_arah_gording_m": 8.0, "n_sisi_atap": 2.0,
        }),
    )
    client = FakeAtapClient(response={
        "domain": "atap",
        "items": [{
            "kode": "GD1", "work": "gording", "quantity": None, "unit": "kg",
            "formula": "-", "detail": "-", "needs_review": True,
            "review_reason": "s_gording_m tidak wajar", "rule_id": "F-G07",
        }],
        "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 1,
    })
    result = bridge_gording(entry, atap_client=client)
    assert result.formula_status == "perlu_review"
    assert result.review_reason == "s_gording_m tidak wajar"
