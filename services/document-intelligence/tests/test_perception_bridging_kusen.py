from __future__ import annotations

from app.perception.bridging_kusen import bridge_kusen_schedule
from app.perception.consolidated_models import AiKusenSuggestion, ElementRegistryEntry


class FakeKusenClient:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def takeoff_kusen(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {
            "domain": "kusen",
            "items": [{
                "kode": payload["items"][0]["kode"], "work": "kusen_perimeter",
                "quantity": 12.4, "unit": "m",
                "formula": "keliling x qty", "detail": "-",
                "needs_review": False, "review_reason": None, "rule_id": "F-G11",
            }],
            "assumptions": [], "warnings": [], "params_used": [], "n_needs_review": 0,
        }


def _suggestion(**overrides) -> AiKusenSuggestion:
    base = dict(
        tipe="P1", width_m=0.8, height_m=2.1, qty=6,
        confidence=0.7, reasoning="disimpulkan dari jadwal",
        source_texts=["P1 80X210 JUMLAH 6"],
        model="gemini-2.5-flash", generated_at="2026-07-05T00:00:00+00:00",
    )
    base.update(overrides)
    return AiKusenSuggestion(**base)


def _entry(suggestion: AiKusenSuggestion | None) -> ElementRegistryEntry:
    return ElementRegistryEntry(
        kode="KUSEN-AUTO-P1", kategori="kusen", status="perlu_review",
        ai_kusen_suggestion=suggestion,
    )


def test_bridge_kusen_without_ai_suggestion_requires_review():
    result = bridge_kusen_schedule(_entry(None), kusen_client=FakeKusenClient())
    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "tidak ditemukan baris jadwal" in result.review_reason


def test_bridge_kusen_incomplete_suggestion_requires_specific_review():
    result = bridge_kusen_schedule(_entry(_suggestion(qty=None)), kusen_client=FakeKusenClient())
    assert result.formula_status == "perlu_review"
    assert "jumlah (qty)" in result.review_reason


def test_bridge_kusen_complete_suggestion_calls_engine():
    client = FakeKusenClient()
    result = bridge_kusen_schedule(_entry(_suggestion()), kusen_client=client)
    assert result.formula_status == "dihitung"
    assert result.quantity == 12.4
    assert result.rule_id == "F-G11"
    assert client.payloads[0]["items"][0] == {
        "kode": "KUSEN-AUTO-P1", "tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
        "hitung_kusen_perimeter": True, "hitung_daun_area": False, "hitung_kaca_area": False,
        "accessories": [],
    }


def test_bridge_kusen_without_client_requires_review():
    result = bridge_kusen_schedule(_entry(_suggestion()), kusen_client=None)
    assert result.formula_status == "perlu_review"
    assert "belum tersedia untuk bridging" in result.review_reason
