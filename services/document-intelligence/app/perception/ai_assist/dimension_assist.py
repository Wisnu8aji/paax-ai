"""
PAAX Document Intelligence — AI-assist slice #1: dimensi footplat dari
halaman detail/grafis (Fase X2, dipicu temuan X1/X1B: 13/13 elemen
`pondasi_telapak` PLHUT nyata jatuh `perlu_review` krn dimensi hanya ada di
halaman detail, bukan tabel kode-dimensi yang bisa diparse `page.find_tables()`).

WAJIB dibaca sebelum mengubah: `CLAUDE.md` §1.1 dan `docs/plans/
PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §X2.

Prinsip (tidak boleh dilanggar):
- Input model HANYA teks (`detail_texts`: baris `Unclassified.raw` dari
  halaman `detail_tabel` yang sudah diekstrak PyMuPDF) -- BUKAN piksel.
- Model DILARANG mengarang angka: setiap angka yang diusulkan (b_mm/l_mm/
  d_gali_mm) harus muncul persis di salah satu `source_texts` yang model
  kutip, dan setiap `source_texts` yang dikutip harus benar-benar ada di
  `detail_texts` asli (dicek `in`, bukan cocok longgar).
- Hasil ini TIDAK PERNAH dipakai langsung sbg input `GalianFootplat`/
  `core-engine` -- ini murni usulan (`AiDimensionSuggestion`) yang
  ditempelkan ke `ElementRegistryEntry.ai_dimension_suggestion`, menunggu
  gerbang review manusia (di luar cakupan modul ini).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiDimensionSuggestion

_MIN_DIM_MM = 100.0
_MAX_DIM_MM = 5000.0
_NUMBER_TOLERANCE_MM = 0.5

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca detail gambar pondasi "
    "telapak (footplat). Anda HANYA boleh menggunakan angka yang SUDAH ADA "
    "persis di daftar teks yang diberikan -- DILARANG mengarang atau "
    "membulatkan angka baru yang tidak tertulis di daftar. Semua dimensi "
    "dalam satuan milimeter (mm). Kalau tidak yakin untuk suatu field, "
    "kembalikan null untuk field itu, jangan menebak."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "b_mm": {"type": "NUMBER", "nullable": True},
        "l_mm": {"type": "NUMBER", "nullable": True},
        "d_gali_mm": {"type": "NUMBER", "nullable": True},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
        "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["confidence", "reasoning", "source_texts"],
}


def _build_user_prompt(kode: str, kode_asli: list[str], detail_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in detail_texts)
    nama_lain = ", ".join(kode_asli) if kode_asli else kode
    return (
        f"Kode elemen: {kode} (variasi penulisan di gambar: {nama_lain}).\n"
        f"Daftar teks/angka yang ditemukan di halaman detail terkait:\n{joined}\n\n"
        "Tentukan b (lebar dasar footplat, mm), l (panjang dasar footplat, mm), "
        "dan d_gali (kedalaman galian, mm) JIKA bisa disimpulkan dari daftar di "
        "atas untuk kode elemen ini. source_texts WAJIB berisi potongan teks "
        "PERSIS (apa adanya, tanpa diubah) dari daftar di atas yang menjadi "
        "dasar kesimpulan Anda."
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


def _matches_available_number(value: float | None, available: set[float]) -> bool:
    if value is None:
        return True
    return any(abs(value - candidate) <= _NUMBER_TOLERANCE_MM for candidate in available)


def _in_plausible_range(value: float | None) -> bool:
    if value is None:
        return True
    return _MIN_DIM_MM <= value <= _MAX_DIM_MM


def _as_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def suggest_footplat_dimensions(
    kode: str,
    kode_asli: list[str],
    detail_texts: list[str],
    client: AiAssistClient,
) -> AiDimensionSuggestion | None:
    """Usulkan b/l/d_gali footplat dari teks halaman detail. Mengembalikan
    `None` kalau tidak ada usulan, parsing gagal, atau validasi anti-
    halusinasi/rentang gagal -- caller HARUS memperlakukan `None` sbg "tidak
    ada usulan", bukan error."""
    if not detail_texts:
        return None

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(kode, kode_asli, detail_texts),
        response_schema=_RESPONSE_SCHEMA,
    )
    if not raw:
        return None

    b_mm = _as_optional_float(raw.get("b_mm"))
    l_mm = _as_optional_float(raw.get("l_mm"))
    d_gali_mm = _as_optional_float(raw.get("d_gali_mm"))
    reasoning = str(raw.get("reasoning") or "").strip()
    source_texts_raw = raw.get("source_texts") or []
    if not isinstance(source_texts_raw, list):
        return None
    source_texts = tuple(str(item).strip() for item in source_texts_raw if str(item).strip())

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None

    # Kalau tidak ada satu pun field yang bisa disimpulkan, tidak ada
    # gunanya jadi kandidat.
    if b_mm is None and l_mm is None and d_gali_mm is None:
        return None
    if not reasoning or not source_texts:
        return None

    # Anti-halusinasi #1: tiap source_text yang dikutip HARUS benar-benar
    # ada (persis, sbg substring) di detail_texts asli -- model tidak boleh
    # "mengutip" teks yang tidak pernah dikirim.
    available_texts = tuple(t.strip() for t in detail_texts)
    for src in source_texts:
        if not any(src in avail for avail in available_texts):
            return None

    # Anti-halusinasi #2: tiap angka yang diusulkan HARUS muncul di angka
    # yang benar-benar ada di source_texts yang dikutip (bukan sembarang
    # teks di halaman -- harus di teks yang model klaim jadi rujukan).
    available_numbers = _numbers_in_texts(source_texts)
    if not (
        _matches_available_number(b_mm, available_numbers)
        and _matches_available_number(l_mm, available_numbers)
        and _matches_available_number(d_gali_mm, available_numbers)
    ):
        return None

    # Rentang wajar -- menolak angka yang kebetulan tertangkap dari teks
    # administratif (mis. tahun anggaran, nomor halaman).
    if not (
        _in_plausible_range(b_mm)
        and _in_plausible_range(l_mm)
        and _in_plausible_range(d_gali_mm)
    ):
        return None

    return AiDimensionSuggestion(
        b_mm=b_mm,
        l_mm=l_mm,
        d_gali_mm=d_gali_mm,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        source_texts=list(source_texts),
        model=GEMINI_MODEL,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
