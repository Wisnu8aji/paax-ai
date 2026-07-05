"""
PAAX Core Engine — Fase T: usulan AHSP untuk `TakeoffItem` (rencana besar
2026-07-13, `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`;
spek dasar `docs/prompts/PAAX_CODEX_PROMPT_FASE_T_AHSP_AUTO_SUGGEST_2026-07-
12.md`, batasan dari `PAAX_CODEX_PROMPT_FASE_J_GENERATE_RAB_WIRING_2026-07-
06.md` §4 tetap berlaku penuh).

ATURAN EMAS (CLAUDE.md §1): modul ini HANYA memanggil `search_ahsp` yang
SUDAH ADA (token-overlap deterministik, TIDAK diubah di sini) untuk
MENGUSULKAN kode AHSP — tidak pernah menghitung/mengarang angka RAB. Usulan
selalu terlihat (`ahsp_candidates`) dan ditandai eksplisit
(`ahsp_suggested`) — tidak pernah disamakan dengan pilihan manual user.

KALIBRASI AMBANG (diverifikasi manual thd katalog AHSP CK 2026 nyata,
2026-07-13, BUKAN ditebak — lihat riwayat sesi utk skrip verifikasi):
- Beton (work_type="beton"): SETIAP query fc-spesifik selalu punya
  kompetitor dekat "Pengecoran ... Ready Mixed F'c X MPa" (margin ~0.02) —
  Ready-Mix vs cor manual/semi-mekanis adalah pilihan METODE KONSTRUKSI
  nyata yang tidak bisa ditebak dari TakeoffItem. Utk fc=25 spesifik,
  token "25" JUGA muncul di boilerplate "Slump (100 ± 25) mm" tiap item
  beton keluarga ini, membuat 3 kandidat (fc20/fc21-manual, fc25-semi
  mekanis) SKOR PERSIS SAMA (margin=0). Kesimpulan: beton praktis TIDAK
  PERNAH auto-suggest dengan ambang aman — ini kesimpulan JUJUR dari data,
  bukan bug modul ini.
- Besi (work_type="besi"): AHSP hanya membedakan by DIAMETER (<12mm vs
  ≥12mm) dan METODE (manual/semi-mekanis), keduanya TIDAK tersedia di
  `TakeoffItem` sekarang -> margin kandidat selalu kecil (~0.01-0.04).
  Auto-suggest besi TIDAK PERNAH aman dgn data yang ada saat ini.
- Bekisting (work_type="bekisting"): kategori dgn FRASA KHAS 2+ kata di
  katalog ("Fondasi Telapak", "Dinding Shearwall", "Plat Lantai") dan
  kategori TANPA kompetitor pracetak ("Sloof", "Tangga") auto-suggest AMAN
  (margin terverifikasi >=0.139). Kategori dgn kompetitor pracetak persis
  ("Kolom", "Balok" -> ada "... Beton Pracetak") margin cuma ~0.068 -- SAH
  tidak auto-suggest krn cor-di-tempat vs pracetak memang pilihan berbeda.

Ambang di bawah (`_AUTO_SUGGEST_MIN_SCORE`/`_AUTO_SUGGEST_MIN_MARGIN`)
dipilih PERSIS di antara kelompok "aman" dan "ambigu" di atas.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.rab.models import AHSPItem

from .ahsp_search import search_ahsp
from .models import AhspSearchRequest

_AUTO_SUGGEST_MIN_SCORE = 0.5
_AUTO_SUGGEST_MIN_MARGIN = 0.12

# Terverifikasi thd notasi nyata terlihat di repo ("fc' 25", "f'c 25",
# "F'C=25"): apostrof bisa muncul antara f&c ATAU setelah c (atau tidak
# sama sekali) -- \W* generik gagal utk "fc' 25" krn c langsung nempel f.
_FC_PATTERN = re.compile(r"f\s*'?\s*c\s*'?\s*[:=]?\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)

# Fase T.1 — kamus kategori(TypeKategori) -> frasa query AHSP per work_type,
# DIBANGUN DARI PENGECEKAN LANGSUNG ke `data/ahsp/cipta-karya-2026.json`
# (bukan tebakan), lihat catatan kalibrasi di atas. Kategori TANPA entry
# jatuh ke fallback generik (`_fallback_query`) -- tetap menghasilkan
# kandidat (search_ahsp tidak pernah kosong selama katalog tidak kosong),
# HANYA saja auto-suggest nyaris pasti tidak lolos ambang (SAH, bukan bug).
_BEKISTING_QUERY: Dict[str, str] = {
    "pondasi_telapak": "bekisting fondasi telapak",
    "sloof": "bekisting sloof",
    "kolom": "bekisting kolom",
    "kolom_praktis": "bekisting kolom",
    "balok": "bekisting balok",
    "ring_balok": "bekisting balok",
    "latei": "bekisting balok",
    "plat": "bekisting plat lantai",
    "dinding_beton": "bekisting dinding shearwall",
    "tangga": "bekisting tangga",
}

_BESI_QUERY: Dict[str, str] = {
    "plat": "penulangan slab bjtp",
    "kolom": "penulangan kolom balok ring balok sloof bjtp",
    "kolom_praktis": "penulangan kolom balok ring balok sloof bjtp",
    "sloof": "penulangan kolom balok ring balok sloof bjtp",
    "balok": "penulangan kolom balok ring balok sloof bjtp",
    "ring_balok": "penulangan kolom balok ring balok sloof bjtp",
    "latei": "penulangan kolom balok ring balok sloof bjtp",
    "dinding_beton": "penulangan shearwall bjtp",
}


class TakeoffAhspCandidate(BaseModel):
    ahsp_code: str
    name: str
    unit: str
    score: float


class TakeoffAhspSuggestion(BaseModel):
    kode: str
    lantai: Optional[str] = None
    kategori: str
    work_type: str
    ahsp_code: str = ""
    ahsp_suggested: bool = False
    ahsp_candidates: List[TakeoffAhspCandidate] = Field(default_factory=list)
    reason: str = ""


def _fc_query(mutu_beton: str | None) -> str | None:
    """Ubah `mutu_beton` mentah ("fc' 25", "F'C=25", dst) jadi frasa query.
    HANYA kalau pola "fc <angka>" ketemu jelas -- notasi lain (mis. "K-300")
    TIDAK dikonversi (butuh rumus K->fc yang tidak deterministik/aman utk
    ditebak di sini), balik None (fallback generik dipakai, bukan salah
    tebak)."""
    if not mutu_beton:
        return None
    m = _FC_PATTERN.search(mutu_beton)
    if not m:
        return None
    try:
        fc = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    grade = "rendah" if fc < 20 else "sedang"
    fc_text = str(int(fc)) if fc == int(fc) else str(fc)
    return f"beton mutu {grade} f'c {fc_text} mpa"


def _fallback_query(kategori: str, work_type: str) -> str:
    label = kategori.replace("_", " ")
    prefix = {"beton": "beton", "bekisting": "bekisting", "besi": "penulangan besi"}.get(work_type, work_type)
    return f"{prefix} {label}"


def _build_query(item_kategori: str, work_type: str, mutu_beton: str | None) -> str:
    if work_type == "beton":
        return _fc_query(mutu_beton) or _fallback_query(item_kategori, work_type)
    if work_type == "bekisting":
        return _BEKISTING_QUERY.get(item_kategori) or _fallback_query(item_kategori, work_type)
    if work_type == "besi":
        return _BESI_QUERY.get(item_kategori) or _fallback_query(item_kategori, work_type)
    return _fallback_query(item_kategori, work_type)


def _exclude_pracetak(ahsp_index: Dict[str, AHSPItem]) -> Dict[str, AHSPItem]:
    """`app.tkg.takeoff` (F-B/F-C/F-D) HANYA menghitung volume/luas/berat
    konstruksi cor-di-tempat konvensional -- item AHSP "... Pracetak" (mis.
    "Kolom Beton Pracetak") TIDAK PERNAH tepat utk item takeoff itu, apapun
    skornya. Ditemukan nyata saat verifikasi: query fallback generik
    "beton kolom" salah confident memilih "2.4.3.3 ... Kolom Beton
    Pracetak" (margin 0.16, lolos ambang) krn nama itu kebetulan overlap
    tinggi -- exclude di sini, BUKAN di `search_ahsp` (fungsi itu generik,
    dipakai jalur lain yang mungkin justru butuh hasil pracetak)."""
    return {code: item for code, item in ahsp_index.items() if "pracetak" not in item.name.lower()}


def suggest_ahsp_for_item(
    kode: str, lantai: str | None, kategori: str, work_type: str, unit: str,
    mutu_beton: str | None, ahsp_index: Dict[str, AHSPItem], *, top_k: int = 3,
) -> TakeoffAhspSuggestion:
    query = _build_query(kategori, work_type, mutu_beton)
    search = search_ahsp(AhspSearchRequest(query=query, unit=unit, top_k=top_k), _exclude_pracetak(ahsp_index))
    candidates = [
        TakeoffAhspCandidate(ahsp_code=c.ahsp_code, name=c.name, unit=c.unit, score=c.score)
        for c in search.candidates
    ]
    ahsp_code, ahsp_suggested, reason = "", False, "tidak ada kandidat AHSP ditemukan"
    if candidates:
        top, second_score = candidates[0], (candidates[1].score if len(candidates) > 1 else 0.0)
        margin = top.score - second_score
        top_unit_ok = search.candidates[0].unit_ok
        if top.score >= _AUTO_SUGGEST_MIN_SCORE and margin >= _AUTO_SUGGEST_MIN_MARGIN and top_unit_ok:
            ahsp_code, ahsp_suggested = top.ahsp_code, True
            reason = f"skor {top.score:.2f}, margin {margin:.2f} thd kandidat #2 (>= ambang)"
        else:
            reason = f"skor top {top.score:.2f}, margin {margin:.2f} < ambang -- user pilih manual dari kandidat"
    return TakeoffAhspSuggestion(
        kode=kode, lantai=lantai, kategori=kategori, work_type=work_type,
        ahsp_code=ahsp_code, ahsp_suggested=ahsp_suggested,
        ahsp_candidates=candidates, reason=reason,
    )


def suggest_ahsp_for_takeoff(
    items: List, ahsp_index: Dict[str, AHSPItem], *, top_k: int = 3,
) -> List[TakeoffAhspSuggestion]:
    """`items`: `List[TakeoffItem]` (dari `app.tkg.takeoff.TakeoffResult.items`).
    Item `quantity is None` (needs_review) DILEWATI -- konsisten dgn
    `sendToRab` existing yang juga tidak mengirim item belum siap."""
    return [
        suggest_ahsp_for_item(
            item.kode, item.lantai, item.kategori, item.work_type, item.unit,
            item.mutu_beton, ahsp_index, top_k=top_k,
        )
        for item in items
        if item.quantity is not None
    ]
