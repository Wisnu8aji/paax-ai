# PROMPT CODEX — Task R3: Cache Hasil Analisa per Dokumen (Biaya & Latency AI)

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 3).
> **Kerjakan SETELAH** `PAAX_CODEX_TASK_R2_JOB_STORE_PERSISTEN_2026-07-07.md`
> selesai & PR-nya di-merge — task ini reuse pola SQLite file-based yang
> sama (bukan hard dependency kode, tapi konsistensi arsitektur). Branch baru
> dari `main` (yang sudah berisi hasil R2).

---

## 0. Konteks — kenapa cache ini penting

`CLAUDE.md` §1.1 eksplisit mengamanatkan: **"Biaya & latency dipertimbangkan
di desain — panggilan LLM per halaman/elemen di skala produksi tidak
gratis; cache hasil per dokumen, jangan panggil ulang untuk dokumen yang
sama."** Sampai sekarang belum ada cache sama sekali: tiap kali
`/drawings/analyze` (atau `/analyze/start`) dipanggil dengan PDF yang SAMA
PERSIS, pipeline penuh — termasuk SEMUA panggilan Gemini AI-assist
(`_apply_dimension_ai_assist`, `_apply_roof_frame_ai_assist`,
`_apply_kuda_kuda_ai_assist`, `_apply_arsitektur_area_ai_assist`,
`_apply_dinding_ai_assist`, `_apply_kusen_ai_assist`,
`_apply_mep_ai_assist`, `_apply_zone_ai_assist` — lihat
`app/perception/consolidate.py::consolidate_document` baris 511-518) —
jalan ULANG dari nol. Ini boros biaya (tiap kategori × tiap sheet yang
gagal rule-based = 1 panggilan Gemini) dan lambat (re-upload dokumen yang
sama saat testing/demo/re-review).

---

## 1. Scope task ini

1. Modul baru `app/perception/analysis_cache.py` — `AnalysisCache` class,
   SQLite file-based (pola sama `app/jobs/store.py` dari Task R2), kunci
   cache = **SHA-256 dari byte PDF mentah** + **versi prompt/model**
   (lihat §2 kenapa versi ini wajib).
2. Wiring di `drawing_routes.py::_perform_analysis`: SEBELUM memanggil
   `assemble_document_from_pdf_bytes` + `consolidate_document`, cek cache.
   Kalau HIT (hash + versi cocok) → langsung kembalikan
   `DrawingAnalysisResponse` tersimpan, SKIP seluruh pipeline (termasuk
   parsing PyMuPDF, bukan cuma AI-assist — dokumen identik = hasil identik,
   dijamin karena pipeline vektor deterministik + AI-assist yang sama
   inputnya SEHARUSNYA sama outputnya di temperature rendah, meski TIDAK
   diklaim benar-benar deterministik, lihat §1.1 CLAUDE.md "tidak diklaim
   deterministik" — makanya cache adalah OPTIMASI, bukan jaminan
   korektnes, dan HARUS bisa dimatikan via env kalau perlu, §4).
3. Kalau MISS → jalankan pipeline seperti biasa, lalu SIMPAN hasil ke cache
   sebelum return.
4. Endpoint baru `GET /drawings/analyze/cache-stats` (jumlah entri, total
   ukuran, hit/miss counter proses berjalan — counter in-memory boleh
   reset saat restart, bukan bagian kritis) dan
   `POST /drawings/analyze/cache-invalidate` (hapus SEMUA entri — dipakai
   manual kalau owner tahu ada bug di pipeline dan ingin re-analisa semua
   dokumen lama).
5. **Audit trail versi**: `analysis_cache` tabel WAJIB simpan kolom
   `prompt_version TEXT` (lihat §2) supaya kalau prompt/model AI-assist
   berubah di masa depan, entri lama otomatis jadi MISS (tidak menyajikan
   hasil basi dari prompt versi lama sebagai hasil baru).
