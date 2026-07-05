from __future__ import annotations

from app.perception.bridging_mep import bridge_mep_point
from app.perception.consolidated_models import AiMepSuggestion, ElementRegistryEntry


class FakeMepClient:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def takeoff_mep(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {
            "domain": "mep",
            "items": [{
                "kode": payload["points"][0]["kode"], "work": "titik_mep",
                "quantity": 12.0, "unit": "titik",
                "formula": "count", "detail": "-",
                "needs_review": False, "review_reason": None, "rule_id": "F-G13",
            }],
            "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 0,
        }


def _suggestion(**overrides) -> AiMepSuggestion:
    base = dict(
        jenis="lampu", count=12, confidence=0.7,
        reasoning="disimpulkan dari catatan jumlah",
        source_texts=["TOTAL TITIK LAMPU 12"],
        model="gemini-2.5-flash", generated_at="2026-07-05T00:00:00+00:00",
    )
    base.update(overrides)
    return AiMepSuggestion(**base)


def _entry(suggestion: AiMepSuggestion | None) -> ElementRegistryEntry:
    return ElementRegistryEntry(
        kode="MEP-AUTO-LAMPU", kategori="mep", status="perlu_review",
        ai_mep_suggestion=suggestion,
    )


def test_bridge_mep_without_ai_suggestion_requires_review():
    result = bridge_mep_point(_entry(None), mep_client=FakeMepClient())
    assert result.formula_status == "perlu_review"
    assert "tidak ditemukan catatan jumlah" in result.review_reason


def test_bridge_mep_incomplete_suggestion_requires_specific_review():
    result = bridge_mep_point(_entry(_suggestion(count=None)), mep_client=FakeMepClient())
    assert result.formula_status == "perlu_review"
    assert "jumlah (count)" in result.review_reason


def test_bridge_mep_complete_suggestion_calls_engine():
    client = FakeMepClient()
    result = bridge_mep_point(_entry(_suggestion()), mep_client=client)
    assert result.formula_status == "dihitung"
    assert result.quantity == 12.0
    assert result.rule_id == "F-G13"
    assert client.payloads[0]["points"] == [{"kode": "MEP-AUTO-LAMPU", "jenis": "lampu", "count": 12}]


def test_bridge_mep_without_client_requires_review():
    result = bridge_mep_point(_entry(_suggestion()), mep_client=None)
    assert result.formula_status == "perlu_review"
    assert "belum tersedia untuk bridging" in result.review_reason
