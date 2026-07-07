"""
PAAX Document Intelligence — AI-assist slice #6 (TERAKHIR dalam rangkaian
dinding→atap→kusen→MEP): titik MEP (lampu/stop kontak/saklar/data)
(2026-07-05, lanjutan Fase X2, Claude langsung).

Brain-v4.1 F-G13: "MEP: titik (lampu/stopkontak/saklar/data) = count;
armatur/fixture = count". Rumus MEP paling sederhana dari 4 kategori non-
struktur (X2 lanjutan) krn HANYA butuh HITUNGAN per jenis (`MepPoint{kode,
jenis, count}`, `app/takeoff/mep.py`) -- tidak ada dimensi geometris sama
sekali.

**Batas jujur SENGAJA (bukan disembunyikan)**: cara PALING AKURAT menghitung
titik MEP adalah menghitung SIMBOL/IKON di gambar denah (ikon lampu, ikon
stop kontak, dst) -- itu genuinely computer-vision/pengenalan-bentuk, DI
LUAR CAKUPAN lapisan AI-assist berbasis-teks proyek ini (`CLAUDE.md` §1.1
eksplisit: vision-on-pixel tetap dihindari). Slice ini HANYA membaca
CATATAN JUMLAH eksplisit yang sudah dinyatakan sbg teks (mis. "TOTAL TITIK
LAMPU: 12") -- kalau catatan itu tidak ada (kemungkinan besar utk banyak
gambar yang cuma menandai simbol tanpa rekap angka), jujur tidak ada usulan
-- BUKAN mencoba menghitung ikon dari piksel."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiMepSuggestion

_MIN_COUNT = 1
_MAX_COUNT = 500
_NUMBER_TOLERANCE = 0.5

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")

MEP_KEYWORDS: tuple[str, ...] = (
    "TITIK", "LAMPU", "STOP KONTAK", "STOPKONTAK", "SAKLAR", "ARMATUR",
    "FIXTURE", "MEP", "STOP-KONTAK",
)

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca CATATAN JUMLAH titik "
    "instalasi listrik/MEP (lampu, stop kontak, saklar, data, dsb) dari teks "
    "gambar kerja yang sudah diekstrak. Anda HANYA boleh menggunakan angka "
    "yang SUDAH ADA persis di daftar teks -- DILARANG mengarang atau "
    "menghitung sendiri dari simbol/ikon (Anda tidak melihat gambar, hanya "
    "teks). Kembalikan SATU baris per jenis titik yang JUMLAHNYA disebutkan "
    "eksplisit sbg angka di teks."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "jenis": {"type": "STRING"},
                    "count": {"type": "INTEGER", "nullable": True},
                    "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["jenis", "source_texts"],
            },
        },
    },
    "required": ["items"],
}


def has_mep_keyword(texts: list[str]) -> bool:
    return any(keyword in text.upper() for text in texts for keyword in MEP_KEYWORDS)


def _build_user_prompt(document_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in document_texts)
    return (
        f"Daftar teks yang ditemukan di dokumen gambar kerja:\n{joined}\n\n"
        "Cari catatan JUMLAH titik MEP eksplisit (mis. 'TOTAL TITIK LAMPU: 12'). "
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


@dataclass(frozen=True)
class _ParsedRow:
    jenis: str
    count: int | None
    source_texts: tuple[str, ...]


def _parse_row(raw: Any) -> _ParsedRow | None:
    if not isinstance(raw, dict):
        return None
    jenis = str(raw.get("jenis") or "").strip()
    if not jenis:
        return None
    source_texts_raw = raw.get("source_texts") or []
    if not isinstance(source_texts_raw, list):
        return None
    source_texts = tuple(str(item).strip() for item in source_texts_raw if str(item).strip())
    if not source_texts:
        return None
    count_raw = raw.get("count")
    count = int(count_raw) if isinstance(count_raw, (int, float)) and not isinstance(count_raw, bool) else None
    return _ParsedRow(jenis=jenis, count=count, source_texts=source_texts)


def _validate_row(row: _ParsedRow, available_texts: tuple[str, ...]) -> bool:
    if row.count is None:
        return False  # tanpa jumlah eksplisit, tidak berguna utk bridging
    for src in row.source_texts:
        if not any(src in avail for avail in available_texts):
            return False
    available_numbers = _numbers_in_texts(row.source_texts)
    if not any(abs(float(row.count) - candidate) <= _NUMBER_TOLERANCE for candidate in available_numbers):
        return False
    if not (_MIN_COUNT <= row.count <= _MAX_COUNT):
        return False
    return True


def suggest_mep_points(
    document_texts: list[str],
    client: AiAssistClient,
    symbol_counts_from_legend: dict[str, int] | None = None,
) -> list[AiMepSuggestion]:
    """Usulkan titik MEP (jenis+jumlah) dari CATATAN TEKS eksplisit. List
    KOSONG kalau tidak ada kata kunci/tidak ada baris valid. Deteksi
    simbol/ikon dari piksel TIDAK dicoba (di luar cakupan, lihat docstring
    modul)."""
    has_text = bool(document_texts and has_mep_keyword(document_texts))
    if not has_text and not symbol_counts_from_legend:
        return []

    raw = None
    if has_text:
        raw = client.generate_json(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=_build_user_prompt(document_texts),
            response_schema=_RESPONSE_SCHEMA,
        )

    items_raw = raw.get("items") if raw else []
    if raw and not isinstance(items_raw, list):
        items_raw = []

    available_texts = tuple(t.strip() for t in document_texts)
    now = datetime.now(timezone.utc).isoformat()
    results: list[AiMepSuggestion] = []
    
    if items_raw:
        for entry in items_raw:
            row = _parse_row(entry)
            if row is None or not _validate_row(row, available_texts):
                continue
            
            confidence = 0.8
            reasoning = f"Diekstrak dari catatan jumlah titik MEP: {', '.join(row.source_texts)}"
            
            if symbol_counts_from_legend and row.count:
                # Coba cari nama yang mirip di legenda
                matched = False
                for legend_name, legend_count in symbol_counts_from_legend.items():
                    # Jika nama mirip (subset)
                    if legend_name.upper() in row.jenis.upper() or row.jenis.upper() in legend_name.upper():
                        if legend_count > 0:
                            if legend_count == row.count:
                                confidence = min(1.0, confidence + 0.15)
                                reasoning += f" (Sangat sesuai dengan hitungan geometri legenda '{legend_name}': {legend_count})"
                            elif legend_count >= row.count * 0.5:
                                confidence = min(1.0, confidence + 0.05)
                                reasoning += f" (Didukung hitungan geometri legenda '{legend_name}': {legend_count})"
                            else:
                                confidence = max(0.0, confidence - 0.2)
                                reasoning += f" [WARNING: Hitungan geometri legenda '{legend_name}' ({legend_count}) jauh di bawah teks ({row.count})]"
                            matched = True
                            break
                            
            results.append(AiMepSuggestion(
                jenis=row.jenis,
                count=row.count,
                confidence=confidence,
                reasoning=reasoning,
                source_texts=list(row.source_texts),
                model=GEMINI_MODEL,
                generated_at=now,
            ))
            
    if not results and symbol_counts_from_legend:
        for legend_name, legend_count in symbol_counts_from_legend.items():
            if legend_count > 0:
                results.append(AiMepSuggestion(
                    jenis=f"{legend_name}-AUTO",
                    count=legend_count,
                    confidence=0.6,
                    reasoning=f"Dihitung otomatis dari kemiripan geometri dengan simbol legenda '{legend_name}'",
                    source_texts=[],
                    model="geometry",
                    generated_at=now,
                ))

    return results
