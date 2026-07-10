# PROMPT SAYA — FASE 2 · PAKET P1: Fondasi Persepsi Vektor (span + merge-run + locale + kontrak skema)

> ## ⚠️ STATUS: HISTORIS / SUPERSEDED (2026-07-04 malam)
> Owner memutuskan Saya mengerjakan paket ini LANGSUNG (bukan via Saya).
> **SUDAH DIIMPLEMENTASIKAN** di `services/document-intelligence/app/perception/
> {models.py,ingest/span_extractor.py,vector/merge_run.py,locale.py,tkg/models.py}`,
> 31 test hijau. **JANGAN jalankan prompt ini via Saya** — akan menulis ulang
> kode yang sudah ada & sudah teruji. Lihat status nyata di
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §Paket F2-P1. Dipertahankan
> di sini sbg spek historis/referensi, bukan instruksi aktif.

> Ditulis Saya 2026-07-04 (rekonstruksi + revisi setelah insiden file hilang —
> lihat `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §0.2) untuk dijalankan
> Saya. Rencana induk: `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md`. Spek
> persepsi mengikat: `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`
> (§1, §2.6, §6, §8, §10). **Ini paket fondasi.** Jangan bangun grammar/grid/tabel
> di sini — itu paket P2/P3.

**PENTING — cek dulu sebelum mulai:** jalankan
`find services/document-intelligence/app -iname "*perception*"`. Kalau folder
`app/perception/` SUDAH ADA berisi pekerjaan paket ini, JANGAN tulis ulang dari
nol — lanjutkan/rebase dari situ. (Insiden sebelumnya: paket lain sempat
ditulis ulang dari nol di branch berbeda alih-alih di-rebase, membuang
implementasi yang sudah benar. Jangan ulangi pola ini.)

---

## 0. Aturan mengikat (baca dulu, langgar = PR ditolak)

1. **§0.1 FIXTURE-BUKAN-TEMPLATE.** Semua kode di `app/perception/` harus UMUM
   (berlaku gambar apa pun). DILARANG ada logika/konstanta yang mengenali "ini
   PLHUT" atau bergantung angka/kode/urutan khas PLHUT di luar folder `tests/`.
2. **INV-TKG-03 NO-SILENT-FIX.** Nilai `raw` SELALU disimpan berdampingan hasil
   normalisasi + bendera koreksi.
3. **INV-TKG-02 ZERO-LOSS.** Tidak ada span teks yang dibuang.
4. **INV-TKG-05.** Tidak ada harga/AHSP/ekspansi/biaya di layer persepsi.
5. **Tanpa dep berat baru.** Cukup `pymupdf` (sudah ada). DILARANG menambah
   camelot/ghostscript/paddleocr DI PAKET INI (PaddleOCR = paket P6 terpisah,
   nanti plug ke kontrak yang paket ini definisikan — lihat §3.1).
6. **Gerbang review SAYA.md §9:** branch baru → commit → push → **draft PR**,
   JANGAN auto-merge. JANGAN commit ke `main`.
7. **Commit dokumen non-kode (kalau ada) SEGERA** — jangan biarkan file
   untracked lama di worktree; insiden sebelumnya kehilangan seluruh rencana
   Fase 2 karena dibiarkan untracked saat operasi git lain berjalan.
8. Jangan ubah kode/skema/test yang sudah ada di `core-engine` kecuali diminta.

---

## 1. Tujuan paket

Bangun bedrock persepsi vektor yang benar SEBELUM grammar:
- Ekstrak text-span (posisi + rotasi) dari PDF via PyMuPDF.
- **Merge-run**: satukan fragmen span ("5","0","0","0" → "5000") sesuai RULE-EXT-03.
- Deteksi locale angka per-dokumen (§2.6) + normalisasi angka (raw disimpan).
- **Kontrak skema:** mirror `TkgDocument` kanonik + contract test paritas.
- **Kontrak sumber ganda (vektor + OCR)** — `TextSpan`/`Run` punya field
  `method`/`confidence` SEJAK AWAL, supaya paket P6 (PaddleOCR untuk sheet
  raster) bisa plug-in nanti tanpa mengubah `Run`/grammar/grid/table. Ini
  BUKAN spekulasi — P6 sudah direncanakan di dokumen induk.
- Fixture: span PLHUT nyata (derivatif, tanpa binari PDF) + 1 PDF sintetis
  non-PLHUT.

Tanpa merge-run, seluruh Fase 2 mustahil — fragmen PDF nyata tak akan pernah
cocok grammar. Ini alasan paket ini didahulukan.

---

## 2. Struktur file yang DIBUAT (audit dulu; reuse `ocr_extractor.py`, jangan duplikasi)

```
services/document-intelligence/app/perception/
  __init__.py
  models.py            # TextSpan, Run (+ enum bendera)
  ingest/
    __init__.py
    span_extractor.py  # PDF bytes/path -> list[TextSpan] per halaman/sheet (method="vector")
  vector/
    __init__.py
    merge_run.py       # RULE-EXT-03: span -> Run (method-aware, lihat §3.3)
  locale.py            # deteksi locale (§2.6) + normalisasi angka (raw disimpan)
  tkg/
    __init__.py
    models.py          # MIRROR TkgDocument kanonik (paritas core-engine)
services/document-intelligence/tests/
  test_perception_span_extractor.py
  test_perception_merge_run.py
  test_perception_locale.py
  test_perception_tkg_contract.py
  fixtures/perception/
    _generate_plhut_spans.py     # provenance: baca PDF via env, GAGAL keras bila tak ada
    plhut_spans.json             # derivatif (di-commit)
    _generate_synthetic_pdf.py   # buat PDF sintetis non-PLHUT + ekstrak spannya
    synthetic_denah_spans.json   # derivatif (di-commit)
```

---

## 3. Spesifikasi teknis rinci

### 3.1 `models.py` — TextSpan & Run

> **Kenapa `method`+`confidence` ada sejak P1** (bukan ditambah nanti): paket
> **P6 (PaddleOCR untuk sheet RASTER)** akan menghasilkan `TextSpan` dari OCR,
> BUKAN dari PyMuPDF vektor. Supaya P2 (grammar) dan P3 (rekonstruksi) bisa
> memproses span dari KEDUA sumber tanpa cabang kode terpisah, `TextSpan` HARUS
> punya field ini sejak awal (brain-00 RULE-EXT-31: "confidence sumber OCR
> lebih rendah daripada vektor"). P1 TIDAK mengimplementasikan OCR sama
> sekali — hanya menyiapkan kontraknya.

```python
class TextSpan(BaseModel):
    span_id: str            # stabil & deterministik: f"p{page}-{i:04d}"
    page: int                # 0-based
    text: str                # raw persis dari sumbernya (INV-TKG-03)
    bbox: tuple[float, float, float, float]  # x0,y0,x1,y1 ruang halaman (pt)
    rotasi: int               # 0/90/180/270 (dari dir span; dinormalkan ke derajat)
    font_size: float          # utk OCR raster (P6): estimasi dari tinggi bbox
    origin: tuple[float, float]  # titik awal baseline
    method: Literal["vector", "ocr"] = "vector"  # RULE-EXT-05: vektor-dulu
    confidence: float = 1.0  # vektor PyMuPDF = 1.0 (teks asli, bukan tebakan);
                              # OCR (P6) mengisi confidence model < 1.0

class Run(BaseModel):
    run_id: str
    text: str                # hasil gabungan span (urut baca)
    spans: list[TextSpan]    # anggota, raw tetap ada (zero-loss)
    bbox: tuple[float, float, float, float]  # union bbox
    rotasi: int
    method: Literal["vector", "ocr"] = "vector"  # anggota Run harus method SAMA
    confidence: float = 1.0  # min(confidence anggota)
    ragu: bool = False       # W-FRG: penggabungan meragukan (jangan paksa)
```

### 3.2 `ingest/span_extractor.py`
- `extract_spans(pdf_bytes: bytes) -> list[TextSpan]` dan
  `extract_spans_from_path(path: str) -> list[TextSpan]`. Semua span dari
  fungsi ini `method="vector"`, `confidence=1.0`.
- Pakai `fitz.open(...)` → per page `page.get_text("dict")` → iterasi
  `blocks -> lines -> spans`. Ambil `text`, `bbox`, `size`, `origin`, dan `dir`
  (arah baseline) → petakan ke `rotasi` (0/90/180/270; toleransi kecil).
- Deterministik: urutan span = urutan natural PyMuPDF; `span_id` = `f"p{page}-{i:04d}"`.
- JANGAN OCR di sini (INV-TKG-06 vektor-dulu). Kalau page tak punya text-layer,
  kembalikan span kosong untuk page itu + tandai `has_text_layer=False` di
  ringkasan (dipakai P6 untuk memutuskan kapan jalur OCR perlu jalan).

### 3.3 `vector/merge_run.py` — RULE-EXT-03 (INTI)
`merge_runs(spans: list[TextSpan], *, tol_baseline=None, gap_factor=0.6) -> list[Run]`

Aturan gabung (SEBELUM parsing grammar apa pun):
- **Method SAMA WAJIB:** span dengan `method` berbeda (vektor vs OCR) TIDAK
  PERNAH digabung ke Run yang sama, sekalipun posisinya berdekatan. Ini
  mencegah TKG tercampur sumber vektor dan OCR pada satu fakta.
- **Searah rotasi:** hanya span dengan `rotasi` sama yang boleh digabung.
- **Sebaris:** untuk rotasi 0/180 → baseline (origin.y) sama dalam toleransi
  (default `tol = 0.5 * median(font_size)` bila `tol_baseline` None). Untuk
  rotasi 90/270 → sebaris pada origin.x.
- **Berdekatan:** celah antar bbox sepanjang arah baca < `gap_factor * font_size`.
  Celah lebih besar → run baru (bukan digabung).
- Urutan gabung mengikuti arah baca (kiri→kanan utk 0°; sesuaikan utk rotasi).
- Simpan semua span anggota (zero-loss). `text` run = concat tanpa spasi bila
  celah sangat kecil (fragmen angka/kode) ATAU dengan spasi tunggal bila celah
  ~1 spasi — **simpan KEDUA**: `text` (heuristik terbaik) + biarkan spans
  mentah utuh untuk P2.
- **Ragu (W-FRG):** bila celah dekat ambang (mis. 0.6–1.2× gap) atau baseline
  meleset tipis → `ragu=True`. Jangan paksa gabung/pisah diam-diam.
- `confidence` Run = `min(confidence anggota)`.

> Catatan penting untuk P2: merge-run TIDAK memutuskan makna. Ia hanya menyusun
> ulang fragmen jadi kandidat string. Grammar (P2) yang memvalidasi.

### 3.4 `locale.py` — §2.6
- `detect_locale(spans) -> dict` : deteksi gaya desimal (koma vs titik) &
  pemisah ribuan dari bukti internal. Default `id-ID`. Kembalikan
  `{locale, desimal, bukti[], confidence}`. Keputusan = **Assumption**
  (dicatat), bukan hardcode.
- `normalize_number(raw: str, locale) -> {raw, nilai: float|None, koreksi: bool}` :
  raw SELALU dikembalikan; `nilai=None` bila gagal. Reuse logika
  `app/processors/ocr_extractor.py` bila cocok — jangan tulis ulang mentah-mentah.

### 3.5 `tkg/models.py` — MIRROR kanonik + kontrak
- Mirror **persis** field publik `services/core-engine/app/tkg/models.py`
  (`TkgDocument`, `TkgSheet`, `SheetMeta`, `Grid`, `GridAxis`, `GridSpan`,
  `GridTotal`, `Level`, `RebarSpec`, `TypeRecord`, `TkgTable`,
  `ElementInstance`, `RuasGrid`, `Dimension`, `Unclassified`). Nama field &
  Literal HARUS identik.
- **Contract test** (`test_perception_tkg_contract.py`): bangun satu
  `TkgDocument` minimal via mirror → `model_dump()` → bandingkan set field via
  `model_fields` kedua kelas → assert identik.

---

## 4. Fixture (pola sama seperti Fase 0 `_generate_*.py`)

### 4.1 `_generate_plhut_spans.py`
- Baca `os.environ["PAAX_PLHUT_PDF"]` (path ke `GAMBAR KERJA PLHUT SURAKARTA.pdf`).
  Kosong/tak ada → `raise SystemExit(...)` (GAGAL KERAS).
- `extract_spans_from_path(...)` → tulis `plhut_spans.json` (list TextSpan
  `model_dump`, plus header {file_hash, n_pages, generated}).

### 4.2 `_generate_synthetic_pdf.py`
- Buat PDF sintetis KECIL non-PLHUT (grid 3 as 6000+6000, tabel balok
  "B1 300x500 4D19") via PyMuPDF, termasuk minimal satu label SENGAJA dipecah
  jadi beberapa span (uji merge-run) dan satu label rotasi 90°. Ekstrak
  spannya → `synthetic_denah_spans.json`.

---

## 5. Anchor test WAJIB (nilai dihitung Saya — jangan diubah tanpa hitung ulang)

`test_perception_merge_run.py`:
1. Span rotasi 0, sebaris, `["5","0","0","0"]`, celah kecil, semua `method="vector"`
   → satu Run `text=="5000"`, 4 span anggota, `ragu==False`.
2. `["1","2","D","1","6"]` berdekatan → satu Run `text=="12D16"`.
3. Dua kelompok dengan celah besar di tengah → **dua** Run terpisah.
4. Span rotasi 90 digabung sepanjang sumbu-Y, tidak tercampur dengan span
   rotasi 0 di dekatnya.
5. Celah ambang (0.6–1.2× font) → Run `ragu==True` (W-FRG).
6. **[Baru]** Dua span berdekatan & sebaris tapi `method` beda (satu
   `"vector"`, satu `"ocr"`) → **TIDAK digabung**, tetap 2 Run terpisah.

`test_perception_locale.py`:
7. Dokumen dengan span "4000","±0.000","5000" → `detect_locale` = id-ID,
   desimal titik, `confidence>0`; raw tetap ada.
8. `normalize_number("ABC")` → nilai None, raw="ABC".

`test_perception_span_extractor.py`:
9. Ekstrak dari `synthetic_denah_spans` → jumlah span > 0, tiap span punya bbox
   4-tuple & rotasi ∈ {0,90,180,270}; `method=="vector"`, `confidence==1.0`;
   span_id deterministik.

`test_perception_tkg_contract.py`:
10. Paritas field mirror vs core-engine (set nama field identik).

---

## 6. Verifikasi sebelum commit (jalankan & tempel output di report)

```powershell
cd G:\paax-ai-main\services\core-engine
$env:PYTHONUTF8=1
python -m pytest -q

cd G:\paax-ai-main\services\document-intelligence
$env:PYTHONUTF8=1
python -m pytest -q

$env:PAAX_PLHUT_PDF="C:\Users\Nothing\Downloads\GAMBAR KERJA PLHUT SURAKARTA.pdf"
python tests/fixtures/perception/_generate_plhut_spans.py
```

Kriteria terima:
- Semua test document-intelligence hijau (10 anchor di atas).
- core-engine tetap hijau (238) — tidak ada regresi.
- Fixture ter-generate & di-commit.
- Tidak ada dep berat baru.
- Lakmus §0.1: tak ada literal khas PLHUT di `app/perception/`.

---

## 7. Commit, PR, dan REPORT

- Branch: `feat/fase2-p1-fondasi-persepsi` (dari `main`, atau sebutkan basis
  yang dipakai bila #27 belum merge).
- Commit: `feat(perception): fondasi persepsi vektor — span + merge-run + locale + kontrak TKG (Fase 2 P1)`
- Push → **draft PR** ke `main`. JANGAN merge.
- **Commit juga dokumen non-kode kalau ada perubahan di `docs/` terkait paket
  ini** — jangan biarkan untracked (lihat insiden §0.2 rencana induk).
- Report → `report/REPORT_FASE2_P1_SAYA_2026-07-04.md`: langkah, output
  pytest kedua service, daftar file, SHA commit, URL PR.

---

## 8. Yang TIDAK dikerjakan di P1 (biar tak overscope)
- Grammar notasi (rebar/dimensi/mutu/kode) → P2.
- Rekonstruksi grid/tabel/elemen + binding → P3.
- Validator V-01..V-10 penuh + renderer .tkg.txt + gerbang + endpoint nyata → P4.
- OCR/PaddleOCR sungguhan → P6 (paket ini HANYA menyiapkan kontrak `method`/`confidence`).
Kalau ragu batas paket, STOP dan tanya Saya/owner — jangan menambah cakupan diam-diam.
