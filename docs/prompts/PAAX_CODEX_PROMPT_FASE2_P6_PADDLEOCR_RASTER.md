# PROMPT CODEX — FASE 2 · PAKET P6: Perception Raster via PaddleOCR (sheet scan/foto)

> ## ⚠️ STATUS: HISTORIS / SUPERSEDED (2026-07-04 malam)
> Owner memutuskan Claude mengerjakan paket ini LANGSUNG. **KODE SUDAH
> DIIMPLEMENTASIKAN** (`app/perception/{ingest/raster_detector.py,
> ocr/paddle_ocr_extractor.py}`, 6 test hijau via mock). Dependency `paddleocr`
> SENGAJA belum di-install (berat/opsional) — jalur nyata (non-mock) belum
> diverifikasi, butuh owner `pip install paddleocr` dulu. **JANGAN jalankan
> prompt ini via Codex** untuk membangun ulang; kalau ingin lanjut ke modul
> table/layout PaddleOCR (di luar scope awal), tulis prompt baru mengacu ke
> kode yang sudah ada. Lihat status nyata di
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §Paket F2-P6.

> Ditulis Claude 2026-07-04. Rencana induk:
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §Paket F2-P6. Konsep
> awal dari owner: `Downloads/konsep_paddleocr_openai_vision_paax.txt` — sudah
> dianalisis kritis terhadap kode nyata & PaddleOCR 3.7.0 asli
> (`G:\paax-data\PaddleOCR-main`), lihat §0 di bawah. Spek mengikat:
> `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt` §8
> (RULE-EXT-30..33) + INV-TKG-06 + RULE-EXT-05 ("vektor-dulu").

**PRASYARAT KERAS: Paket P1 (`docs/prompts/PAAX_CODEX_PROMPT_FASE2_P1_FONDASI_PERSEPSI.md`)
HARUS SUDAH SELESAI & DI-REVIEW Claude sebelum paket ini dimulai** — P6
memakai kontrak `TextSpan`/`Run` (dengan field `method`/`confidence`) yang
didefinisikan P1. Cek dulu: `find services/document-intelligence/app/perception -iname "models.py"`
harus ADA dan berisi `TextSpan` dengan field `method: Literal["vector","ocr"]`.
Kalau belum ada, STOP — jalankan P1 dulu.

---

## 0. Kenapa PaddleOCR, dan di mana batasnya (baca dulu — ini keputusan arsitektur, bukan detail teknis biasa)

Owner minta PaddleOCR dipakai supaya hasil ekstraksi gambar kerja lebih baik.
Analisis kritis terhadap paket `paddleocr` versi nyata di repo (3.7.0,
2026-06-11, Apache 2.0) vs rencana Fase 2 yang sudah berjalan:

1. **PaddleOCR HANYA untuk sheet RASTER (scan/foto tanpa text-layer).** PDF
   gambar kerja vektor (mis. ekspor dari AutoCAD/Revit) sudah dibaca PyMuPDF
   dengan akurat 100% (teks asli, bukan tebakan) — memakai OCR pada sheet
   vektor akan MELANGGAR `INV-TKG-06`/`RULE-EXT-05` ("vektor-dulu": model
   OCR/vision TIDAK BOLEH membaca angka bila text-layer vektor tersedia).
   **DILARANG KERAS** memanggil PaddleOCR pada sheet yang lolos deteksi vektor
   (§2 di bawah menjelaskan cara deteksinya).
2. **PaddleOCR BUKAN pipeline terpisah — ia adalah SUMBER SPAN KEDUA** yang
   mengalir ke pipeline yang SAMA dengan jalur vektor (merge-run → grammar →
   grid/tabel → validator, paket P1-P4). Ini beda dari yang diusulkan konsep
   awal owner (yang menyiratkan builder TKG terpisah untuk OCR) — arsitektur
   di paket ini LEBIH SEDERHANA: `PaddleOCR.predict()` mengembalikan
   `rec_texts`(list[str])/`rec_scores`(list[float])/`rec_boxes`((n,4) int16),
   yang dipetakan LANGSUNG ke `TextSpan` (`text`, `confidence`, `bbox`,
   `method="ocr"`) — lalu diperlakukan identik dengan span vektor oleh
   `merge_runs`/grammar/grid/tabel yang SUDAH dibangun P1-P4. **Jangan bangun
   builder/parser TKG terpisah untuk OCR — reuse yang sudah ada.**