6. Test lengkap (§5) — termasuk test yang MEMBUKTIKAN panggilan LLM ke-2
   untuk dokumen identik = 0 (pakai fake `AiAssistClient` yang menghitung
   pemanggilan).

**JANGAN**: menyentuh `apps/web/**`; cache berdasarkan nama file (HARUS
berdasarkan HASH KONTEN — nama file bisa sama tapi isi beda, atau
sebaliknya); membuat cache permanen tanpa cara invalidasi manual.

---

## 2. Desain "prompt_version" — WAJIB dipahami sebelum mulai

Karena AI-assist punya 8 modul (`dimension_assist.py`, `zone_assist.py`,
`wall_assist.py`, `roof_frame_assist.py`, `kusen_assist.py`,
`mep_assist.py`, `kuda_kuda_assist.py`, `arsitektur_area_assist.py`) yang
bisa berubah independen, definisikan SATU konstanta gabungan di modul baru
`app/perception/ai_assist/__init__.py` (atau file baru
`app/perception/ai_assist/version.py` kalau `__init__.py` belum ada isinya
— CEK DULU):

```python
# Naikkan angka ini SETIAP KALI ada perubahan pada prompt/response_schema/
# validasi di modul manapun dalam app/perception/ai_assist/. Ini memaksa
# cache miss untuk semua entri lama setelah perubahan logic AI-assist,
# supaya tidak menyajikan hasil dari validasi/prompt versi lama sbg valid.
AI_ASSIST_PROMPT_VERSION = "2026-07-05.1"
```

`GEMINI_MODEL` (`"gemini-2.5-flash"`, di `client.py`) DIGABUNG ke versi ini
juga (`f"{AI_ASSIST_PROMPT_VERSION}:{GEMINI_MODEL}"`) supaya ganti model
juga invalidasi cache. Cache key final = `sha256(pdf_bytes).hexdigest() +
":" + full_version_string`.

---

## 3. Implementasi

### 3.1 `app/perception/analysis_cache.py` (baru)

```python
import hashlib
import os
import sqlite3
import tempfile
from typing import Optional

DEFAULT_PATH = os.path.join(tempfile.gettempdir(), "paax_analysis_cache.db")

class AnalysisCache:
    def __init__(self, path: str | None = None, enabled: bool | None = None):
        self.path = path or os.getenv("ANALYSIS_CACHE_PATH", DEFAULT_PATH)
        # ANALYSIS_CACHE_ENABLED=0 -> matikan total (dev/debug), default aktif.
        self.enabled = enabled if enabled is not None else os.getenv("ANALYSIS_CACHE_ENABLED", "1") != "0"
        if self.enabled:
            self._init_schema()

    @staticmethod
    def compute_key(pdf_bytes: bytes, version: str) -> str:
        digest = hashlib.sha256(pdf_bytes).hexdigest()
        return f"{digest}:{version}"

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    cache_key TEXT PRIMARY KEY,
                    pdf_hash TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    hit_count INTEGER NOT NULL DEFAULT 0
                )
            """)

    def get(self, pdf_bytes: bytes, version: str) -> Optional[dict]: ...
    def put(self, pdf_bytes: bytes, version: str, result: dict) -> None: ...
    def stats(self) -> dict: ...  # {"entries": N, "total_hits": N}
    def invalidate_all(self) -> int: ...  # return jumlah baris terhapus
```

`get`/`put` menyimpan/membaca `result` sebagai JSON string
(`DrawingAnalysisResponse.model_dump_json()` / `model_validate_json()` —
sama pola R2). `get` yang HIT wajib `UPDATE ... SET hit_count = hit_count + 1`.

### 3.2 Wiring `drawing_routes.py::_perform_analysis`

