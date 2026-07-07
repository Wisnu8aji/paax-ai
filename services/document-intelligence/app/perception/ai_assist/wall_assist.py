"""
PAAX Document Intelligence — AI-assist slice #3: dinding pasangan bata
(Fase X2 lanjutan, 2026-07-05, dikerjakan langsung Claude atas instruksi
owner). Latar: `docs/ai-map/STATE.md` audit B0 menemukan `/takeoff/dinding`
(core-engine) SUDAH lengkap+teruji, tapi TIDAK PERNAH dipanggil karena
`document-intelligence` tidak pernah mendeteksi elemen berkategori
"dinding" sama sekali — beda dari kolom/balok/footplat yang punya kode
titik (K1, PC1) yang bisa diikat ke tabel, dinding pasangan bata BIASANYA
TIDAK diberi kode per-segmen di gambar kerja Indonesia — cuma digambar sbg
garis tebal + (kadang) satu catatan spesifikasi umum ("PASANGAN DINDING
BATA 1/2 BATU TINGGI 3M", dsb).

Keputusan desain (dicatat eksplisit, ini BUKAN coba-coba tanpa pikir):
- **Tidak mencoba deteksi geometri garis-dinding dari `page.get_drawings()`**
  (deteksi pasangan garis sejajar/ruang antar sisi dinding) di slice ini —
  itu pekerjaan computer-vision vektor yang jauh lebih besar (mirip beban
  kerja `grid_geometry.py` yang perlu validasi analitis geometri PDF asli
  sebelum ditulis) dan TIDAK cocok jadi vertical slice sempit. Dicatat
  jujur sbg gap masa depan (§ akhir file ini), bukan disembunyikan.
- **Yang DIKERJAKAN**: cari CATATAN TEKS eksplisit ttg panjang & tinggi
  dinding (unclassified text YANG SUDAH diekstrak PyMuPDF, bukan piksel) —
  banyak gambar kerja sederhana MEMANG menyebutkan total panjang/tinggi
  dinding sbg catatan umum, bukan per-segmen. Kalau catatan itu ADA, AI-
  assist menyusunnya jadi kandidat tervalidasi. Kalau TIDAK ADA
  (kemungkinan besar utk gambar tanpa catatan eksplisit) → jujur
  `belum_didukung`, BUKAN ditebak dari geometri.
- Material (bata/hebel/batako) SENGAJA tidak diekstrak di sini — itu
  memengaruhi PEMILIHAN kode AHSP (Tahap 3 pipeline), bukan rumus volume
  (`A = L*H - bukaan` sama utk semua material). Plester/acian/cat default
  KONSERVATIF (tidak diasumsikan) kecuali disebut eksplisit di teks.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.perception.ai_assist.client import GEMINI_MODEL, AiAssistClient
from app.perception.consolidated_models import AiDindingSuggestion

_MIN_PANJANG_M = 1.0
_MAX_PANJANG_M = 200.0
_MIN_TINGGI_M = 2.0
_MAX_TINGGI_M = 6.0
_NUMBER_TOLERANCE = 0.05

_NUMBER_PATTERN = re.compile(r"\d+(?:[.,]\d+)?")

# Keyword pemicu SEBELUM AI dipanggil sama sekali (fast filter, gratis) —
# kalau tidak ada satu pun keyword ini di seluruh dokumen, jangan panggil
# LLM sama sekali (hemat biaya, konsisten CLAUDE.md §1.1 "biaya & latency
# dipertimbangkan").
WALL_KEYWORDS: tuple[str, ...] = (
    "DINDING", "PASANGAN", "BATA", "HEBEL", "BATAKO", "PARTISI",
)

_SYSTEM_PROMPT = (
    "Anda membantu estimator sipil Indonesia membaca CATATAN TEKS spesifikasi "
    "dinding pasangan bata dari gambar kerja. Anda HANYA boleh menggunakan "
    "angka yang SUDAH ADA persis di daftar teks yang diberikan -- DILARANG "
    "mengarang atau menebak angka baru. Satuan panjang/tinggi dalam meter (m). "
    "Kalau daftar teks TIDAK menyebutkan panjang ATAU tinggi dinding secara "
    "eksplisit, kembalikan null untuk field itu -- JANGAN menebak dari "
    "informasi lain (mis. dimensi bangunan)."
)

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "l_dinding_m": {"type": "NUMBER", "nullable": True},
        "h_dinding_m": {"type": "NUMBER", "nullable": True},
        "bukaan_total_m2": {"type": "NUMBER", "nullable": True},
        "plester_sisi": {"type": "INTEGER", "nullable": True},
        "acian": {"type": "BOOLEAN", "nullable": True},
        "cat": {"type": "BOOLEAN", "nullable": True},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
        "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["confidence", "reasoning", "source_texts"],
}


def has_wall_keyword(texts: list[str]) -> bool:
    """Fast filter GRATIS sebelum panggil LLM sama sekali."""
    return any(
        keyword in text.upper() for text in texts for keyword in WALL_KEYWORDS
    )


def _build_user_prompt(candidate_texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in candidate_texts)
    return (
        f"Daftar teks yang ditemukan di dokumen gambar kerja (semua halaman):\n{joined}\n\n"
        "Cari catatan spesifikasi dinding pasangan bata (panjang total, tinggi, "
        "ada/tidaknya plester/acian/cat, luas bukaan bila disebutkan). "
        "source_texts WAJIB berisi potongan teks PERSIS dari daftar di atas "
        "yang menjadi dasar kesimpulan Anda."
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


def _matches_available(value: float | None, available: set[float]) -> bool:
    if value is None:
        return True
    return any(abs(value - candidate) <= _NUMBER_TOLERANCE for candidate in available)


def _as_optional_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def suggest_dinding_pasangan(
    candidate_texts: list[str],
    client: AiAssistClient,
    geometry_candidate_m: float | None = None,
) -> AiDindingSuggestion | None:
    """Usulkan panjang/tinggi/bukaan dinding dari catatan teks eksplisit.
    `None` kalau tidak ada catatan yang bisa disimpulkan, parsing gagal, atau
    validasi anti-halusinasi/rentang gagal."""
    has_text = bool(candidate_texts and has_wall_keyword(candidate_texts))
    if not has_text and geometry_candidate_m is None:
        return None

    raw = None
    if has_text:
        raw = client.generate_json(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=_build_user_prompt(candidate_texts),
            response_schema=_RESPONSE_SCHEMA,
        )

    l_dinding_m = _as_optional_float(raw.get("l_dinding_m")) if raw else None
    h_dinding_m = _as_optional_float(raw.get("h_dinding_m")) if raw else None
    bukaan_total_m2 = _as_optional_float(raw.get("bukaan_total_m2")) if raw else None
    reasoning = str(raw.get("reasoning") or "").strip() if raw else ""
    
    source_texts_raw = raw.get("source_texts") or [] if raw else []
    if raw and not isinstance(source_texts_raw, list):
        return None
    source_texts = tuple(str(item).strip() for item in source_texts_raw if str(item).strip())

    try:
        confidence = float(raw.get("confidence", 0.0)) if raw else 0.0
    except (TypeError, ValueError):
        confidence = 0.0

    if l_dinding_m is None and h_dinding_m is None and geometry_candidate_m is None:
        return None
        
    if raw:
        if not reasoning or not source_texts:
            return None
        available_texts = tuple(t.strip() for t in candidate_texts)
        for src in source_texts:
            if not any(src in avail for avail in available_texts):
                return None

        available_numbers = _numbers_in_texts(source_texts)
        if not (
            _matches_available(l_dinding_m, available_numbers)
            and _matches_available(h_dinding_m, available_numbers)
            and _matches_available(bukaan_total_m2, available_numbers)
        ):
            return None

        if l_dinding_m is not None and not (_MIN_PANJANG_M <= l_dinding_m <= _MAX_PANJANG_M):
            return None
        if h_dinding_m is not None and not (_MIN_TINGGI_M <= h_dinding_m <= _MAX_TINGGI_M):
            return None
        if bukaan_total_m2 is not None and bukaan_total_m2 < 0:
            return None

    plester_sisi_raw = raw.get("plester_sisi") if raw else None
    plester_sisi = 0
    if isinstance(plester_sisi_raw, (int, float)) and not isinstance(plester_sisi_raw, bool):
        candidate = int(plester_sisi_raw)
        if candidate in (0, 1, 2):
            plester_sisi = candidate
            
    now = datetime.now(timezone.utc).isoformat()
    if not raw and geometry_candidate_m is not None:
        return AiDindingSuggestion(
            l_dinding_m=geometry_candidate_m,
            h_dinding_m=None,
            bukaan_total_m2=None,
            plester_sisi=0,
            acian=False,
            cat=False,
            confidence=0.6,
            reasoning=f"Kandidat geometri independen ({geometry_candidate_m:.2f}m), teks dinding tidak ditemukan",
            source_texts=[],
            model="geometry",
            generated_at=now,
        )

    suggestion = AiDindingSuggestion(
        l_dinding_m=l_dinding_m,
        h_dinding_m=h_dinding_m,
        bukaan_total_m2=bukaan_total_m2,
        plester_sisi=plester_sisi,
        acian=bool(raw.get("acian")) if raw and isinstance(raw.get("acian"), bool) else False,
        cat=bool(raw.get("cat")) if raw and isinstance(raw.get("cat"), bool) else False,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        source_texts=list(source_texts),
        model=GEMINI_MODEL,
        generated_at=now,
    )

    if geometry_candidate_m is not None:
        if suggestion.l_dinding_m is not None:
            diff = abs(suggestion.l_dinding_m - geometry_candidate_m)
            if diff / max(suggestion.l_dinding_m, 1.0) <= 0.15:
                suggestion.confidence = min(1.0, suggestion.confidence + 0.2)
                suggestion.reasoning += f" (Divalidasi silang dgn geometri polygon: {geometry_candidate_m:.2f}m)"
            else:
                suggestion.confidence = max(0.0, suggestion.confidence - 0.2)
                suggestion.reasoning += f" [WARNING: selisih geometri {geometry_candidate_m:.2f}m vs teks {suggestion.l_dinding_m:.2f}m. Perlu review]"
        else:
            suggestion.l_dinding_m = geometry_candidate_m
            suggestion.reasoning += f" (Panjang dinding ditambahkan dari geometri: {geometry_candidate_m:.2f}m)"

    return suggestion

# --- Gap jujur yang TIDAK dikerjakan di slice ini (dicatat, bukan disembunyikan) ---
# Deteksi otomatis panjang dinding dari GEOMETRI garis gambar (mis. pasangan
# garis sejajar berjarak ~tebal-dinding di `page.get_drawings()`, ditelusuri
# jadi keliling ruangan) TIDAK dicoba di sini. Ini pekerjaan CV vektor
# tersendiri yang lebih besar dari satu vertical slice (perlu validasi
# analitis geometri PDF nyata dulu, mirip proses `grid_geometry.py`).
# Kandidat lanjutan kalau AI-assist berbasis-teks di atas terbukti tidak
# cukup general di banyak dokumen nyata.
