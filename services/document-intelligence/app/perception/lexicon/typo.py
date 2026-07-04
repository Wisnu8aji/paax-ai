"""Kamus ejaan/typo domain (brain-00 §2.8). Normalisasi HANYA lewat kamus resmi ini."""
from __future__ import annotations

from dataclasses import dataclass

_TYPO_DICT: dict[str, str] = {
    "trexstang": "trekstang",
    "listplank": "lisplank",
    "bowplank": "bouwplank",
    "anstamping": "aanstamping",
}


@dataclass
class TypoResult:
    raw: str
    normal: str
    koreksi: bool


def normalize_typo(s: str) -> TypoResult:
    key = s.strip().lower()
    if key in _TYPO_DICT:
        return TypoResult(raw=s, normal=_TYPO_DICT[key], koreksi=True)
    return TypoResult(raw=s, normal=s, koreksi=False)
