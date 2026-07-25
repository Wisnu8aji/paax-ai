"""Kamus prefiks kode tipe elemen (brain-00 §2.1) — bisa diperluas via legenda per-sheet."""
from __future__ import annotations

PREFIX_KATEGORI: dict[str, str] = {
    "P": "pondasi_telapak",
    "PC": "pondasi_telapak",
    "F": "pondasi_telapak",
    "SL": "sloof",
    "K": "kolom",
    "KP": "kolom_praktis",
    "G": "balok",
    "B": "balok",
    "RB": "ring_balok",
    "BL": "latei",
    "LT": "latei",
    "LATEI": "latei",
    "LINTEL": "latei",
    "S": "plat",
    "TG": "tangga",
    "KD": "kuda_kuda",
    "GD": "gording",
    "GORDING": "gording",
    "IA": "ikatan_angin",
    "TS": "trekstang",
}
