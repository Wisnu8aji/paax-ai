"""
AI-assist kuda-kuda baja profil.

Berat profil (`kg_per_m`) adalah DATA dari teks gambar. Modul ini menolak
nilai yang tidak bisa dibuktikan muncul di source_texts/detail_texts, walau
nilai itu tampak benar menurut pengetahuan umum tabel baja.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiKudaKudaSuggestion

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
_NUMBER_TOLERANCE = 0.05

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca detail kuda-kuda baja "
    "profil dari teks yang sudah diekstrak. Anda HANYA boleh memakai data "
    "yang SUDAH ADA persis di daftar teks. Anda HANYA boleh mengisi kg_per_m "
    "dari ANGKA YANG SUDAH ADA di daftar teks -- DILARANG KERAS mengisi "
    "berat profil dari pengetahuan umum/tabel baja standar walau Anda "
    "mungkin tahu nilai itu. Kalau berat tidak disebutkan eksplisit di teks, "
    "kembalikan null untuk kg_per_m."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "designation": {"type": "STRING", "nullable": True},
        "kg_per_m": {"type": "NUMBER", "nullable": True},
        "length_m": {"type": "NUMBER", "nullable": True},
        "qty": {"type": "INTEGER", "nullable": True},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
        "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["confidence", "reasoning", "source_texts"],
}


def _build_user_prompt(kode: str, kode_asli: list[str], detail_texts: list[str]) -> str:
    joined = "\n".join(f"- {text}" for text in detail_texts)
    aliases = ", ".join(kode_asli) if kode_asli else kode
    return (
        f"Kategori elemen: kuda_kuda. Kode: {kode} (variasi penulisan: {aliases}).\n"
        f"Daftar teks di halaman detail terkait:\n{joined}\n\n"
        "Tentukan designation profil, kg_per_m, length_m, dan qty HANYA jika "
        "semuanya disebut eksplisit. source_texts WAJIB berisi potongan teks "
        "PERSIS dari daftar di atas."
    )


def _numbers_in_texts(texts: tuple[str, ...]) -> set[float]:
    found: set[float] = set()
    for text in texts:
        for match in _NUMBER_PATTERN.findall(text):
            try:
                found.add(float(match.replace(",", ".")))
            except ValueError:
                continue
    return found


def _number_matches(value: float, candidates: set[float], *, exact: bool = False) -> bool:
    if exact:
        return any(value == candidate for candidate in candidates)
    return any(abs(value - candidate) <= _NUMBER_TOLERANCE for candidate in candidates)


def suggest_kuda_kuda_profile(
    kode: str,
    kode_asli: list[str],
    detail_texts: list[str],
    client: AiAssistClient,
) -> AiKudaKudaSuggestion | None:
    if not detail_texts:
        return None

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(kode, kode_asli, detail_texts),
        response_schema=_RESPONSE_SCHEMA,
    )
    if not raw:
        return None

    reasoning = str(raw.get("reasoning") or "").strip()
    source_texts_raw = raw.get("source_texts") or []
    if not isinstance(source_texts_raw, list):
        return None
    source_texts = tuple(str(item).strip() for item in source_texts_raw if str(item).strip())
    if not reasoning or not source_texts:
        return None

    available_texts = tuple(text.strip() for text in detail_texts)
    for source in source_texts:
        if not any(source in available for available in available_texts):
            return None

    designation = str(raw.get("designation") or "").strip()
    if not designation or not any(designation in source for source in source_texts):
        return None

    available_numbers = _numbers_in_texts(source_texts)
    try:
        kg_per_m_raw = raw.get("kg_per_m")
        length_m_raw = raw.get("length_m")
        qty_raw = raw.get("qty")
        if (
            kg_per_m_raw is None or length_m_raw is None or qty_raw is None
            or isinstance(kg_per_m_raw, bool)
            or isinstance(length_m_raw, bool)
            or isinstance(qty_raw, bool)
        ):
            return None
        kg_per_m = float(kg_per_m_raw)
        length_m = float(length_m_raw)
        qty_float = float(qty_raw)
    except (TypeError, ValueError):
        return None

    if not qty_float.is_integer():
        return None
    qty = int(qty_float)

    if not _number_matches(kg_per_m, available_numbers):
        return None
    if not _number_matches(length_m, available_numbers):
        return None
    if not _number_matches(float(qty), available_numbers, exact=True):
        return None

    if not (0.5 <= kg_per_m <= 300.0):
        return None
    if not (0.5 <= length_m <= 20.0):
        return None
    if not (1 <= qty <= 500):
        return None

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None

    return AiKudaKudaSuggestion(
        designation=designation,
        kg_per_m=kg_per_m,
        length_m=length_m,
        qty=qty,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        source_texts=list(source_texts),
        model=GEMINI_MODEL,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

