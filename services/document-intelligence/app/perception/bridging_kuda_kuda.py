from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry

FormulaStatus = str


class BajaTakeoffClient(Protocol):
    def takeoff_baja(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedKudaKudaLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpBajaTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpBajaTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_baja(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/baja",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedKudaKudaLine:
    return BridgedKudaKudaLine(formula_status="perlu_review", review_reason=reason)


def bridge_kuda_kuda(
    entry: ElementRegistryEntry,
    baja_client: BajaTakeoffClient | None = None,
) -> BridgedKudaKudaLine:
    suggestion = entry.ai_kuda_kuda_suggestion
    if suggestion is None:
        return _review(
            "kuda_kuda: tidak ditemukan data profil baja "
            "(designasi/berat/panjang/jumlah) yang tervalidasi dari teks gambar -- perlu input manual"
        )
    if baja_client is None:
        return _review("core-engine takeoff baja belum tersedia untuk bridging otomatis")

    payload = {
        "profile_table": {suggestion.designation: {"kg_per_m": suggestion.kg_per_m}},
        "members": [{
            "kode": entry.kode,
            "designation": suggestion.designation,
            "length_m": suggestion.length_m,
            "qty": suggestion.qty,
        }],
        "builtup_plates": [],
        "paint_members": [],
    }
    result = baja_client.takeoff_baja(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or "hasil takeoff kuda_kuda perlu review")
        return BridgedKudaKudaLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review("core-engine tidak mengembalikan item kuda_kuda")

