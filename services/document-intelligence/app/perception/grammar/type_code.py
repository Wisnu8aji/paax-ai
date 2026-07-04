"""
Parser kode tipe elemen (brain-00 §2.1). Fungsi murni: string -> hasil ATAU
None (AP-E-04 no-guess). Sufiks huruf = varian BEDA (§2.1a): K1A != K1.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.perception.lexicon.prefixes import PREFIX_KATEGORI

_CODE_PATTERN = re.compile(r"^([A-Za-z]+)(\d+)([A-Za-z]?)$")


@dataclass
class TypeCodeResult:
    kode_raw: str
    prefiks: str | None
    indeks: int | None
    sufiks: str | None
    kategori: str | None
    sumber: str | None  # "kamus" | "legenda" | None
    needs_review: bool = False


def parse_type_code(s: str, legenda: dict[str, str] | None = None) -> TypeCodeResult | None:
    raw = s.strip()
    if not raw:
        return None

    # §2.1c: kode dgn titik/slash disimpan UTUH apa adanya, selalu needs_review.
    if "." in raw or "/" in raw:
        return TypeCodeResult(
            kode_raw=raw, prefiks=None, indeks=None, sufiks=None,
            kategori=None, sumber=None, needs_review=True,
        )

    m = _CODE_PATTERN.match(raw)
    if not m:
        return None

    prefiks = m.group(1).upper()
    indeks = int(m.group(2))
    sufiks = m.group(3) or None

    if prefiks in PREFIX_KATEGORI:
        return TypeCodeResult(
            kode_raw=raw, prefiks=prefiks, indeks=indeks, sufiks=sufiks,
            kategori=PREFIX_KATEGORI[prefiks], sumber="kamus", needs_review=False,
        )
    if legenda and prefiks in legenda:
        return TypeCodeResult(
            kode_raw=raw, prefiks=prefiks, indeks=indeks, sufiks=sufiks,
            kategori=legenda[prefiks], sumber="legenda", needs_review=False,
        )
    # Prefiks di luar kamus & tanpa legenda -> None (caller: W-LEX + needs_review, §2.1b).
    return None