3. **Dependency BERAT & OPSIONAL, bukan wajib.** `paddleocr` bergantung pada
   `paddlex[ocr-core]` (native, model diunduh saat pertama pakai, bisa
   ratusan MB). Ini SENGAJA dibuat **lazy-import**: service HARUS tetap boot
   normal & seluruh test lain HARUS tetap hijau walau `paddleocr` TIDAK
   terpasang di environment. Kalau OCR dipanggil tapi paket tidak ada →
   kembalikan status/­warning jelas ("OCR raster tidak tersedia — install
   dependency opsional `paddleocr`"), JANGAN melempar exception yang
   menjatuhkan endpoint (selaras CLAUDE.md §2: fitur AI baru wajib fallback).
4. **OpenAI Vision fallback (bagian §3/§7 konsep owner) TIDAK termasuk paket
   ini.** Itu sudah ada jalurnya sendiri: "AI Multimodal Bagian B"
   (`docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md`),
   masih menunggu owner centang kotak persetujuan biaya API. Paket ini
   **DILARANG** menyentuh/menambah pemanggilan model vision berbayar apa pun.
5. **§0.1 fixture-bukan-template tetap berlaku.** Kode di sini harus umum
   untuk gambar RASTER apa pun, diuji dengan fixture SINTETIS (bukan hasil
   scan PLHUT asli sebagai bahan tebakan/latih).

---

## 1. Tujuan paket

- Deteksi sheet raster vs vektor PER SHEET (bukan per file).
- Adapter `PaddleOCR.predict()` → `list[TextSpan]` (`method="ocr"`), lazy &
  opsional.
- Span OCR mengalir ke `merge_runs` (P1) tanpa tercampur span vektor.
- Endpoint `/drawings/analyze` (services/document-intelligence) menjalankan
  jalur OCR HANYA untuk sheet yang terbukti raster, dengan warning eksplisit
  ke pengguna (RULE-EXT-33: hasil OCR ditampilkan berdampingan, wajib review
  manusia).

---

## 2. Struktur file yang DIBUAT/DIUBAH

```
services/document-intelligence/
  pyproject.toml                      # tambah dependency OPSIONAL (lihat §3.1)
  app/
    perception/
      ingest/
        raster_detector.py           # BARU: deteksi vektor vs raster per sheet
      ocr/
        __init__.py
        paddle_ocr_extractor.py       # BARU: adapter PaddleOCR -> TextSpan (lazy import)
    api/
      drawing_routes.py               # DIUBAH: panggil jalur OCR bila sheet raster
  tests/
    test_perception_raster_detector.py
    test_perception_paddle_ocr_extractor.py
    fixtures/perception/
      _generate_synthetic_raster.py   # buat PNG sintetis kecil + teks jelas
      synthetic_raster_sample.png
```

---

## 3. Spesifikasi teknis

### 3.1 Dependency (opsional, lazy)
Di `pyproject.toml`, tambahkan sebagai **extra opsional** (BUKAN dependency
wajib inti):
```toml
[tool.poetry.extras]
ocr = ["paddleocr", "paddlex"]

[tool.poetry.group.ocr.dependencies]
paddleocr = "*"
```
(Sesuaikan sintaks persis dengan versi Poetry yang dipakai repo — cek
`pyproject.toml` yang ada dulu. Intinya: instalasi dasar service TIDAK
otomatis menarik `paddleocr`; harus `pip install "paddleocr"` / grup extra
terpisah secara eksplisit.)

Di kode, import HARUS di dalam `try/except ImportError` — JANGAN di top-level
module yang bisa menjatuhkan seluruh `app.main` saat startup:
```python
def _load_paddle_ocr():
    try:
        from paddleocr import PaddleOCR
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,  # brain RULE-EXT-02: label sering rotasi 90 di raster
        )
    except ImportError:
        return None
```

### 3.2 `ingest/raster_detector.py`
- `is_raster_sheet(page) -> bool` (brain RULE-EXT-30: per-sheet, bukan per-file):
  pakai `page.get_text("dict")` PyMuPDF — bila jumlah span teks bermakna
  (`len(text.strip()) > 0`) di bawah ambang kecil (mis. < 3 span untuk seluruh
  halaman), anggap raster. Kembalikan juga alasan (`n_vector_spans`) untuk
  dicatat sebagai bukti keputusan (bukan tebakan diam-diam).

### 3.3 `ocr/paddle_ocr_extractor.py`
```python
def extract_spans_via_ocr(page_image_path: str, page: int) -> OcrExtractionResult:
    """
    Kembalikan OcrExtractionResult{available: bool, spans: list[TextSpan], message: str}.
    `available=False` (paddleocr tak terpasang / gagal load) -> spans=[],
    message jelas — endpoint HARUS tetap jalan, cuma tanpa hasil OCR raster.
    """
```
- Render halaman ke gambar dulu (reuse `app/processors/pdf_renderer.py` yang
  SUDAH ADA — JANGAN duplikasi rendering PDF→gambar).
- Panggil `ocr.predict(page_image_path)` → iterasi hasil → untuk tiap
  `res.json` ambil `rec_texts[i]`, `rec_scores[i]`, `rec_boxes[i]` → buat
  `TextSpan(text=rec_texts[i], confidence=rec_scores[i], bbox=tuple(rec_boxes[i]),
  method="ocr", page=page, rotasi=0, font_size=<estimasi dari tinggi bbox>,
  origin=(bbox[0], bbox[3]), span_id=f"p{page}-ocr-{i:04d}")`.
- **Confidence tidak pernah 1.0** untuk span OCR (RULE-EXT-31) — pakai
  `rec_scores[i]` apa adanya (jangan dibulatkan/dinaikkan).

### 3.4 `api/drawing_routes.py` — integrasi ke endpoint yang SUDAH ADA
Di `analyze_drawing`, SETELAH langkah render sheet (`pdf_res["sheets"]`),
untuk tiap sheet: panggil `is_raster_sheet` → bila `True`:
- panggil `extract_spans_via_ocr(...)`.
- bila `available=False` → tambahkan `DrawingWarning` level `MEDIUM`:
  "Sheet terdeteksi raster (scan/foto), tapi OCR tidak tersedia di server —
  install dependency opsional `paddleocr` untuk membaca sheet ini. Gunakan
  jalur teks deskripsi manual sementara."
- bila `available=True` → span OCR digabung via `merge_runs` (P1) →
  diteruskan ke grammar/builder yang sama dengan jalur vektor → tambahkan
  `DrawingWarning` level `MEDIUM` (SELALU, bukan kondisional): "Sheet ini
  dibaca via OCR (raster) — confidence lebih rendah dari pembacaan vektor,
  WAJIB direview manusia sebelum dipakai." (RULE-EXT-33 — transparansi wajib,
  bukan opsional, walau hasil OCR terlihat bagus).
