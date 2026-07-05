"""
PAAX Document Intelligence — AI-assist slice #5: jadwal kusen pintu/jendela
(2026-07-05, lanjutan Fase X2, Claude langsung atas instruksi owner).

Brain-v4.1 F-G11 eksplisit: "KUSEN/PINTU/JENDELA: per SCHEDULE" — beda dari
dinding (tidak ada tabel sama sekali) dan gording/dkk (kode SUDAH dikenal
taksonomi), kusen SEHARUSNYA punya tabel jadwal (tipe/ukuran/jumlah), tapi
`assemble.py::_classify_header` HANYA mengenali header tabel struktur
(kode/dimensi/tul_utama/sengkang/mutu) — tabel jadwal pintu/jendela TIDAK
match header manapun, jadi jatuh sbg teks lepas (`Unclassified`) atau tabel
tak-terklasifikasi, bukan `TypeRecord` rapi.

**Risiko konkret yang WAJIB dihindari (ditemukan saat desain, bukan
tebakan)**: kode tipe pintu/jendela SERING pakai huruf depan "P"/"J" (mis.
"P1" utk Pintu 1) yang BENTROK PERSIS dgn prefiks "P" yang SUDAH dipakai
`paax_schemas.tkg_taxonomy.PREFIKS` utk `pondasi_telapak`. Kalau modul ini
mencoba mengikat ke `ElementRegistryEntry` yang ada via kode asli, "P1"
kusen bisa TERTUKAR dgn "P1" pondasi. Karena itu, SAMA SEPERTI dinding:
hasil modul ini TIDAK PERNAH diikat ke entry kode asli manapun -- selalu
jadi entry SINTETIS berprefiks aman (`KUSEN-AUTO-...`) yang tidak mungkin
bentrok.

Beda dari `wall_assist.py`/`roof_frame_assist.py` (satu usulan per
dokumen/per elemen): jadwal kusen BIASANYA berisi BANYAK BARIS (banyak
tipe pintu/jendela sekaligus) -- modul ini mengembalikan LIST, dan tiap
baris divalidasi INDEPENDEN (baris yang gagal validasi DIBUANG SENDIRI,
tidak menggagalkan seluruh batch -- beda dari roof_frame yang all-or-
nothing per elemen tunggal)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiKusenSuggestion

_MIN_DIM_M = 0.3
_MAX_DIM_M = 6.0
_MIN_QTY = 1
_MAX_QTY = 200
_NUMBER_TOLERANCE = 0.02

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")

KUSEN_KEYWORDS: tuple[str, ...] = (
    "PINTU", "JENDELA", "KUSEN", "DAUN", "JADWAL PINTU", "JADWAL JENDELA",
    "SCHEDULE",
)

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca JADWAL PINTU/JENDELA "
    "dari teks gambar kerja yang sudah diekstrak. Anda HANYA boleh "
    "menggunakan angka yang SUDAH ADA persis di daftar teks -- DILARANG "
    "mengarang. Kembalikan SATU baris per tipe pintu/jendela yang bisa "
    "disimpulkan. Ukuran dalam meter (m)."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "tipe": {"type": "STRING"},
                    "width_m": {"type": "NUMBER", "nullable": True},
                    "height_m": {"type": "NUMBER", "nullable": True},
                    "qty": {"type": "INTEGER", "nullable": True},
                    "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["tipe", "source_texts"],
            },
        },
    },
    "required": ["items"],
}


def has_kusen_keyword(texts: list[str]) -> bool:
    return any(keyword in text.upper() for text in texts for keyword in KUSEN_KEYWORDS)


def _build_user_prompt(document_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in document_texts)
    return (
        f"Daftar teks yang ditemukan di dokumen gambar kerja:\n{joined}\n\n"
        "Cari jadwal/catatan pintu-jendela (tipe, lebar, tinggi, jumlah). "
        "source_texts WAJIB berisi potongan teks PERSIS dari daftar di atas "
        "yang menjadi dasar tiap baris."
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
    tipe: str
    width_m: float | None
    height_m: float | None
    qty: int | None
    source_texts: tuple[str, ...]


def _parse_row(raw: Any) -> _ParsedRow | None:
    if not isinstance(raw, dict):
        return None
    tipe = str(raw.get("tipe") or "").strip()
    if not tipe:
        return None
    source_texts_raw = raw.get("source_texts") or []
    if not isinstance(source_texts_raw, list):
        return None
    source_texts = tuple(str(item).strip() for item in source_texts_raw if str(item).strip())
    if not source_texts:
        return None

    def _num(key: str) -> float | None:
        value = raw.get(key)
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return None

    width_m = _num("width_m")
    height_m = _num("height_m")
    qty_raw = raw.get("qty")
    qty = int(qty_raw) if isinstance(qty_raw, (int, float)) and not isinstance(qty_raw, bool) else None
    return _ParsedRow(tipe=tipe, width_m=width_m, height_m=height_m, qty=qty, source_texts=source_texts)


def _validate_row(row: _ParsedRow, available_texts: tuple[str, ...]) -> bool:
    for src in row.source_texts:
        if not any(src in avail for avail in available_texts):
            return False
    available_numbers = _numbers_in_texts(row.source_texts)
    for value in (row.width_m, row.height_m, row.qty):
        if value is None:
            continue
        if not any(abs(float(value) - candidate) <= _NUMBER_TOLERANCE for candidate in available_numbers):
            return False
    if row.width_m is not None and not (_MIN_DIM_M <= row.width_m <= _MAX_DIM_M):
        return False
    if row.height_m is not None and not (_MIN_DIM_M <= row.height_m <= _MAX_DIM_M):
        return False
    if row.qty is not None and not (_MIN_QTY <= row.qty <= _MAX_QTY):
        return False
    # butuh minimal lebar+tinggi (utk hitung perimeter/luas) DAN qty --
    # baris tanpa itu tidak berguna utk bridging.
    if row.width_m is None or row.height_m is None or row.qty is None:
        return False
    return True


def suggest_kusen_schedule(
    document_texts: list[str],
    client: AiAssistClient,
) -> list[AiKusenSuggestion]:
    """Usulkan baris jadwal kusen dari teks dokumen. List KOSONG kalau
    tidak ada kata kunci/tidak ada baris valid -- setiap baris divalidasi
    INDEPENDEN (baris gagal dibuang sendiri, bukan menggagalkan semua)."""
    if not document_texts or not has_kusen_keyword(document_texts):
        return []

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_build_user_prompt(document_texts),
        response_schema=_RESPONSE_SCHEMA,
    )
    if not raw:
        return []

    items_raw = raw.get("items")
    if not isinstance(items_raw, list):
        return []

    available_texts = tuple(t.strip() for t in document_texts)
    now = datetime.now(timezone.utc).isoformat()
    results: list[AiKusenSuggestion] = []
    for entry in items_raw:
        row = _parse_row(entry)
        if row is None or not _validate_row(row, available_texts):
            continue
        results.append(AiKusenSuggestion(
            tipe=row.tipe,
            width_m=row.width_m,
            height_m=row.height_m,
            qty=row.qty,
            confidence=0.7,
            reasoning=f"disimpulkan dari jadwal pintu/jendela: {', '.join(row.source_texts)}",
            source_texts=list(row.source_texts),
            model=GEMINI_MODEL,
            generated_at=now,
        ))
    return results
