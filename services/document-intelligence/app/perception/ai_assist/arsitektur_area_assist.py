from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiArsitekturAreaSuggestion

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
_NUMBER_TOLERANCE = 0.05


@dataclass(frozen=True)
class _FieldSpec:
    name: str
    min_value: float
    max_value: float
    required: bool = True


_CATEGORY_FIELDS: dict[str, tuple[_FieldSpec, ...]] = {
    "keramik_dinding": (
        _FieldSpec("keliling_basah_m", 1.0, 100.0, required=True),
        _FieldSpec("h_pasang_m", 0.5, 3.0, required=False),
        _FieldSpec("bukaan_m2", 0.0, 50.0, required=False),
    ),
    "plafon": (
        _FieldSpec("a_neto_m2", 1.0, 500.0, required=True),
        _FieldSpec("keliling_tepi_m", 0.0, 200.0, required=False),
    ),
    "waterproofing": (
        _FieldSpec("a_bidang_m2", 1.0, 500.0, required=True),
        _FieldSpec("keliling_upstand_m", 0.0, 200.0, required=False),
        _FieldSpec("h_upstand_m", 0.05, 2.0, required=False),
    ),
}

_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "keramik_dinding": (
        "KERAMIK DINDING",
        "KERAMIK KM",
        "KERAMIK WC",
        "AREA BASAH",
        "DINDING KAMAR MANDI",
    ),
    "plafon": ("PLAFON", "PLAFOND", "CEILING"),
    "waterproofing": ("WATERPROOFING", "WATERPROOF", "ANTI BOCOR", "KEDAP AIR"),
}

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca catatan arsitektur "
    "area-based dari teks gambar kerja. Anda HANYA boleh memakai angka yang "
    "SUDAH ADA persis di daftar teks. Field opsional boleh null kalau tidak "
    "disebutkan; jangan menebak supaya lengkap."
)


def _response_schema(fields: tuple[_FieldSpec, ...]) -> dict[str, Any]:
    properties: dict[str, Any] = {
        field.name: {"type": "NUMBER", "nullable": True} for field in fields
    }
    properties["confidence"] = {"type": "NUMBER"}
    properties["reasoning"] = {"type": "STRING"}
    properties["source_texts"] = {"type": "ARRAY", "items": {"type": "STRING"}}
    return {
        "type": "OBJECT",
        "properties": properties,
        "required": ["confidence", "reasoning", "source_texts"],
    }


def _has_keyword(kategori: str, texts: list[str]) -> bool:
    keywords = _CATEGORY_KEYWORDS[kategori]
    return any(keyword in text.upper() for text in texts for keyword in keywords)


def _build_user_prompt(kategori: str, fields: tuple[_FieldSpec, ...], texts: list[str]) -> str:
    joined = "\n".join(f"- {text}" for text in texts)
    required = ", ".join(field.name for field in fields if field.required)
    optional = ", ".join(field.name for field in fields if not field.required)
    return (
        f"Kategori: {kategori}.\n"
        f"Field wajib: {required}.\n"
        f"Field opsional: {optional or '-'}.\n"
        f"Daftar teks lintas dokumen:\n{joined}\n\n"
        "Isi field hanya jika angka muncul di teks. source_texts WAJIB berisi "
        "potongan teks persis dari daftar di atas."
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


def _as_optional_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _matches_available(value: float, candidates: set[float]) -> bool:
    return any(abs(value - candidate) <= _NUMBER_TOLERANCE for candidate in candidates)


def suggest_arsitektur_area(
    kategori: str,
    candidate_texts: list[str],
    client: AiAssistClient,
) -> AiArsitekturAreaSuggestion | None:
    fields = _CATEGORY_FIELDS.get(kategori)
    if fields is None or not candidate_texts:
        return None
    if not _has_keyword(kategori, candidate_texts):
        return None

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(kategori, fields, candidate_texts),
        response_schema=_response_schema(fields),
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

    available_texts = tuple(text.strip() for text in candidate_texts)
    for source in source_texts:
        if not any(source in available for available in available_texts):
            return None
    available_numbers = _numbers_in_texts(source_texts)

    values: dict[str, float] = {}
    for field in fields:
        value = _as_optional_float(raw.get(field.name))
        if value is None:
            if field.required:
                return None
            continue
        if not _matches_available(value, available_numbers):
            return None
        if not (field.min_value <= value <= field.max_value):
            return None
        values[field.name] = value

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None

    return AiArsitekturAreaSuggestion(
        kategori=kategori,
        fields=values,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        source_texts=list(source_texts),
        model=GEMINI_MODEL,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

