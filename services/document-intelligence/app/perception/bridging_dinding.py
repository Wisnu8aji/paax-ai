"""
PAAX Document Intelligence — Bridging dinding pasangan bata ke core-engine
`/takeoff/dinding` (2026-07-05, lanjutan Fase X2, dikerjakan langsung Claude
atas instruksi owner — mengikuti pola `bridging_tanah.py` persis).

Beda dari `bridge_galian_footplat` (X1): footplat punya `ElementRegistryEntry.
definisi.dimensi` dari tabel kode-dimensi (rule-based, hanya kurang lengkap).
Dinding TIDAK PUNYA sumber rule-based sama sekali (lihat audit B0
`docs/ai-map/STATE.md`) — satu-satunya sumber data adalah
`entry.ai_dinding_suggestion` (dari `ai_assist/wall_assist.py`). Kalau
sumber itu kosong/tidak lengkap, hasil JUJUR `perlu_review` — TIDAK PERNAH
mengarang panjang/tinggi dinding.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry


FormulaStatus = str  # "dihitung" | "belum_didukung" | "perlu_review"


class DindingTakeoffClient(Protocol):
    def takeoff_dinding(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedDindingLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpDindingTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpDindingTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_dinding(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/dinding",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedDindingLine:
    return BridgedDindingLine(formula_status="perlu_review", review_reason=reason)


def bridge_dinding_pasangan(
    entry: ElementRegistryEntry,
    dinding_client: DindingTakeoffClient | None = None,
) -> BridgedDindingLine:
    suggestion = entry.ai_dinding_suggestion
    if suggestion is None:
        return _review(
            "dinding: tidak ditemukan catatan panjang/tinggi dinding eksplisit di "
            "teks gambar; deteksi otomatis dari garis gambar (geometri) belum "
            "didukung -- perlu input manual"
        )

    missing = [
        name for name, value in (
            ("panjang (l_dinding_m)", suggestion.l_dinding_m),
            ("tinggi (h_dinding_m)", suggestion.h_dinding_m),
        ) if value is None
    ]
    if missing:
        return _review(f"dinding: usulan AI tidak lengkap, {', '.join(missing)} tidak tersedia")

    bukaan: list[dict[str, Any]] = []
    if suggestion.bukaan_total_m2 and suggestion.bukaan_total_m2 > 0:
        # Simplifikasi disengaja: engine butuh List[Bukaan] (nama/lebar/tinggi/n),
        # tapi usulan AI hanya berupa TOTAL luas bukaan (tidak dipecah per lubang
        # -- memecahnya butuh info individual yang jarang eksplisit di teks).
        # Direpresentasikan sbg SATU entri "bukaan_total" dgn lebar=total_m2,
        # tinggi=1.0, n=1 -- secara matematis identik utk tujuan pengurangan luas.
        bukaan.append({
            "nama": "bukaan_total_dari_ai_assist",
            "lebar": suggestion.bukaan_total_m2,
            "tinggi": 1.0,
            "n": 1,
        })

    payload = {
        "dinding": [
            {
                "kode": entry.kode,
                "l_dinding": suggestion.l_dinding_m,
                "h_dinding": suggestion.h_dinding_m,
                "bukaan": bukaan,
                "plester_sisi": suggestion.plester_sisi,
                "acian": suggestion.acian,
                "cat": suggestion.cat,
            }
        ],
        "screed": [],
        "sponningan": [],
        "praktis": [],
    }
    if dinding_client is None:
        return _review("core-engine takeoff dinding belum tersedia untuk bridging otomatis")

    result = dinding_client.takeoff_dinding(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or "hasil takeoff dinding perlu review")
        return BridgedDindingLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review("core-engine tidak mengembalikan item pasangan dinding")
