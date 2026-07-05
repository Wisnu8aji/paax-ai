from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry


FormulaStatus = Literal["dihitung", "belum_didukung", "perlu_review"]


class TanahTakeoffClient(Protocol):
    def takeoff_tanah(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedTakeoffLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpTanahTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpTanahTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_tanah(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/tanah",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _dimensi(entry: ElementRegistryEntry) -> dict[str, float]:
    if entry.definisi is None:
        return {}
    return entry.definisi.dimensi or {}


def _unit_factor(entry: ElementRegistryEntry) -> float:
    unit = (entry.definisi.satuan_dimensi if entry.definisi else "mm").strip().lower()
    if unit == "m":
        return 1.0
    if unit == "cm":
        return 0.01
    if unit == "mm":
        return 0.001
    return 1.0


def _first_dim(dimensi: dict[str, float], keys: tuple[str, ...], factor: float) -> float | None:
    for key in keys:
        value = dimensi.get(key)
        if value is not None:
            return float(value) * factor
    return None


def _review(reason: str) -> BridgedTakeoffLine:
    return BridgedTakeoffLine(formula_status="perlu_review", review_reason=reason)


def bridge_galian_footplat(
    entry: ElementRegistryEntry,
    tanah_client: TanahTakeoffClient | None = None,
) -> BridgedTakeoffLine:
    dimensi = _dimensi(entry)
    factor = _unit_factor(entry)

    b_ft = _first_dim(dimensi, ("b", "b_ft", "lebar", "lebar_bawah"), factor)
    l_ft = _first_dim(dimensi, ("l", "l_ft", "panjang", "panjang_bawah"), factor)
    missing = [name for name, value in (("b", b_ft), ("l", l_ft)) if value is None]
    if missing:
        return _review(f"dimensi footplat tidak lengkap di gambar: {', '.join(missing)}")

    d_gali = _first_dim(dimensi, ("d_gali", "kedalaman_galian"), factor)
    if d_gali is None:
        return _review("kedalaman galian tidak tersedia dari gambar, perlu input manual")

    payload = {
        "footplats": [
            {
                "kode": entry.kode,
                "b_ft": b_ft,
                "l_ft": l_ft,
                "d_gali": d_gali,
                "n": len(entry.instances) or 1,
            }
        ],
        "galian_menerus": [],
        "urugan": [],
        "pemadatan": [],
    }
    if tanah_client is None:
        return _review("core-engine takeoff tanah belum tersedia untuk bridging otomatis")

    result = tanah_client.takeoff_tanah(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode or item.get("work") != "galian_footplat":
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or "hasil takeoff tanah perlu review")
        return BridgedTakeoffLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review("core-engine tidak mengembalikan item galian_footplat")