- Sheet vektor (bukan raster) **TIDAK PERNAH** melewati kode OCR sama sekali —
  ini bukan optimisasi, ini KEWAJIBAN (RULE-EXT-05).

---

## 4. Fixture & anchor test (SINTETIS — §0.1, bukan scan PLHUT asli)

`_generate_synthetic_raster.py`: buat gambar PNG kecil (mis. via PyMuPDF
render dari PDF sintetis P1, atau Pillow langsung) berisi teks jelas seperti
"K1 300X400" dan "GRID A-B 4000" — commit sebagai `synthetic_raster_sample.png`
(ukuran kecil, < 200KB).

`test_perception_raster_detector.py`:
1. Halaman dari PDF sintetis P1 (vektor) → `is_raster_sheet` == `False`.
2. Halaman kosong tanpa text-layer sama sekali → `is_raster_sheet` == `True`.

`test_perception_paddle_ocr_extractor.py` (WAJIB lulus baik paddleocr
terpasang MAUPUN tidak — gunakan `monkeypatch`/mock untuk simulasi keduanya):
3. Mock `_load_paddle_ocr` mengembalikan `None` (simulasi tak terpasang) →
   `extract_spans_via_ocr(...)` mengembalikan `available=False`, `spans==[]`,
   `message` berisi kata "install"/"tidak tersedia" — TIDAK melempar exception.
