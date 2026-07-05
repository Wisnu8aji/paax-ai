from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry

FormulaStatus = str


class ArsitekturTakeoffClient(Protocol):
    def takeoff_arsitektur(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedArsitekturAreaLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpArsitekturTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpArsitekturTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_arsitektur(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/arsitektur",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedArsitekturAreaLine:
    return BridgedArsitekturAreaLine(formula_status="perlu_review", review_reason=reason)


def _base_payload() -> dict[str, Any]:
    return {
        "pondasi_batu": [],
        "lantai": [],
        "atap": [],
        "aanstamping": [],
        "keramik_dinding": [],
        "plafon": [],
        "waterproofing": [],
    }


def _suggestion_fields(entry: ElementRegistryEntry, kategori: str) -> dict[str, float] | None:
    suggestion = entry.ai_arsitektur_area_suggestion
    if suggestion is None:
        return None
    if suggestion.kategori != kategori:
        return None
    return suggestion.fields


def _require_field(fields: dict[str, float], name: str, kategori: str) -> float | BridgedArsitekturAreaLine:
    value = fields.get(name)
    if value is None:
        return _review(f"{kategori}: usulan AI tidak lengkap, {name} tidak tersedia")
    return value


def _from_engine_result(
    entry: ElementRegistryEntry,
    result: dict[str, Any],
    kategori: str,
) -> BridgedArsitekturAreaLine:
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or f"hasil takeoff {kategori} perlu review")
        return BridgedArsitekturAreaLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review(f"core-engine tidak mengembalikan item {kategori}")


def bridge_keramik_dinding(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "keramik_dinding"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan data keramik dinding basah yang tervalidasi dari teks gambar")
    keliling = _require_field(fields, "keliling_basah_m", kategori)
    if isinstance(keliling, BridgedArsitekturAreaLine):
        return keliling
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["keramik_dinding"].append({
        "kode": entry.kode,
        "keliling_basah_m": keliling,
        "h_pasang_m": fields.get("h_pasang_m"),
        "bukaan_m2": fields.get("bukaan_m2", 0.0),
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)


def bridge_plafon(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "plafon"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan data plafon yang tervalidasi dari teks gambar")
    area = _require_field(fields, "a_neto_m2", kategori)
    if isinstance(area, BridgedArsitekturAreaLine):
        return area
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["plafon"].append({
        "kode": entry.kode,
        "a_neto_m2": area,
        "keliling_tepi_m": fields.get("keliling_tepi_m", 0.0),
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)


def bridge_waterproofing(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "waterproofing"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan data waterproofing yang tervalidasi dari teks gambar")
    area = _require_field(fields, "a_bidang_m2", kategori)
    if isinstance(area, BridgedArsitekturAreaLine):
        return area
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["waterproofing"].append({
        "kode": entry.kode,
        "a_bidang_m2": area,
        "keliling_upstand_m": fields.get("keliling_upstand_m", 0.0),
        "h_upstand_m": fields.get("h_upstand_m"),
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)
