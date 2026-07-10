"""
PAAX Document Intelligence — AI-assist slice #4: rangka atap non-beton
(gording/trekstang/ikatan_angin) (2026-07-05, lanjutan Fase X2, Saya
langsung atas instruksi owner).

BEDA dari dinding (slice #3): kategori `gording`/`trekstang`/`ikatan_angin`
SUDAH terdaftar di `paax_schemas.tkg_taxonomy.PREFIKS` (kode "GORDING"/"GD",
"TS", "IA") dan SUDAH dikenali `known_tkg_categories()` -- elemen dgn kode
ini SUDAH masuk `ElementRegistryEntry` via jalur normal (sama seperti
kolom/balok). Gap-nya PERSIS pola X1 (galian footplat): `app/tkg/
takeoff.py` (loop utama) tidak punya cabang hitung utk kategori ini --
rumusnya ada di `app/takeoff/atap.py` (`GordingInput`/`TrekstangInput`/
`IkatanAngin`), yang butuh field numerik SPESIFIK per kategori, bukan
`TypeRecord.dimensi` generik.

`kuda_kuda` (rangka utama, biasanya profil baja) SENGAJA TIDAK dicakup di
sini -- itu butuh `BajaMember{designation, length_m, qty}` + tabel bobot
profil (`profile_table`), yaitu data DESIGNASI PROFIL BAJA (mis. "WF
150.75.5.7") yang jauh lebih spesifik & rawan salah kalau ditebak AI dari
teks umum -- dicatat sbg gap terpisah, bukan dipaksakan.

Pola sama dgn `dimension_assist.py`: baca teks halaman `detail_tabel` yang
memuat kode elemen (`_collect_detail_texts`, sudah ada & generik), validasi
anti-halusinasi 2 lapis, rentang wajar per field.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiRoofFrameSuggestion

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")
_NUMBER_TOLERANCE = 0.05


@dataclass(frozen=True)
class _FieldSpec:
    name: str
    min_value: float
    max_value: float
    is_integer: bool = False


# Rentang wajar per field, per kategori -- dari brain-v4.1 §G (F-G07/F-D04/
# F-G0x rangka atap) & akal sehat teknik (bentang atap rumah tinggal biasa).
_CATEGORY_FIELDS: dict[str, tuple[_FieldSpec, ...]] = {
    "gording": (
        _FieldSpec("l_miring_sisi_m", 1.0, 20.0),
        _FieldSpec("s_gording_m", 0.3, 3.0),
        _FieldSpec("l_arah_gording_m", 1.0, 30.0),
        _FieldSpec("n_sisi_atap", 1.0, 4.0, is_integer=True),
    ),
    "trekstang": (
        _FieldSpec("panjang_per_batang_m", 0.5, 10.0),
        _FieldSpec("jumlah", 1.0, 200.0, is_integer=True),
    ),
    "ikatan_angin": (
        _FieldSpec("a_m", 0.5, 20.0),
        _FieldSpec("b_m", 0.5, 20.0),
        _FieldSpec("qty", 1.0, 100.0, is_integer=True),
    ),
}

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca detail gambar rangka atap "
    "(gording/trekstang/ikatan angin) dari teks yang sudah diekstrak. Anda "
    "HANYA boleh menggunakan angka yang SUDAH ADA persis di daftar teks yang "
    "diberikan -- DILARANG mengarang angka baru. Kalau field tidak bisa "
    "disimpulkan, kembalikan null untuk field itu."
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


def _build_user_prompt(kategori: str, kode: str, kode_asli: list[str], detail_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in detail_texts)
    nama_lain = ", ".join(kode_asli) if kode_asli else kode
    field_names = ", ".join(f.name for f in _CATEGORY_FIELDS[kategori])
    return (
        f"Kategori elemen: {kategori}. Kode: {kode} (variasi penulisan: {nama_lain}).\n"
        f"Daftar teks di halaman detail terkait:\n{joined}\n\n"
        f"Tentukan field berikut JIKA bisa disimpulkan: {field_names}. "
        "source_texts WAJIB berisi potongan teks PERSIS dari daftar di atas."
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


def suggest_roof_frame_dimensions(
    kategori: str,
    kode: str,
    kode_asli: list[str],
    detail_texts: list[str],
    client: AiAssistClient,
) -> AiRoofFrameSuggestion | None:
    """Usulkan field numerik rangka atap (gording/trekstang/ikatan_angin)
    dari teks halaman detail. `None` kalau kategori tidak dikenal, tidak ada
    teks, parsing gagal, atau validasi gagal. **Semua field kategori itu
    HARUS lengkap** (beda dari footplat yang boleh sebagian) -- rumus
    gording/trekstang/ikatan_angin butuh semua field sekaligus utk bisa
    dipanggil, tidak ada rumus parsial."""
    fields = _CATEGORY_FIELDS.get(kategori)
    if fields is None or not detail_texts:
        return None

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(kategori, kode, kode_asli, detail_texts),
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

    available_texts = tuple(t.strip() for t in detail_texts)
    for src in source_texts:
        if not any(src in avail for avail in available_texts):
            return None
    available_numbers = _numbers_in_texts(source_texts)

    values: dict[str, float] = {}
    for field in fields:
        value = raw.get(field.name)
        if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
            return None  # semua field WAJIB lengkap
        value = float(value)
        if not any(abs(value - candidate) <= _NUMBER_TOLERANCE for candidate in available_numbers):
            return None
        if not (field.min_value <= value <= field.max_value):
            return None
        values[field.name] = value

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None

    return AiRoofFrameSuggestion(
        kategori=kategori,
        fields=values,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        source_texts=list(source_texts),
        model=GEMINI_MODEL,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
