"""
PAAX Document Intelligence — Klasifikasi zona/paket-pekerjaan per sheet
(Fase B, rencana besar 2026-07-05: `docs/plans/
PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`).

Rule-based (BUKAN LLM, konsisten `DrawingClassifier`) — mencocokkan kata
kunci di JUDUL sheet (bukan seluruh teks) ke paket pekerjaan teknik sipil:
substruktur, struktur_lantai_N, struktur_atap, detail_tabel. Ini BEDA dari
`DrawingClassifier.jenis` (denah/tabel/detail — tipe dokumen generik);
`zone` di sini adalah dimensi tambahan: pekerjaan APA yang digambarkan.

PRINSIP (§0.1 — PLHUT hanya bahan belajar, bukan sumber logika): aturan di
bawah HANYA berdasar kata kunci umum konstruksi Indonesia (FOOTPLAT/PONDASI/
ATAP/LT.n/SLOOF), bukan judul spesifik PLHUT. Sheet TABEL/DETAIL tanpa
kualifier lantai/pondasi/atap yang jelas di judulnya SENGAJA jatuh ke
`detail_tabel` (BUKAN ditebak jadi lantai tertentu berdasar konteks halaman
lain) — kejujuran ini kadang berbeda dari intuisi manusia yang membaca
seluruh dokumen sekaligus, tapi mencegah tebakan diam-diam yang tak bisa
digeneralisasi ke gambar lain.
"""
from __future__ import annotations

import re
from collections import Counter

from app.perception.models import Run

_TITLE_PREFIX = re.compile(
    r"^(DENAH|TABEL|DETAIL|POTONGAN|TAMPAK|DAFTAR|SITUASI|SITE|LOKASI)\b",
    re.IGNORECASE,
)
_SKALA_PATTERN = re.compile(r"\b\d+\s*:\s*\d+\b|\bNTS\b", re.IGNORECASE)

# Fase U-2 (2026-07-13, `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_
# 2026-07-13.md`): bukti nyata (screenshot `G:\gambar contoh`) menunjukkan
# sheet non-struktur (daftar-gambar/situasi/tampak/potongan) selalu jatuh
# "Belum diketahui" krn _ZONE_RULES lama HANYA kenal keyword struktur.
# Kategori baru di bawah TETAP rule-based generik (bukan spesifik PLHUT).
_ZONE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("substruktur", ("FOOTPLAT", "PONDASI")),
    ("struktur_atap", ("ATAP",)),
    ("struktur_lantai_2", ("LT.2", "LT 2", "LANTAI 2")),
    ("struktur_lantai_1", ("LT.1", "LT 1", "LANTAI 1", "SLOOF")),
    ("daftar_gambar", ("DAFTAR", "INDEX GAMBAR")),
    ("situasi", ("SITUASI", "SITE PLAN", "LOKASI")),
    ("tampak", ("TAMPAK",)),
    ("potongan", ("POTONGAN",)),
    ("detail_tabel", ("TABEL", "DETAIL")),
]

# Halaman ke-berapa (0-based, INKLUSIF) yang masih dianggap kandidat wajar
# utk sampul/kop dokumen (bukan gambar teknik) -- dipakai HANYA sbg fallback
# terakhir saat tidak ada judul/grid/elemen sama sekali (`classify_zone`).
_COVER_PAGE_INDEX_LIMIT = 2


def extract_judul(runs: list[Run]) -> tuple[str | None, set[str]]:
    """Judul = teks berawalan kata kunci sheet (DENAH/TABEL/dst) yang PALING
    SERING muncul (biasanya diulang di viewport + kop gambar); dasi -> yang
    lebih panjang/deskriptif. Kandidat SATU KATA (mis. label kolom tabel
    "DETAIL" yang berulang) SENGAJA dikalahkan kandidat multi-kata bila ada
    — judul sheet asli hampir selalu deskriptif >1 kata, label generik
    berulang bukan judul walau frekuensinya tinggi.

    Kembalikan juga `used_ids` (Run yang jadi sumber judul terpilih) supaya
    caller bisa menandainya SUDAH terklasifikasi (bukan lagi unclassified) —
    teks ini sungguh dipakai (jadi zona+judul), bukan dibuang begitu saja."""
    candidates: list[tuple[str, str]] = []
    for r in runs:
        text = re.sub(r"\s+", " ", r.text.strip())
        if not text or not _TITLE_PREFIX.match(text):
            continue
        candidates.append((text.upper(), r.run_id))
    if not candidates:
        return None, set()
    counts = Counter(text for text, _ in candidates)
    multi_word = {c: n for c, n in counts.items() if len(c.split()) >= 2}
    pool = multi_word or counts
    max_count = max(pool.values())
    best = [c for c, n in pool.items() if n == max_count]
    winner = max(best, key=len)
    used_ids = {run_id for text, run_id in candidates if text == winner}
    return winner, used_ids


def extract_skala(runs: list[Run]) -> tuple[str | None, set[str]]:
    for r in runs:
        text = r.text.strip()
        m = _SKALA_PATTERN.search(text)
        if m:
            return m.group(0).upper().replace(" ", ""), {r.run_id}
    return None, set()


def classify_zone(
    judul: str | None,
    *,
    page_index: int | None = None,
    has_grid: bool = False,
    has_elements: bool = False,
) -> str | None:
    """Klasifikasi zona dari judul. `page_index`/`has_grid`/`has_elements`
    OPSIONAL (default aman utk caller lama/test lama yang cuma kirim judul)
    -- kalau diisi, aktifkan fallback `cover` (Fase U-2) utk sheet TANPA
    judul/grid/elemen sama sekali di antara `_COVER_PAGE_INDEX_LIMIT` halaman
    pertama dokumen. Sengaja KONSERVATIF (§0.1): sheet yang tidak match rule
    manapun DAN tidak lolos heuristik cover ini tetap jujur `None`, tidak
    dipaksakan jadi kategori tertentu."""
    if judul:
        judul_upper = judul.upper()
        for zone, keywords in _ZONE_RULES:
            if any(kw in judul_upper for kw in keywords):
                return zone
        return None
    if page_index is not None and page_index < _COVER_PAGE_INDEX_LIMIT and not has_grid and not has_elements:
        return "cover"
    return None