4. Mock hasil OCR dengan `rec_texts=["K1"], rec_scores=[0.87], rec_boxes=[[10,10,50,30]]`
   → hasil `TextSpan` tunggal: `text=="K1"`, `confidence==pytest.approx(0.87)`,
   `method=="ocr"`, `bbox==(10,10,50,30)`.
5. (Bila `paddleocr` benar-benar terpasang di environment CI/lokal Codex —
   opsional, tandai `@pytest.mark.skipif` bila tidak terpasang) jalankan
   ekstraksi nyata pada `synthetic_raster_sample.png` → minimal 1 `TextSpan`
   dengan teks yang mengandung substring "K1" atau "GRID" (case-insensitive,
   OCR nyata bisa sedikit meleset — jangan strict equality untuk kasus ini).

**Uji krusial (regresi vektor-dulu):**
6. End-to-end: sheet BER-text-layer vektor yang diproses `analyze_drawing`
   TIDAK PERNAH memanggil `extract_spans_via_ocr` sama sekali (assert via
   mock/spy bahwa fungsi OCR nol kali dipanggil untuk sheet vektor).

---

## 5. Verifikasi sebelum commit

```powershell
cd G:\paax-ai-main\services\document-intelligence
$env:PYTHONUTF8=1
python -m pytest -q
```
Kriteria terima:
- Semua anchor §4 hijau.
- **Uninstall/tanpa `paddleocr` terpasang** → seluruh suite tetap hijau, service
  tetap bisa start (`uvicorn app.main:app` tidak crash saat import).
- Sheet vektor tidak pernah masuk jalur OCR (test 6 di atas).
- Tidak ada panggilan OpenAI/vision berbayar apa pun di paket ini.
- Lakmus §0.1: tak ada logika spesifik PLHUT.

---

## 6. Commit, PR, REPORT

- Branch: `feat/fase2-p6-paddleocr-raster` (dari `main`, setelah P1 di-merge/
  di-review — sebutkan basis persis yang dipakai di report).
- Commit: `feat(perception): OCR raster via PaddleOCR, lazy & opsional (Fase 2 P6)`.
- Push → **draft PR** ke `main`. JANGAN merge.
- **Commit dokumen non-kode terkait SEGERA** — jangan biarkan untracked
  (insiden file hilang sebelumnya, lihat rencana induk §0.2).
- Report → `report/REPORT_FASE2_P6_CODEX_2026-07-04.md`: konfirmasi eksplisit
  bahwa (a) service tetap boot tanpa `paddleocr` terpasang, (b) sheet vektor
  tidak pernah masuk jalur OCR, (c) daftar dependency baru & ukurannya
  (perkiraan MB), (d) output pytest, (e) SHA, URL PR.

---

## 7. Yang TIDAK dikerjakan di P6 (biar tak overscope)
- `TableStructureRecognition`/`layout_detection` PaddleOCR (rekonstruksi tabel
  dari raster) — DITUNDA ke iterasi P6 lanjutan, dicatat di rencana induk.
- OpenAI Vision fallback — jalur terpisah, owner-gated, TIDAK disentuh di sini.
- Rekonstruksi grid/tabel/elemen dari span OCR — itu tetap tugas P3 (grammar/
  grid/tabel P2/P3 SUDAH generik menerima span dari sumber mana pun via
  `method`, tidak perlu logika baru khusus OCR di P3).
- Validator/gerbang penuh (P4) — paket ini hanya menyediakan SUMBER SPAN,
  bukan menilai kelulusan gerbang.
Ragu batas paket → STOP & tanya. Jangan tambah cakupan diam-diam.
