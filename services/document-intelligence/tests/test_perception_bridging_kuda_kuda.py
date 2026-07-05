from __future__ import annotations

from app.perception.bridging_kuda_kuda import bridge_kuda_kuda
from app.perception.consolidated_models import AiKudaKudaSuggestion, ElementRegistryEntry


class FakeBajaClient:
    def __init__(self, response: dict | None = None) -> None:
        self.payloads: list[dict] = []
        self.response = response

    def takeoff_baja(self, payload: dict) -> dict:
        self.payloads.append(payload)
        if self.response is not None:
            return self.response
        member = payload["members"][0]
        return {
            "domain": "baja",
            "items": [{
                "kode": member["kode"],
                "work": "baja_member",
                "quantity": 138.45,
                "unit": "kg",
                "formula": "length_m * qty * kg_per_m",
                "detail": "6.5 * 12 * 21.3",
                "needs_review": False,
                "review_reason": None,
                "rule_id": "F-B01",
            }],
            "assumptions": [],
            "warnings": [],
            "params_used": [],
            "n_needs_review": 0,
        }


def _suggestion() -> AiKudaKudaSuggestion:
    return AiKudaKudaSuggestion(
        designation="WF 200.100.5.5.8",
        kg_per_m=21.3,
        length_m=6.5,
        qty=12,
        confidence=0.82,
        reasoning="lengkap dari teks gambar",
        source_texts=["PROFIL WF 200.100.5.5.8", "BERAT PROFIL 21.3 KG/M", "PANJANG 6.5 M", "JUMLAH 12"],
        model="gemini-2.5-flash",
        generated_at="2026-07-05T00:00:00+00:00",
    )


def test_bridge_kuda_kuda_without_ai_suggestion_requires_review():
    entry = ElementRegistryEntry(kode="KD9", kategori="kuda_kuda")

    result = bridge_kuda_kuda(entry, baja_client=FakeBajaClient())

    assert result.formula_status == "perlu_review"
    assert result.quantity is None
    assert "tidak ditemukan data profil baja" in result.review_reason


def test_bridge_kuda_kuda_complete_suggestion_calls_baja_takeoff_client():
    entry = ElementRegistryEntry(kode="KD9", kategori="kuda_kuda", ai_kuda_kuda_suggestion=_suggestion())
    client = FakeBajaClient()

    result = bridge_kuda_kuda(entry, baja_client=client)

    assert result.formula_status == "dihitung"
    assert result.quantity == 138.45
    assert result.unit == "kg"
    assert client.payloads == [{
        "profile_table": {"WF 200.100.5.5.8": {"kg_per_m": 21.3}},
        "members": [{
            "kode": "KD9",
            "designation": "WF 200.100.5.5.8",
            "length_m": 6.5,
            "qty": 12,
        }],
        "builtup_plates": [],
        "paint_members": [],
    }]


def test_bridge_kuda_kuda_without_client_requires_review():
    entry = ElementRegistryEntry(kode="KD9", kategori="kuda_kuda", ai_kuda_kuda_suggestion=_suggestion())

    result = bridge_kuda_kuda(entry, baja_client=None)

    assert result.formula_status == "perlu_review"
    assert "takeoff baja belum tersedia" in result.review_reason


def test_bridge_kuda_kuda_engine_needs_review_response_propagates():
    entry = ElementRegistryEntry(kode="KD9", kategori="kuda_kuda", ai_kuda_kuda_suggestion=_suggestion())
    client = FakeBajaClient(response={
        "domain": "baja",
        "items": [{
            "kode": "KD9",
            "work": "baja_member",
            "quantity": None,
            "unit": "kg",
            "formula": "-",
            "detail": "-",
            "needs_review": True,
            "review_reason": "Profil WF 200.100.5.5.8 tidak ada di profile_table",
            "rule_id": "F-B01",
        }],
        "assumptions": [],
        "warnings": [],
        "params_used": [],
        "n_needs_review": 1,
    })

    result = bridge_kuda_kuda(entry, baja_client=client)

    assert result.formula_status == "perlu_review"
    assert result.review_reason == "Profil WF 200.100.5.5.8 tidak ada di profile_table"

