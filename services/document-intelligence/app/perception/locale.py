"""
PAAX Document Intelligence — Deteksi locale angka & normalisasi (brain-00 §2.6).

Gambar Indonesia memakai campuran gaya (koma-desimal atau titik-desimal).
ATURAN: deteksi locale per dokumen dari bukti internal, default id-ID; hasil
dicatat sebagai Assumption (bukan diasumsikan diam-diam). Raw SELALU
disimpan (INV-TKG-03); angka yang gagal grammar -> nilai None, bukan
dikoreksi paksa.
"""
from __future__ import annotations

import re
from typing import Any

_ANGKA_TANPA_PEMISAH = re.compile(r"^\d{3,6}$")
_LEVEL_PATTERN = re.compile(r"^[+\-±]\d+[.,]\d+$")
_KOMA_DESIMAL = re.compile(r"^\d+,\d+$")
_TITIK_DESIMAL = re.compile(r"^\d+\.\d+$")


def detect_locale(spans_text: list[str]) -> dict[str, Any]:
    """Deteksi locale dari bukti internal dokumen. Default id-ID."""
    bukti: list[str] = []
    koma_hits = 0
    titik_hits = 0

    for text in spans_text:
        t = text.strip()
        if _ANGKA_TANPA_PEMISAH.match(t):
            bukti.append(f"grid tanpa pemisah: {t!r}")
        if _LEVEL_PATTERN.match(t):
            bukti.append(f"pola level: {t!r}")
        if _KOMA_DESIMAL.match(t):
            koma_hits += 1
        if _TITIK_DESIMAL.match(t):
            titik_hits += 1

    if koma_hits > titik_hits:
        desimal = ","
    elif titik_hits > koma_hits:
        desimal = "."
    else:
        desimal = "."  # default id-ID modern gambar teknik: titik desimal

    confidence = 0.9 if bukti or koma_hits or titik_hits else 0.4
    return {
        "locale": "id-ID",
        "desimal": desimal,
        "bukti": bukti,
        "confidence": confidence,
    }


def normalize_number(raw: str, locale: dict[str, Any] | None = None) -> dict[str, Any]:
    """Kembalikan {raw, nilai, koreksi}. `nilai=None` bila gagal (bukan ditebak)."""
    locale = locale or {"desimal": "."}
    desimal = locale.get("desimal", ".")
    candidate = raw.strip()

    normalized = candidate
    if desimal == ",":
        # ribuan pakai titik, desimal pakai koma -> id-ID klasik
        normalized = normalized.replace(".", "").replace(",", ".")
    else:
        # ribuan pakai koma (jarang di gambar teknik), desimal titik
        if re.match(r"^\d{1,3}(,\d{3})+(\.\d+)?$", normalized):
            normalized = normalized.replace(",", "")

    try:
        nilai = float(normalized)
    except ValueError:
        return {"raw": raw, "nilai": None, "koreksi": False}

    return {"raw": raw, "nilai": nilai, "koreksi": normalized != candidate}
