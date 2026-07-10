"""
PAAX Document Intelligence — Bridging rangka atap non-beton
(gording/trekstang/ikatan_angin) ke core-engine `/takeoff/atap`
(2026-07-05, lanjutan Fase X2, Saya langsung).

Pola PERSIS `bridging_tanah.py` (X1): kategori sudah dikenali & terdeteksi
via kode (GORDING/GD, TS, IA), gap-nya murni bridging + kelengkapan
dimensi -- BUKAN gap deteksi seperti dinding (slice #3). Cek dulu
`entry.definisi.dimensi` (rule-based, dari tabel kalau ada), fallback ke
`entry.ai_roof_frame_suggestion` (AI-assist) kalau rule-based tidak
lengkap.

`kuda_kuda` SENGAJA TIDAK dibridge di sini -- butuh designasi profil baja
(`BajaMember`), gap terpisah (lihat `roof_frame_assist.py`).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import request

from app.perception.consolidated_models import ElementRegistryEntry

FormulaStatus = str  # "dihitung" | "belum_didukung" | "perlu_review"

_REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "gording": ("l_miring_sisi_m", "s_gording_m", "l_arah_gording_m", "n_sisi_atap"),
    "trekstang": ("panjang_per_batang_m", "jumlah"),
    "ikatan_angin": ("a_m", "b_m", "qty"),
}


class AtapTakeoffClient(Protocol):
    def takeoff_atap(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class BridgedAtapLine:
    formula_status: FormulaStatus
    quantity: float | None = None
    unit: str | None = None
    formula: str | None = None
    detail: str | None = None
    rule_id: str | None = None
    review_reason: str | None = None


class HttpAtapTakeoffClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "HttpAtapTakeoffClient | None":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        if not base_url:
            return None
        return cls(base_url)

    def takeoff_atap(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/takeoff/atap",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))


def _review(reason: str) -> BridgedAtapLine:
    return BridgedAtapLine(formula_status="perlu_review", review_reason=reason)


def _resolved_fields(entry: ElementRegistryEntry, kategori: str) -> dict[str, float] | None:
    """Rule-based dulu (`entry.definisi.dimensi`, kalau tabel kebetulan
    punya field dgn nama PERSIS sama), baru AI-assist. Kalau salah satu
    field wajib tidak lengkap di kedua sumber, `None`."""
    required = _REQUIRED_FIELDS[kategori]
    rule_based = entry.definisi.dimensi if entry.definisi else {}
    if all(name in rule_based for name in required):
        return {name: rule_based[name] for name in required}

    suggestion = entry.ai_roof_frame_suggestion
    if suggestion is not None and suggestion.kategori == kategori:
        if all(name in suggestion.fields for name in required):
            return dict(suggestion.fields)
    return None


def _bridge_generic(
    entry: ElementRegistryEntry,
    kategori: str,
    payload_key: str,
    build_item: Any,
    atap_client: AtapTakeoffClient | None,
) -> BridgedAtapLine:
    fields = _resolved_fields(entry, kategori)
    if fields is None:
        missing = _REQUIRED_FIELDS[kategori]
        return _review(
            f"{kategori}: dimensi ({', '.join(missing)}) tidak lengkap dari gambar "
            "(tabel maupun catatan teks) -- perlu input manual"
        )
    if atap_client is None:
        return _review("core-engine takeoff atap belum tersedia untuk bridging otomatis")

    payload = {
        "garis": [], "gording": [], "trekstang": [], "ikatan_angin": [], "downpipes": [],
    }
    payload[payload_key] = [build_item(entry, fields)]
    result = atap_client.takeoff_atap(payload)
    for item in result.get("items", []):
        if item.get("kode") != entry.kode:
            continue
        if item.get("needs_review") or item.get("quantity") is None:
            return _review(item.get("review_reason") or f"hasil takeoff {kategori} perlu review")
        return BridgedAtapLine(
            formula_status="dihitung",
            quantity=float(item["quantity"]),
            unit=item.get("unit"),
            formula=item.get("formula"),
            detail=item.get("detail"),
            rule_id=item.get("rule_id"),
        )
    return _review(f"core-engine tidak mengembalikan item {kategori}")


def bridge_gording(entry: ElementRegistryEntry, atap_client: AtapTakeoffClient | None = None) -> BridgedAtapLine:
    return _bridge_generic(
        entry, "gording", "gording",
        lambda e, f: {
            "kode": e.kode, "l_miring_sisi_m": f["l_miring_sisi_m"],
            "s_gording_m": f["s_gording_m"], "l_arah_gording_m": f["l_arah_gording_m"],
            "n_sisi_atap": int(f["n_sisi_atap"]),
        },
        atap_client,
    )


def bridge_trekstang(entry: ElementRegistryEntry, atap_client: AtapTakeoffClient | None = None) -> BridgedAtapLine:
    return _bridge_generic(
        entry, "trekstang", "trekstang",
        lambda e, f: {
            "kode": e.kode, "panjang_per_batang_m": f["panjang_per_batang_m"],
            "jumlah": int(f["jumlah"]),
        },
        atap_client,
    )


def bridge_ikatan_angin(entry: ElementRegistryEntry, atap_client: AtapTakeoffClient | None = None) -> BridgedAtapLine:
    return _bridge_generic(
        entry, "ikatan_angin", "ikatan_angin",
        lambda e, f: {
            "kode": e.kode, "a_m": f["a_m"], "b_m": f["b_m"], "qty": int(f["qty"]),
        },
        atap_client,
    )
