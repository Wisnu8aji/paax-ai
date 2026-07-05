from __future__ import annotations

from app.perception.bridging_dinding import bridge_dinding_pasangan
from app.perception.consolidated_models import AiDindingSuggestion, ElementRegistryEntry


class FakeDindingClient:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def takeoff_dinding(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {
            "domain": "dinding",
            "items": [
                {
                    "kode": "DINDING-AUTO-1",
                    "work": "pasangan_dinding",
                    "quantity": 136.8,
                    "unit": "m2",
                    "formula": "L*H - bukaan",
                    "detail": "45.6 x 3.0 - 0 = 136.8 m2",
                    "needs_review": False,
                    "review_reason": None,
                    "rule_id": "F-E01",
                }
            ],
            "assumptions": [],
            "warnings": [],
            "params_used": [],
            "n_needs_review": 0,
        }


def _entry(suggestion: AiDindingSuggestion | None) -> ElementRegistryEntry:
    return ElementRegistryEntry(
        kode="DINDING-AUTO-1",
        kategori="dinding",
        status="perlu_review",
        ai_dinding_suggestion=suggestion,
    )


def _suggestion(**overrides) -> AiDindingSuggestion:
    base = dict(
        l_dinding_m=45.6,
        h_dinding_m=3.0,
        bukaan_total_m2=None,
        plester_sisi=0,
        acian=False,
        cat=False,
        confidence=0.8,
        reasoning="panjang & tinggi dinding disebut eksplisit",
        source_texts=["PANJANG DINDING KELILING 45.6 M", "TINGGI 3.0 M"],
        model="gemini-2.5-flash",
        generated_at="2026-07-05T00:00:00+00:00",
    )
    base.update(overrides)
    return AiDindingSuggestion(**base)


def test_bridge_dinding_without_ai_suggestion_requires_review_and_no_volume():
    result = bridge_dinding_pasangan(_entry(None), dinding_client=FakeDindingClient())

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "tidak ditemukan catatan panjang/tinggi dinding" in result.review_reason


def test_bridge_dinding_incomplete_suggestion_requires_specific_review():
    result = bridge_dinding_pasangan(
        _entry(_suggestion(h_dinding_m=None)), dinding_client=FakeDindingClient(),
    )

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "tinggi (h_dinding_m)" in result.review_reason


def test_bridge_dinding_complete_suggestion_calls_dinding_engine_client():
    client = FakeDindingClient()

    result = bridge_dinding_pasangan(_entry(_suggestion()), dinding_client=client)

    assert result.formula_status == "dihitung"
    assert result.quantity == 136.8
    assert result.unit == "m2"
    assert result.rule_id == "F-E01"
    assert client.payloads == [
        {
            "dinding": [{
                "kode": "DINDING-AUTO-1",
                "l_dinding": 45.6,
                "h_dinding": 3.0,
                "bukaan": [],
                "plester_sisi": 0,
                "acian": False,
                "cat": False,
            }],
            "screed": [],
            "sponningan": [],
            "praktis": [],
        }
    ]


def test_bridge_dinding_with_bukaan_total_sends_single_synthetic_opening():
    client = FakeDindingClient()

    bridge_dinding_pasangan(_entry(_suggestion(bukaan_total_m2=3.5)), dinding_client=client)

    sent_bukaan = client.payloads[0]["dinding"][0]["bukaan"]
    assert sent_bukaan == [{"nama": "bukaan_total_dari_ai_assist", "lebar": 3.5, "tinggi": 1.0, "n": 1}]


def test_bridge_dinding_without_client_requires_review():
    result = bridge_dinding_pasangan(_entry(_suggestion()), dinding_client=None)

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "belum tersedia untuk bridging" in result.review_reason
