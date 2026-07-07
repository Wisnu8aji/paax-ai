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


def bridge_pondasi_batu(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "pondasi_batu"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan catatan dimensi trapesium eksplisit dari teks gambar -- perlu input manual")
    a_atas = _require_field(fields, "a_atas", kategori)
    if isinstance(a_atas, BridgedArsitekturAreaLine): return a_atas
    a_bawah = _require_field(fields, "a_bawah", kategori)
    if isinstance(a_bawah, BridgedArsitekturAreaLine): return a_bawah
    h_pond = _require_field(fields, "h_pond", kategori)
    if isinstance(h_pond, BridgedArsitekturAreaLine): return h_pond
    l_m = _require_field(fields, "l", kategori)
    if isinstance(l_m, BridgedArsitekturAreaLine): return l_m
    
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["pondasi_batu"].append({
        "kode": entry.kode,
        "a_atas": a_atas,
        "a_bawah": a_bawah,
        "h_pond": h_pond,
        "l": l_m,
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)


def bridge_lantai(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "lantai"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan catatan dimensi lantai eksplisit dari teks gambar -- perlu input manual")
    panjang = _require_field(fields, "panjang", kategori)
    if isinstance(panjang, BridgedArsitekturAreaLine): return panjang
    lebar = _require_field(fields, "lebar", kategori)
    if isinstance(lebar, BridgedArsitekturAreaLine): return lebar
    
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["lantai"].append({
        "kode": entry.kode,
        "panjang": panjang,
        "lebar": lebar,
        "lebar_pintu_total": fields.get("lebar_pintu_total", 0.0),
        "plin": True,
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)


def bridge_atap_miring(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "atap_miring"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan catatan dimensi atap miring eksplisit dari teks gambar -- perlu input manual")
    a_proyeksi = _require_field(fields, "a_proyeksi", kategori)
    if isinstance(a_proyeksi, BridgedArsitekturAreaLine): return a_proyeksi
    theta_deg = _require_field(fields, "theta_deg", kategori)
    if isinstance(theta_deg, BridgedArsitekturAreaLine): return theta_deg
    
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["atap"].append({
        "kode": entry.kode,
        "a_proyeksi": a_proyeksi,
        "theta_deg": theta_deg,
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)


def bridge_aanstamping(
    entry: ElementRegistryEntry,
    arsitektur_client: ArsitekturTakeoffClient | None = None,
) -> BridgedArsitekturAreaLine:
    kategori = "aanstamping"
    fields = _suggestion_fields(entry, kategori)
    if fields is None:
        return _review(f"{kategori}: tidak ditemukan catatan dimensi aanstamping eksplisit dari teks gambar -- perlu input manual")
    a_bawah_m = _require_field(fields, "a_bawah_m", kategori)
    if isinstance(a_bawah_m, BridgedArsitekturAreaLine): return a_bawah_m
    t_aanstamping_m = _require_field(fields, "t_aanstamping_m", kategori)
    if isinstance(t_aanstamping_m, BridgedArsitekturAreaLine): return t_aanstamping_m
    panjang_m = _require_field(fields, "panjang_m", kategori)
    if isinstance(panjang_m, BridgedArsitekturAreaLine): return panjang_m
    
    if arsitektur_client is None:
        return _review("core-engine takeoff arsitektur belum tersedia untuk bridging otomatis")

    payload = _base_payload()
    payload["aanstamping"].append({
        "kode": entry.kode,
        "a_bawah_m": a_bawah_m,
        "t_aanstamping_m": t_aanstamping_m,
        "panjang_m": panjang_m,
    })
    return _from_engine_result(entry, arsitektur_client.takeoff_arsitektur(payload), kategori)
