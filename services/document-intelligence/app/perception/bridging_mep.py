"""
PAAX Document Intelligence — Bridging titik MEP ke core-engine
`/takeoff/mep` (2026-07-05, lanjutan Fase X2, slice TERAKHIR rangkaian
dinding->atap->kusen->MEP, Claude langsung).

Sama pola `bridging_kusen.py`: MEP tidak punya sumber rule-based sama
sekali -- satu-satunya sumber adalah `entry.ai_mep_suggestion` (dari
`ai_assist/mep_assist.py`, HANYA dari catatan jumlah eksplisit di teks)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry

FormulaStatus = str  # "dihitung" | "belum_didukung" | "perlu_review"


class MepTakeoffClient(Protocol):
    def takeoff_mep(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedMepLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpMepTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpMepTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_mep(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/mep",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedMepLine:
    return BridgedMepLine(formula_status="perlu_review", review_reason=reason)


def bridge_mep_point(
    entry: ElementRegistryEntry,
    mep_client: MepTakeoffClient | None = None,
) -> BridgedMepLine:
    suggestion = entry.ai_mep_suggestion
    if suggestion is None:
        return _review(
            "mep: tidak ditemukan catatan jumlah titik MEP eksplisit di teks gambar "
            "-- deteksi simbol/ikon dari gambar belum didukung, perlu input manual"
        )
    if suggestion.count is None:
        return _review("mep: usulan AI tidak lengkap, jumlah (count) tidak tersedia")
    if mep_client is None:
        return _review("core-engine takeoff mep belum tersedia untuk bridging otomatis")

    payload = {
        "railing": [],
        "points": [{"kode": entry.kode, "jenis": suggestion.jenis, "count": suggestion.count}],
        "pipe_routes": [],
        "fixture_fallbacks": [],
    }
    result = mep_client.takeoff_mep(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or "hasil takeoff mep perlu review")
        return BridgedMepLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review("core-engine tidak mengembalikan item mep")
