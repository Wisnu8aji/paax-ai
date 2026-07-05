"""
PAAX Document Intelligence — AI-assist slice #2: fallback klasifikasi zona
halaman (Fase X2). `zone_classifier.py::classify_zone` rule-based sengaja
KONSERVATIF (§0.1): sheet yang judulnya tidak match keyword manapun tetap
jujur `None`/"Belum diketahui" -- lihat sisa gap jujur di `docs/ai-map/
STATE.md` Fase U-2 (2 sheet MEP "DENAH PENANGKAL PETIR"/"DENAH SALURAN AIR
HUJAN" di luar taksonomi zona saat ini). Modul ini menambah usulan AI utk
sheet yang MASIH `None` setelah rule-based -- TIDAK PERNAH menimpa `zone`
asli, murni usulan tambahan (`SheetSummary.zone_ai_suggestion`).

Sesuai `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
§0.1 poin 4 (ditulis 2026-07-13, baru dieksekusi sekarang): "Confidence AI
(LLM) untuk klasifikasi halaman HANYA sbg fallback saat rule-based gagal,
output dibatasi ke enum tertutup (bukan teks bebas), selalu ditandai
assumption, tidak pernah menyentuh angka."
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiZoneSuggestion

# Enum TERTUTUP -- harus sinkron dgn kategori nyata `zone_classifier.py`
# `_ZONE_RULES` + fallback `cover`. Model HANYA boleh memilih salah satu
# dari daftar ini (atau "tidak_yakin"); nilai lain ditolak deterministik.
ZONE_ENUM: tuple[str, ...] = (
    "substruktur",
    "struktur_atap",
    "struktur_lantai_1",
    "struktur_lantai_2",
    "daftar_gambar",
    "situasi",
    "tampak",
    "potongan",
    "detail_tabel",
    "cover",
)
_UNSURE_VALUE = "tidak_yakin"

_SYSTEM_PROMPT = (
    "Anda mengklasifikasi jenis halaman gambar kerja teknik sipil Indonesia "
    "ke SATU kategori zona pekerjaan. Anda HANYA boleh memilih salah satu "
    "nilai persis dari daftar enum yang diberikan di skema. Kalau tidak ada "
    "yang cocok dgn yakin, kembalikan 'tidak_yakin' -- JANGAN memaksakan "
    "kategori yang tidak pas."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "zone": {"type": "STRING", "enum": list(ZONE_ENUM) + [_UNSURE_VALUE]},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
    },
    "required": ["zone", "confidence", "reasoning"],
}


def _build_user_prompt(judul: str | None, context_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in context_texts) if context_texts else "(tidak ada teks lain)"
    judul_line = judul or "(tidak ada judul yang terbaca)"
    enum_list = ", ".join(ZONE_ENUM)
    return (
        f"Judul sheet: {judul_line}\n"
        f"Teks lain di halaman ini:\n{joined}\n\n"
        f"Pilih SATU zona dari: {enum_list}, atau 'tidak_yakin'."
    )


def suggest_zone(
    judul: str | None,
    context_texts: list[str],
    client: AiAssistClient,
) -> AiZoneSuggestion | None:
    """Usulkan kategori zona utk sheet yang gagal diklasifikasi rule-based.
    Mengembalikan `None` kalau tidak ada usulan valid -- caller (`consolidate.
    py`) HARUS membiarkan `zone` tetap `None`, hanya menempel usulan sbg
    metadata tambahan, tidak pernah menimpa nilai asli."""
    if not judul and not context_texts:
        return None

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(judul, context_texts),
        response_schema=_RESPONSE_SCHEMA,
    )
    if not raw:
        return None

    zone = str(raw.get("zone") or "").strip()
    reasoning = str(raw.get("reasoning") or "").strip()
    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        return None

    # Validasi deterministik: HARUS persis salah satu enum tertutup. Nilai
    # "tidak_yakin", string kosong, atau nilai asing APA PUN ditolak sbg
    # kandidat (bukan error -- caller cukup tidak dapat usulan).
    if zone not in ZONE_ENUM:
        return None
    if not reasoning:
        return None

    return AiZoneSuggestion(
        zone=zone,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        model=GEMINI_MODEL,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
