"""
PAAX Document Intelligence — Bridging jadwal kusen pintu/jendela ke
core-engine `/takeoff/kusen` (2026-07-05, lanjutan Fase X2, Claude
langsung).

Sama pola `bridging_dinding.py`: kusen TIDAK PUNYA sumber rule-based sama
sekali di pipeline saat ini (tabel jadwal pintu/jendela belum dikenali
`assemble.py::_classify_header`) -- satu-satunya sumber data adalah
`entry.ai_kusen_suggestion` (dari `ai_assist/kusen_assist.py`). Default
konservatif: `hitung_kusen_perimeter=True` (F-G11: "kusen L = keliling"),
`hitung_daun_area`/`hitung_kaca_area=False` (tidak diasumsikan tanpa bukti
teks eksplisit)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry

FormulaStatus = str  # "dihitung" | "belum_didukung" | "perlu_review"


class KusenTakeoffClient(Protocol):
    def takeoff_kusen(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedKusenLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpKusenTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpKusenTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_kusen(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/kusen",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedKusenLine:
    return BridgedKusenLine(formula_status="perlu_review", review_reason=reason)


def bridge_kusen_schedule(
    entry: ElementRegistryEntry,
    kusen_client: KusenTakeoffClient | None = None,
) -> BridgedKusenLine:
    suggestion = entry.ai_kusen_suggestion
    if suggestion is None:
        return _review(
            "kusen: tidak ditemukan baris jadwal pintu/jendela yang tervalidasi dari "
            "teks gambar -- perlu input manual"
        )
    missing = [
        name for name, value in (
            ("lebar (width_m)", suggestion.width_m),
            ("tinggi (height_m)", suggestion.height_m),
            ("jumlah (qty)", suggestion.qty),
        ) if value is None
    ]
    if missing:
        return _review(f"kusen: usulan AI tidak lengkap, {', '.join(missing)} tidak tersedia")

    if kusen_client is None:
        return _review("core-engine takeoff kusen belum tersedia untuk bridging otomatis")

    payload = {
        "items": [{
            "kode": entry.kode,
            "tipe": suggestion.tipe,
            "width_m": suggestion.width_m,
            "height_m": suggestion.height_m,
            "qty": suggestion.qty,
            "hitung_kusen_perimeter": True,
            "hitung_daun_area": False,
            "hitung_kaca_area": False,
            "accessories": [],
        }],
    }
    result = kusen_client.takeoff_kusen(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or "hasil takeoff kusen perlu review")
        return BridgedKusenLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review("core-engine tidak mengembalikan item kusen")