```python
_analysis_cache = AnalysisCache()

def _perform_analysis(req, on_page_done=None):
    file_path = os.path.join(UPLOAD_DIR, req.file_metadata.file_name)
    if os.path.exists(file_path) and file_path.lower().endswith(".pdf"):
        with open(file_path, "rb") as f:
            pdf_bytes = f.read()
        cached = _analysis_cache.get(pdf_bytes, AI_ASSIST_FULL_VERSION)
        if cached is not None:
            return DrawingAnalysisResponse.model_validate(cached)
    # ... pipeline seperti biasa ...
    result = DrawingAnalysisResponse(...)
    if os.path.exists(file_path) and pdf_bytes is not None:
        _analysis_cache.put(pdf_bytes, AI_ASSIST_FULL_VERSION, result.model_dump())
    return result
```

**Perhatikan**: `pdf_bytes` sekarang dibaca DUA KALI dalam alur asli (sekali
untuk cek cache, sekali di blok pipeline yang sudah ada baris 130-132) —
REFACTOR supaya hanya baca sekali (baca duluan, lalu keduanya — cek cache
DAN jalur pipeline — pakai variabel yang sama). Jangan duplikasi I/O.

### 3.3 Endpoint baru

```python
@router.get("/analyze/cache-stats")
async def cache_stats():
    return _analysis_cache.stats()

@router.post("/analyze/cache-invalidate")
async def cache_invalidate():
    deleted = _analysis_cache.invalidate_all()
    return {"deleted": deleted}
```

---

## 4. Kill-switch (WAJIB ada, untuk debug/dev)

`ANALYSIS_CACHE_ENABLED=0` di env → `AnalysisCache.enabled = False` →
`get()` selalu return `None`, `put()` no-op. Ini penting supaya saat
developer sedang mengubah-ubah pipeline (bukan cuma AI-assist — bahkan
`zone_classifier.py`/`binding.py` yang deterministik), dia bisa mematikan
cache sementara tanpa harus `cache-invalidate` tiap kali test manual.

---

## 5. Test WAJIB (`tests/test_analysis_cache.py`, baru)

- `compute_key`: PDF sama + versi sama → key sama; PDF beda 1 byte → key
  beda; PDF sama + versi beda → key beda (test eksplisit invalidasi versi).
- `get`/`put` round-trip dasar.
- `stats()` benar setelah beberapa put/get (entries count, hit_count naik
  tiap `get` yang HIT).
- `invalidate_all()` mengosongkan semua entri, `stats()` setelahnya = 0.
- **Test paling penting** (`tests/test_perception_drawing_routes_cache.py`
  atau tambahkan ke test routes yang sudah ada kalau ada): panggil
  `_perform_analysis` (atau endpoint `/drawings/analyze` via `TestClient`)
  DUA KALI dengan PDF fixture identik + fake `GeminiAiAssistClient`/
  `AiAssistClient` yang MENCATAT jumlah pemanggilan `generate_json` →
  assert panggilan ke-2 = **0 pemanggilan LLM baru** (semua dari cache),
  DAN hasil response identik.
- Test kill-switch: `ANALYSIS_CACHE_ENABLED=0` → panggilan kedua tetap
  memicu LLM (cache benar-benar mati, bukan cuma stats-nya nol).
- Test PDF berbeda (fixture sintetis kedua) → tidak cache-hit dengan yang
  pertama (hash beda → miss, pipeline jalan penuh lagi).

Jalankan SEMUA test document-intelligence setelah selesai (baseline
pasca-R2 — cantumkan angka R2 di report R2 sebagai referensi before/after).

---

## 6. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR3_CACHE_ANALISA_DOKUMEN_CODEX_<tanggal>.md`.
Isi wajib: (1) skema `analysis_cache` final, (2) nilai `AI_ASSIST_PROMPT_
VERSION` yang kamu tetapkan & di mana didefinisikan, (3) bukti test
"panggilan LLM ke-2 = 0" lulus (kutip output test), (4) hasil test lengkap
before/after, (5) daftar commit + link PR, (6) konfirmasi kill-switch
bekerja + `cache-invalidate` bekerja.

---

## 7. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R2): `feat/cache-analisa-dokumen`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN buat cache yang tidak bisa dimatikan/di-invalidate — ini krusial
  supaya cache tidak pernah jadi sumber "hasil basi tapi terlihat baru".
