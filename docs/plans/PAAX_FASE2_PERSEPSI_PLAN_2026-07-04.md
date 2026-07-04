# PAAX — Rencana Fase 2: Persepsi Baca-Gambar (Gambar → TKG benar)

> Ditulis Claude, 2026-07-04 (revisi sore — lihat §0.2 "Insiden & koreksi"). Sumber
> kebenaran: `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`
> (grammar §2, SOP sheet §3, binding §5, validator V-01..V-10 §7, raster §8) +
> roadmap `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md` + konsep integrasi
> `Downloads/konsep_paddleocr_openai_vision_paax.txt` (dianalisis §P6).
> **Prasyarat sudah lolos:** Fase 0 (golden anchor HSP+RAB PLHUT + harga Surakarta
> nyata) SELESAI & ter-commit (commit `1ee7665`, draft PR #27, 238 test hijau).

> ## ✅ UPDATE 2026-07-04 (malam) — P1, P2, P3, P4, P6, P5-FIX DIIMPLEMENTASIKAN
> Owner memutuskan: Claude mengerjakan LANGSUNG seluruh paket di bawah (bukan
> lewat prompt Codex — dokumen prompt di `docs/prompts/PAAX_CODEX_PROMPT_FASE2_
> *.md` kini HISTORIS/SUPERSEDED, jangan dijalankan lagi). Hasil: `services/
> document-intelligence/app/perception/` lengkap (span+merge-run+locale+kontrak
> TKG, grammar §2, rakit grid/tabel/elemen via `page.find_tables()` NYATA,
> validator+metrik+gerbang, adapter PaddleOCR raster lazy). Endpoint
> `/drawings/analyze` diperluas dgn `metrics`/`gerbang` NYATA. Frontend
> `tkg-workspace.tsx` dikoreksi baca data ASLI (fabrikasi kode gerbang lama
> dihapus total). **document-intelligence 5→92 test hijau**, **web 41**,
> **core-engine tetap 198** (tak disentuh). Diverifikasi end-to-end di browser
> nyata (upload→analyze→review menampilkan angka asli). Smoke JUJUR ke PDF
> PLHUT asli: 47 table record + 40 elemen NYATA (dulu ~0), tapi cakupan
> rata-rata baru **16,24%** — kemajuan nyata, **BUKAN** GERBANG-2 selesai
> (grid-dari-geometri §3.1.1, binding §5, deteksi simbol MASIH gap). Detail
> lengkap tiap paket ditandai `[SELESAI]`/`[BELUM]` di §3 di bawah. Semua
> perubahan **belum di-commit** (menunggu Codex, sesuai arahan owner).

> ## ✅ SUSULAN (2026-07-04, lanjutan malam) — GRID DARI GEOMETRI (§3.1.1) SELESAI
> Owner memilih lanjut (bukan berhenti): rekonstruksi grid dari bubble-as +
> garis-dimensi (`app/perception/vector/grid_geometry.py`) selesai & diuji —
> lihat §Paket F2-P3 revisi di bawah untuk detail teknis, nilai acuan, dan
> bug yang ditemukan+diperbaiki (lingkaran kecil kebetulan sejajar; batas
> DIMS_RANGE salah dipakai utk total; margin channel offset-tepi kurang
> lebar). **Cakupan real PLHUT: 16,24% → 33,75%** — GERBANG-2 masih terbuka
> (§5 binding + simbol grafis belum). Investigasi branch juga selesai:
> divergensi dgn PR #27 (Fase 0) ternyata HANYA 1 file overlap (`STATE.md`),
> semua 3 PR mergeable independen — lihat `docs/ai-map/STATE.md` §divergensi.

---

## 0. Kenapa Fase 2 sekarang, dan apa targetnya (baca ini kalau buru-buru)

Fase 0 membuktikan **separuh keras** benar: kalau TKG-nya benar, engine hitung
RAB PLHUT tepat (HSP 32/32, total dev +0,0009%). Tapi TKG PLHUT itu **ditranskrip
TANGAN** oleh manusia (`services/core-engine/tests/test_plhut_golden.py` →
`buat_tkg_plhut()`). Yang belum ada: **mesin yang bisa menghasilkan TKG itu
sendiri dari PDF gambar kerja nyata.**

**Target Fase 2 (GERBANG-2, terukur & objektif):**
> PDF gambar kerja PLHUT nyata → dijalankan pipeline persepsi otomatis →
> menghasilkan `TkgDocument` yang **COCOK** dengan golden transkrip-tangan
> `buat_tkg_plhut()` dalam toleransi (grid, tipe, dimensi, tulangan, count
> ganda-metode), lolos validator V-01..V-10, DAN juga benar pada ≥1 pola
> sintetis non-PLHUT (bukti generalisasi, bukan overfit).

### 0.1 PRINSIP WAJIB — PLHUT = KUNCI UJI, BUKAN TEMPLATE
Semua yang dibangun ke `app/perception/` (atau modul sejenis) harus UMUM
(berlaku gambar apa pun). DILARANG ada logika/konstanta yang mengenali "ini
PLHUT". Uji lakmus tiap PR: "kalau besok owner kasih gambar proyek LAIN, apakah
kode ini tetap relevan?" Wajib ada ≥1 fixture SINTETIS non-PLHUT per paket yang
menghasilkan output.

### 0.2 INSIDEN & KOREKSI (2026-07-04, sore) — WAJIB dibaca sebelum lanjut
Sesi pagi menulis dokumen ini + 3 prompt (P1 fondasi, P2 grammar, P5 UI review)
dan menyerahkannya ke Codex. Setelah Codex bekerja (lihat
`report/REPORT_CODEX_FULL_WORKLOG_UI_PREMIUM_DOC_INTEL_2026-07-04.md`), Claude
mengaudit ulang hasilnya dan menemukan 3 hal:

1. **File dokumen ini + 3 prompt HILANG dari disk** (bukan cuma dari git —
   hilang total, tak pernah ter-commit). Root cause: file-file itu berstatus
   *untracked* di worktree utama; saat Codex membereskan kebingungan
   branch/worktree (server sempat menampilkan dashboard lama, worktree
   `G:\paax-ai-main-fase2-p5` dibuat lalu dihapus), operasi pembersihan
   (`git clean -fd` atau setara) ikut menghapus file untracked yang TIDAK ADA
   hubungannya dengan masalah yang sedang diperbaiki. **Pelajaran wajib untuk
   sesi depan: dokumen rencana/prompt yang baru ditulis harus SEGERA di-commit
   (bukan dibiarkan untracked lama), supaya tidak hilang oleh operasi git yang
   agresif.** Dokumen ini adalah rekonstruksi penuh dari isi asli (tersimpan di
   riwayat percakapan), + perbaikan.
2. **P1 (fondasi persepsi) dan P2 (grammar/lexicon) TIDAK PERNAH DIJALANKAN.**
   Tidak ada folder `app/perception/` di `services/document-intelligence` sama
   sekali. Codex hari ini HANYA mengeksekusi P5 (frontend). Ini berarti
   **kualitas persepsi backend TIDAK BERUBAH** dari sebelumnya — pipeline
   `drawing_classifier.py`/`grid_extractor.py`/`table_extractor.py`/
   `tkg/builder.py` yang lama (regex naif, sudah terbukti gagal di PDF PLHUT
   nyata) masih itu-itu saja.
3. **P5 dieksekusi DUA KALI dengan hasil berbeda kualitas:**
   - **Eksekusi pertama** (branch bersih `feat/fase2-p5-ui-persepsi-review`,
     draft PR #28, commit `60a2f64`) — **BENAR sesuai prompt**: memakai kontrak
     P4 (`POST /drawings/tkg/perceive` → `{tkg, validation, metrics, gerbang,
     tkg_txt}`), dengan MOCK yang ditandai jelas
     `TODO: sambung P4 saat endpoint kontrak final sudah merge`. Tidak ada
     angka difabrikasi di frontend.
   - **Eksekusi kedua** (langsung di `feat/ui-premium-redesign`, commit
     `a45b4c1`, "port ke UI premium") — Codex **menulis ulang dari nol**
     alih-alih rebase/merge PR #28 yang sudah benar. Hasilnya DIWIRE ke
     endpoint LAMA yang nyata (`POST /drawings/analyze`, backend naif) dan
     **menghitung sendiri di TypeScript** (`buildPerceptionReview()`): field
     `coverage` (dari tally elemen/tabel/dimensi/catatan) dan blok "Gerbang"
     dengan kode buatan sendiri `V-TKG`/`V-COV`/`V-WARN`/`V-CLS`. Dua masalah:
     (a) kode `V-*` ini BUKAN validator resmi brain (`V-01..V-10`) — meniru
     penamaan itu menciptakan risiko kebingungan (rekayasa masa depan bisa
     mengira ini validator asli); (b) `coverage`/status "SIAP REVIEW" dihitung
     di frontend dari data yang SUDAH ADA di memori, bukan angka RAB/HSP — jadi
     BUKAN pelanggaran Aturan Emas §1 secara harfiah, tapi tetap berisiko
     menyesatkan (memberi kesan tervalidasi padahal cuma heuristik tally lokal).
   - **Keputusan Claude:** JANGAN buang eksekusi kedua (ia real, jalan hari
     ini, teruji 40/40 vitest). Perbaiki di tempat lewat **P5-FIX**
     (§Paket P5-FIX di bawah) — ganti kode `V-*` supaya tidak bentrok nama
     dengan validator resmi, beri label eksplisit "heuristik UI sementara",
     dan siapkan agar mudah diganti pakai `metrics`/`gerbang` ASLI begitu P4
     backend (yang MEMPERLUAS endpoint `/drawings/analyze` yang sama — lihat
     keputusan §4.1) selesai. PR #28 (versi mock yang benar) ditandai
     *superseded*, boleh ditutup setelah P5-FIX di-review.

**Dampak ke urutan kerja:** prioritas berubah. P1 dan P2 (backend) **belum
mulai sama sekali** — itu tetap paket paling menentukan (tanpa itu, kualitas
persepsi nyata TIDAK berubah walau UI-nya sudah bagus). P5-FIX adalah
perbaikan kecil, bukan pembangunan baru.

---

## 1. Temuan audit kode (keadaan NYATA hari ini) — dasar rencana

1. **DUA skema TKG yang DIVERGEN — ini masalah arsitektur inti Fase 2.**
   - **Kanonik (target):** `services/core-engine/app/tkg/models.py` = `TkgDocument`
     lengkap, dibangun tangan di golden anchor `test_plhut_golden.py`.
   - **Persepsi (naif, harus di-upgrade):** `services/document-intelligence/app/tkg/builder.py`
     `build_tkg_from_text()` — grammar mainan (hanya cocok string terstruktur),
     dict bentuk lain (BUKAN `TkgDocument` kanonik).
   - PDF nyata → PyMuPDF mengeluarkan **fragmen** → grammar tak cocok → semua
     `unclassified`. Terbukti ulang di PDF PLHUT.
2. **Dependency tipis:** `document-intelligence/pyproject.toml` hanya punya
   `pymupdf`. PyMuPDF ≥1.23 punya `page.get_text("dict")` (span+bbox+rotasi) DAN
   `page.find_tables()` — cukup untuk pipeline vektor tanpa dep baru.
3. **Belum ada `PARAM.dims_range` / `PARAM.eval.tkg_grammar_min`** di
   `core-engine/app/tkg/params.py`. Ditambahkan di P2.
4. **Fixture perception belum ada.** Strategi: ekstrak span mentah PDF PLHUT
   sekali → commit `tests/fixtures/perception/plhut_spans.json` (derivatif,
   BUKAN binari PDF).
5. **[BARU] Sheet RASTER (scan/foto) 100% belum tertangani** — pipeline saat
   ini (PyMuPDF) hanya bisa membaca PDF ber-text-layer vektor. Brain §8 (RULE-
   EXT-30..33) mensyaratkan jalur OCR raster terpisah, dengan confidence lebih
   rendah & review manusia wajib. Ini domain paket P6 (PaddleOCR) — lihat di
   bawah. Konsep integrasi dari owner (`Downloads/konsep_paddleocr_openai_vision_paax.txt`)
   sudah dianalisis kritis terhadap kode nyata di repo (§P6.1).

---

## 2. INVARIAN WAJIB tiap paket (kunci lakmus review Claude)

- **§0.1 fixture-bukan-template** (lihat atas).
- **INV-TKG-02 ZERO-LOSS:** tiap span teks masuk TKG — ke blok tepat atau
  `UNCLASSIFIED`. Cakupan dilaporkan di METRICS.
- **INV-TKG-03 NO-SILENT-FIX:** raw SELALU disimpan berdampingan hasil normal +
  bendera koreksi.
- **AP-E-04 NO-GUESS:** string tak cocok grammar → `UNCLASSIFIED` + `W-*` +
  `needs_review`.
- **INV-TKG-05:** TKG BUKAN RAB. Tak ada harga/AHSP/ekspansi/biaya di persepsi.
- **INV-TKG-06 / AP-E-06 / RULE-EXT-05 "vektor-dulu":** bila sheet ber-text-layer
  vektor, DILARANG memakai OCR/vision untuk membaca angka di sheet itu. OCR
  (P6) HANYA untuk sheet yang terbukti raster (tanpa text-layer).
- **RULE-EXT-31:** confidence sumber OCR lebih rendah daripada vektor — WAJIB
  dicatat sebagai field, bukan diam-diam disamakan.
- **Kode validator tidak boleh direkayasa ulang di frontend.** Kode `V-01..V-10`
  adalah milik validator resmi brain (`core-engine` / P4). UI TIDAK BOLEH
  membuat kode baru yang meniru pola penamaan itu (pelajaran §0.2 poin 3).
- **ATURAN EMAS (CLAUDE.md §1):** tak ada perhitungan biaya di sini; angka
  kuantitas tetap dihitung engine deterministik core-engine.
- **Dokumen rencana/prompt WAJIB di-commit segera setelah ditulis** — jangan
  dibiarkan untracked lintas-sesi (pelajaran §0.2 poin 1).

---

## 3. Dekomposisi paket kerja (untuk Codex) + gerbang review (untuk Claude)

Layout target (audit dulu, jangan buat baru bila sudah ada):
```
services/document-intelligence/app/perception/
  ingest/    span extraction (vektor ATAU ocr) + hash + deteksi vektor/raster
  vector/    merge-run fragmen (§1 RULE-EXT-03) — sumber-agnostik (vektor/OCR)
  ocr/       [P6] adapter PaddleOCR -> TextSpan (raster only)
  lexicon/   kamus prefiks + typo + inferensi satuan (§2)
  grammar/   parser rebar/dimensi/mutu/level/kode (§2)
  grid/      rekonstruksi grid (§3.1.1)
  tables/    rekonstruksi sel dari find_tables (§3.2)
  symbols/   deteksi blok berulang
  assoc/     binding label↔objek↔alamat grid (§5)
  tkg/       assembler → TkgDocument kanonik, validator V-01..V-10, renderer .tkg.txt
  qa/        metrik + laporan gerbang
tests/fixtures/perception/   plhut_spans.json + sintetis + raster sintetis (P6)
```

---

### ▶ PAKET F2-P1 — Fondasi persepsi vektor (span + merge-run + locale + kontrak skema)
**Prompt (historis, SUPERSEDED — dikerjakan langsung Claude):** `docs/prompts/PAAX_CODEX_PROMPT_FASE2_P1_FONDASI_PERSEPSI.md`
**Status: ✅ SELESAI (2026-07-04 malam).** Implementasi:
`services/document-intelligence/app/perception/{models.py,ingest/span_extractor.py,
vector/merge_run.py,locale.py,tkg/models.py}`. Bug nyata ditemukan & diperbaiki
saat implementasi: merge-run sempat menggabung baris tabel berbeda karena
gap-negatif tidak dijaga — diperbaiki dgn `line_hint` (dari `block/line`
PyMuPDF asli) sbg batas gabung KERAS + guard `gap >= -0.5*font`. 31 test hijau
(`test_perception_{span_extractor,merge_run,locale,tkg_contract}.py`).

Bedrock persepsi vektor: `TextSpan`/`Run` (kini dengan field `method`/`confidence`
sejak awal — lihat revisi prompt — supaya P6/OCR bisa plug-in tanpa mengubah
kontrak), `merge_runs` (RULE-EXT-03), deteksi locale (§2.6), mirror `TkgDocument`
kanonik + contract test paritas skema. Fixture: span PLHUT nyata (derivatif) +
1 PDF sintetis non-PLHUT.

**Gerbang review Claude P1:** contract test hijau; merge-run lulus 5 anchor;
tak ada dep berat baru; suite lama tetap hijau; §0.1/INV-TKG-03 patuh.

---

### ▶ PAKET F2-P2 — Leksikon & grammar notasi (brain-00 §2), murni & teruji tebal
**Prompt (historis, SUPERSEDED):** `docs/prompts/PAAX_CODEX_PROMPT_FASE2_P2_LEKSIKON_GRAMMAR.md`
**Status: ✅ SELESAI (2026-07-04 malam).** Implementasi:
`app/perception/{lexicon/{prefixes,typo,units}.py,grammar/{type_code,rebar,
section,mutu,level}.py,params.py}`. 37 test hijau, semua ~50 kasus tabel
anchor lolos (`test_grammar_{rebar,section_units,type_code,mutu_level}.py`).
Catatan: `result.py` terpisah dari spek awal TIDAK dibuat — tiap parser punya
dataclass hasil sendiri (lebih sederhana, tanpa abstraksi base class yang
belum perlu).

**Gerbang review Claude P2:** ~50 anchor grammar hijau; kasus di luar kamus
BENAR jadi UNCLASSIFIED; fungsi murni; §2.7 inferensi satuan tercatat sbg
assumption.

---

### ▶ PAKET F2-P3 — Rekonstruksi terstruktur → TkgDocument (grid + tabel + elemen + binding)
**Status: ✅ SELESAI-PARSIAL, DIPERLUAS (2026-07-04 malam lanjutan) — grid
geometri §3.1.1 kini ADA, cakupan naik, tapi masih di bawah spek penuh.**
Implementasi: `app/perception/assemble.py` + `app/perception/vector/
grid_geometry.py` (BARU). Yang BENAR-BENAR jalan:
- **Tabel via `page.find_tables()` NYATA** (rangka garis sungguhan) — 1
  record per kode, kolom dipetakan via grammar P2.
- **Elemen** dihitung dari Run yang cocok `parse_type_code` di luar tabel/grid.
- **Grid — DUA sumber digabung** (BARU): (1) **geometri** — deteksi bubble-as
  (lingkaran vektor bezier/poligon, filter kelompok-ukuran dominan supaya
  penanda lain yg kebetulan sejajar/segaris tak salah tertangkap sbg keluarga
  as baru — BUG NYATA ditemukan+diperbaiki saat uji fixture sintetis), lalu
  cari Run angka murni di 'channel' tegak lurus arah keluarga bubble, assign
  ke slot antar-pasangan-as, nilai di luar rentang bubble→`offset_tepi`
  (§3.1.1c, TIDAK ikut total — cegah alarm palsu ala AP-E-08), total HANYA
  diterima bila cocok penjumlahan bentang (toleransi 1%, tidak dipaksakan).
  Hasil: `sumbu_x`/`sumbu_y` kini punya `posisi_mm` KUMULATIF NYATA (bukan
  `None` semua spt sebelumnya) — dihitung dari rantai bentang mm, BUKAN dari
  koordinat titik PDF (menghindari perlu tahu skala gambar). (2) **notasi**
  eksplisit `"<as>-<as>=<nilai>"` sbg pelengkap (tidak dobel-hitung).
  **Nilai acuan diverifikasi ANALITIS dari geometri PDF PLHUT SEBELUM kode
  ditulis** (bukan ditebak-mundur): sumbu_x 1/2/3/4 @ 0/5000/7000/10000mm,
  sumbu_y A-F @ 0/4000/8000/12000/16000/20000mm, total_x=10000, total_y=20000,
  offset_tepi=1580 — kode menghasilkan angka PERSIS SAMA.
- **YANG BELUM** (dicatat jujur di docstring, bukan ditebak): binding
  label↔alamat grid (§5) belum — `alamat` masih placeholder jujur (grid
  sekarang PUNYA posisi_mm sehingga binding ini sekarang MUNGKIN dikerjakan,
  belum dimulai); `count_simbol` selalu `None`; garis-as itu sendiri (line
  lurus panjang) tidak diverifikasi ulang — deteksi bertumpu bubble+angka
  saja; grid 3D/isometrik atau bubble non-lingkaran di luar cakupan.

**19 test hijau** (`test_perception_assemble.py` 12 + `test_perception_
grid_geometry.py` 7, termasuk 1 smoke real-PLHUT dgn anchor manual + 1 uji
fixture sintetis independen berlabel/nilai BEDA dari PLHUT [P/Q/R,
3500/2800/4000/3200] utk buktikan generalisasi §0.1, + 1 uji regresi
"lingkaran kecil kebetulan sejajar ≠ keluarga grid baru"). **Cakupan real
PLHUT (15 sheet, agregat): 16,24% → 33,75%** (hampir 2x lipat,
`span_terklasifikasi` 543/1609) — kemajuan terukur jujur, **BUKAN**
golden-match `test_plhut_golden.py` (itu masih butuh §5 binding penuh + simbol).

**Gerbang review Claude P3 (tercapai untuk cakupan di atas):** sintetis
non-PLHUT (2 fixture independen) lulus semua test; smoke PLHUT tidak crash,
angka jujur dilaporkan & cocok anchor manual. Golden-match penuh ke
`test_plhut_golden.py` MASIH gap terbuka (perlu §5 + simbol grafis).

---

### ▶ PAKET F2-P4 — Validator penuh V-01..V-10 + metrik + gerbang + endpoint nyata
**Status: ✅ SELESAI-PARSIAL (2026-07-04 malam).** Implementasi:
`app/perception/{validate.py,render.py}` + `/drawings/analyze` diperluas
nyata (bukan rencana). **V-01 (zero-loss) & V-06 (grammar-pass rate ≥85%)
DIEVALUASI NYATA**; V-02/03/04/05/08 SENGAJA tidak diduplikasi (itu tugas
`core-engine validate_tkg`, dipanggil terpisah — belum diverifikasi ulang
dgn TKG hasil pipeline baru, lihat §BELUM DIKERJAKAN STATE.md); V-07/09/10
JUJUR dilaporkan "BELUM DIEVALUASI" (bukan dipaksa lolos). 13 test hijau
(`test_perception_validate.py` + `test_drawing_routes_analyze.py`, termasuk
uji integrasi endpoint end-to-end via `TestClient` DAN verifikasi manual di
browser nyata). **KEPUTUSAN ARSITEKTUR (diikuti):**
P4 **MEMPERLUAS endpoint yang SUDAH ADA** `POST /drawings/analyze`
(`services/document-intelligence/app/api/drawing_routes.py` →
`DrawingAnalysisResponse`) dengan field `metrics` dan `gerbang` — **BUKAN**
membuat endpoint baru `/drawings/tkg/perceive` seperti draft prompt P5 pagi.
Alasan: satu endpoint lebih sederhana untuk frontend & operasional (tidak ada
dua jalur upload paralel yang membingungkan); P5-FIX sudah terlanjur wired ke
`/drawings/analyze` dan itu titik integrasi yang benar untuk diperluas, bukan
diganti.

Lingkup: validator sisi-persepsi V-01/V-06/V-07/V-09/V-10 (butuh data span),
sambung ke V-02/03/04/05/08 core-engine (jangan tulis ulang), blok METRICS
(span_total, cakupan, grammar_pass_rate, n_unclassified, n_warning), laporan
GERBANG §7, renderer `.tkg.txt`, golden TKG harness (T-08) dibanding
`buat_tkg_plhut()`, + sintetis kedua.

**Gerbang review Claude P4 = GERBANG-2 TUTUP (backend) — BELUM SEPENUHNYA
TERCAPAI, dicatat jujur:** `DrawingAnalysisResponse` SUDAH punya `metrics`+
`gerbang` nyata (bukan lagi dihitung di frontend) ✅. Cakupan V-01 pada PDF
PLHUT nyata naik dari ~16% → **~34%** setelah grid geometri §3.1.1 (lihat
§Paket F2-P3 revisi), masih jauh dari 100%; golden TKG belum cocok
(`test_plhut_golden.py`), V-02/03/04/05/08 belum diverifikasi ulang pasca-P3,
V-07/09/10 belum dievaluasi. **GERBANG-2 MASIH TERBUKA** — P4 di sini
menyelesaikan INFRASTRUKTUR gerbang (kontrak metrics/gerbang nyata + endpoint),
bukan KRITERIA gerbang itu sendiri.

---

### ▶ PAKET F2-P5-FIX — Perbaikan panel review persepsi (frontend, KOREKSI bukan bangun baru)
**Prompt (historis, SUPERSEDED — koreksi lebih dalam dari rencana awal):**
`docs/prompts/PAAX_CODEX_PROMPT_FASE2_P5_FIX_UI_PERSEPSI_REVIEW.md`
**Status: ✅ SELESAI (2026-07-04 malam) — lebih tuntas dari rencana awal.**
Karena P4 kini benar-benar mengembalikan `metrics`/`gerbang` NYATA (bukan
mock/nanti), `buildPerceptionReview()` di `tkg-workspace.tsx` DIROMBAK penuh:
fabrikasi kode gerbang `V-TKG`/`V-COV`/`V-WARN`/`V-CLS` **DIHAPUS TOTAL**
(bukan sekadar di-rename), digantikan pembacaan `result.metrics`/
`result.gerbang` apa adanya dari backend. `document-intelligence-tkg.ts`
diperluas dgn tipe `PerceptionMetrics`/`PerceptionGerbang`. Test regresi baru
memastikan tak ada lagi kode gerbang buatan. **Diverifikasi end-to-end di
browser nyata** (bukan cuma unit test) — lihat log verifikasi sesi ini.
41 test web hijau, tsc bersih. PR #28 (mock version lama) BELUM ditutup
(keputusan owner, bukan Claude).

**Gerbang review Claude P5-FIX (tercapai):** vitest+tsc hijau; tidak ada lagi
kode `V-*` buatan di frontend; UI membaca data asli backend; verifikasi
browser nyata sukses (upload→analyze→review menampilkan angka asli).

---

### ▶ PAKET F2-P6 — Raster (scan/foto) via PaddleOCR, berbagi pipeline dgn P1-P4
**Prompt (historis, SUPERSEDED):** `docs/prompts/PAAX_CODEX_PROMPT_FASE2_P6_PADDLEOCR_RASTER.md`
**Status: ✅ KODE SELESAI, dependency SENGAJA belum di-install (2026-07-04 malam).**
Implementasi: `app/perception/ingest/raster_detector.py` +
`app/perception/ocr/paddle_ocr_extractor.py`, terintegrasi ke
`assemble_sheet_from_page` (deteksi raster per-sheet → OCR bila raster,
guard vektor-dulu terverifikasi via test regresi
`test_perception_vector_first_guard.py`). Paket `paddleocr` (native, berat)
**SENGAJA TIDAK di-`pip install`** — lazy-import dibuktikan: service boot
normal + 92 test tetap hijau TANPA paket itu terpasang. 6 test hijau via MOCK
(`test_perception_raster_detector.py`, `test_perception_paddle_ocr_extractor.py`,
`test_perception_vector_first_guard.py`). `pyproject.toml` diberi extra
opsional `[ocr]`. **Jalur nyata (bukan mock) BELUM diverifikasi** — butuh
owner `pip install paddleocr` (atau extra `-E ocr`) untuk uji sungguhan;
modul `TableStructureRecognition`/`layout_detection` PaddleOCR (utk raster
lanjutan) SENGAJA belum disentuh (di luar scope P6 awal, dicatat §P6.1).

#### P6.1 — Analisis kritis konsep owner vs kode nyata
Konsep (`Downloads/konsep_paddleocr_openai_vision_paax.txt`) mengusulkan:
PaddleOCR untuk raster + OpenAI Vision sbg fallback pemahaman. Sudah dicocokkan
ke PaddleOCR 3.7.0 nyata (`G:\paax-data\PaddleOCR-main`, diperiksa README,
`pyproject.toml`, `docs/version3.x/pipeline_usage/OCR.en.md`,
`module_usage/table_structure_recognition.en.md`):
- **Setuju posisi arsitektur:** PaddleOCR HANYA di `services/document-
  intelligence` (bukan core-engine); hanya untuk raster; harus di-flag
  `needs_verification`. Ini selaras brain-00 §8 & INV-TKG-06.
- **Temuan baru (tak ada di konsep owner):** `paddleocr` versi ini adalah
  paket `PaddleOCR-VL`/`PP-StructureV3`/`PP-OCRv6` terpadu, bergantung pada
  `paddlex[ocr-core]` (native, berat — model diunduh saat pertama pakai,
  puluhan-ratusan MB). API-nya:
  ```python
  from paddleocr import PaddleOCR
  ocr = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False,
                  use_textline_orientation=False)
  for res in ocr.predict("halaman.png"):
      res.json  # -> rec_texts: list[str], rec_scores: list[float],
                #    rec_boxes: (n,4) int16 [xmin,ymin,xmax,ymax]
  ```
  Bentuk keluaran ini **PAS** dipetakan langsung ke `TextSpan` (P1) —
  `rec_texts[i]` → `text`, `rec_boxes[i]` → `bbox`, `rec_scores[i]` →
  `confidence`, `method="ocr"`. **Kesimpulan arsitektur: PaddleOCR TIDAK
  butuh pipeline terpisah — ia cukup jadi implementasi KEDUA dari
  `SpanExtractor` (P1), mengalir ke merge-run (P2)/grammar/grid/tabel/
  validator yang SAMA dgn jalur vektor.** Ini lebih sederhana & lebih diaudit
  daripada membangun jalur raster paralel seperti diusulkan konsep awal (yang
  menyiratkan pipeline OCR terpisah dari builder TKG).
- **Modul tambahan yang relevan tapi TIDAK dipakai di P6 (dicatat utk nanti):**
  `TableStructureRecognition` (model `SLANet`, keluaran `boxes`+`structure`
  HTML) bisa mengganti heuristik SK-04 KHUSUS untuk sheet raster (bukan
  vektor — vektor sudah punya `find_tables()` PyMuPDF yang persis, P3).
  `textline_orientation_classification` relevan utk label rotasi 90° pada
  scan (RULE-EXT-02). **DITUNDA ke iterasi P6 lanjutan** — P6 awal cukup OCR
  teks+bbox saja, supaya paket tidak membengkak.
- **Peringatan biaya/berat (sesuai catatan owner sendiri §12 konsep):**
  `paddlex[ocr-core]` adalah dependency native besar. **Keputusan: dependency
  LAZY & OPSIONAL** — service tetap boot normal tanpa PaddleOCR terpasang;
  jalur raster mengembalikan warning jelas ("OCR raster tidak tersedia, install
  `paddleocr` extra") bila import gagal, BUKAN crash seluruh service. Ini
  konsisten prinsip "fitur AI baru wajib fallback manual" (CLAUDE.md §2).
- **OpenAI Vision fallback (bagian konsep owner §3/§7):** DITUNDA, bukan
  bagian P6. Ini domain "AI Multimodal Bagian B" yang SUDAH ADA promptnya
  (`docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md`) dan
  masih menunggu owner centang kotak persetujuan biaya API. P6 SENGAJA tidak
  menyentuh itu supaya tidak duplikasi cakupan & tidak melompati gerbang
  persetujuan yang sudah ada.

#### P6.2 — Lingkup implementasi
- `ingest/`: deteksi vektor vs raster PER SHEET (RULE-EXT-30) — sheet dianggap
  raster bila `page.get_text("dict")` PyMuPDF mengembalikan 0 span teks
  bermakna (bukan sekadar kosong string).
- `ocr/paddle_ocr_extractor.py`: adapter `PaddleOCR.predict()` → `list[TextSpan]`
  (`method="ocr"`, `confidence=rec_scores[i]`), lazy-import (try/except
  ImportError → status jelas, bukan crash), render halaman raster via
  `pdf_renderer.py` yang SUDAH ADA (DPI tinggi, RULE-EXT-30).
  Render per-halaman dulu (bukan per-zona penuh — itu perbaikan lanjutan).
- Span OCR mengalir ke `merge_runs` (P1) — HARUS tidak tercampur dgn span
  vektor dalam satu Run (aturan sudah ditambah di P1 revisi).
- Endpoint: tambah opsi di `/drawings/analyze` (P4) — bila sheet terdeteksi
  raster, jalankan OCR path, tandai `warnings` "sheet raster, dibaca via OCR,
  confidence lebih rendah, WAJIB review manusia" (RULE-EXT-33).

#### P6.3 — Anchor test (fixture SINTETIS, §0.1 — DILARANG pakai scan PLHUT asli
sebagai data latih/tebakan, hanya sbg uji manual opsional)
1. Buat 1 gambar PNG sintetis kecil (teks jelas, mis. "K1 300X400", "GRID A-B
   4000") via Pillow/PyMuPDF render-ke-raster — commit sebagai fixture kecil.
2. `paddle_ocr_extractor` menghasilkan `TextSpan` dgn `method="ocr"`,
   `confidence` masuk akal (>0, <1 tipikal), bbox valid.
3. Import PaddleOCR gagal disimulasikan (mock ImportError) → fungsi
   mengembalikan status jelas "OCR tidak tersedia" TANPA melempar exception ke
   caller endpoint (service tetap hidup).
4. Sheet vektor (ber-text-layer) TIDAK PERNAH masuk jalur OCR (assert deteksi
   vektor vs raster benar) — ini menjaga RULE-EXT-05 vektor-dulu.

**Gerbang review Claude P6:** dependency lazy terverifikasi (uninstall
`paddleocr` → service tetap boot & test lain tetap hijau); span OCR bentuknya
identik kontrak P1; tak ada angka dipercaya 100% tanpa `needs_review`/warning;
§0.1 lakmus (tak ada logic PLHUT-spesifik).

---

## 4. Sekuens, branch, dan pola kerja — DIREVISI setelah keputusan owner (malam)

**Rencana asli** (di bawah, dipertahankan sbg arsip) mengasumsikan Codex
mengerjakan tiap paket via branch+PR terpisah, Claude menulis prompt & mereview.
**Owner mengubah ini di sesi yang sama**: Claude mengerjakan P1/P2/P3/P4/P6/
P5-FIX LANGSUNG (tanpa Codex, tanpa branch per-paket) di working tree
`feat/ui-premium-redesign` yang sudah aktif — supaya branch itu tetap SATU
dashboard utama, bukan bercabang. **Codex hanya akan menjalankan `git commit`
atas hasil yang sudah ada** (belum dieksekusi saat dokumen ini ditulis).

```
P5-FIX ✅ ─┐
P1 ✅      ├─► P3 ✅(parsial) ─► P4 ✅(parsial) ─► GERBANG-2 MASIH TERBUKA
P2 ✅      ┘         ▲                (infrastruktur metrics/gerbang beres;
P6 ✅(kode, tanpa dependency asli) ──┘  kriteria cakupan/golden-match belum)
```

- Semua paket di atas **sudah diimplementasikan** (lihat status ✅ per paket
  §3) — TIDAK ADA lagi yang menunggu Codex untuk *membangun*; sisanya
  menunggu Codex untuk *commit*, dan Claude/owner untuk memutuskan iterasi
  lanjutan (rekonstruksi grid geometri, binding §5, deteksi simbol, install
  `paddleocr` sungguhan).
- **Tidak ada branch baru dibuat** untuk paket-paket ini (beda dari rencana
  asli) — semua langsung di `feat/ui-premium-redesign` sesuai arahan owner.

---

### Rencana ASLI (arsip, sebagian sudah tidak relevan — dipertahankan sbg riwayat keputusan)

```
P5-FIX (kecil, sekarang) ─────────────────────────────────────► perbaikan cepat

P1 (fondasi, method+confidence) ─┬─► P3 (rakit) ─► P4 (gerbang+endpoint nyata) ══► GERBANG-2 TUTUP
P2 (grammar)                     ┘        ▲
P6 (PaddleOCR raster, butuh P1) ──────────┘ (span OCR ikut alur sama dgn vektor)
```
- **P5-FIX** boleh dikerjakan PALING DULU — kecil, murni frontend, tidak
  bergantung P1-P4.
- P1 & P2 boleh paralel. P6 butuh P1 (kontrak `TextSpan`/`Run`) tapi TIDAK
  butuh P2/P3/P4 selesai untuk *dibangun* (hanya untuk *dipakai penuh*).
- P3 butuh P1+P2. P4 butuh P3 (+ menyerap span dari P6 bila sudah ada).
- **Branch:** tiap paket branch sendiri dari `main` (setelah PR #27 Fase 0
  merge) — Nama: `feat/fase2-p5-fix-ui-persepsi`, `feat/fase2-p1-fondasi-persepsi`,
  `feat/fase2-p2-leksikon-grammar`, `feat/fase2-p6-paddleocr-raster`, dst.
  Draft PR, TIDAK auto-merge (CLAUDE.md §9). **JANGAN reimplement dari nol di
  branch lain bila PR yang benar sudah ada** (pelajaran §0.2 poin 3) — rebase
  atau merge, jangan tulis ulang.
- **Pola:** Claude tulis prompt+anchor → Codex implement+commit+draft PR+report
  → Claude review (pytest/vitest hijau + angka cocok + lakmus §0.1) → baru
  finalkan prompt paket berikutnya. Report Codex ditaruh di `report/`.
- **WAJIB BARU:** setiap dokumen rencana/prompt yang Claude tulis di sesi ini
  di-commit SEGERA (bukan dibiarkan untracked) — lihat §0.2 poin 1.

---

## 5. Pandang ke depan (setelah GERBANG-2) & jalur paralel non-pemblokir

- **Fase 3-4 (GERBANG-4):** SK-14 ukur vektor, triangulasi RULE-CONF-02, SK-19
  naik ke embedding search di katalog 2.542, BOE penuh + antrian ReviewTask.
- **Jalur paralel (boleh kapan saja, tak memblokir Fase 2):**
  - **0b semantik AHSP (SK-19):** pemetaan 112 resource Surakarta + 224 item
    DKH → kode resmi 2.542. Detail: `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`.
  - **AI Multimodal Bagian B (vision draft TKG):** hanya sheet RASTER, DAN
    HANYA setelah OCR (P6) sudah ada sbg lapis pertama — vision jadi fallback
    KETIKA OCR gagal/rendah confidence (persis alur di konsep owner §7), bukan
    pengganti OCR. Menunggu centang owner (biaya API) di
    `docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md`.
  - **Rekonsiliasi `surakarta.json` ganda** (repo vs `G:\paax-data`).

---

## 6. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Overfit ke PLHUT (langgar §0.1) | Wajib fixture sintetis non-PLHUT tiap paket; lakmus review Claude. |
| Table extraction PDF nyata rapuh | Pakai `find_tables()` PyMuPDF (vektor) / `TableStructureRecognition` (raster, iterasi lanjutan); sel gagal → raw+W-CEL. |
| Skema TKG divergen makin jauh | P1 kunci kontrak paritas via contract test. |
| PDF PLHUT tak accessible ke Codex | Generator baca via env `PAAX_PLHUT_PDF`, GAGAL keras; commit spans JSON derivatif. |
| Scope creep (vision/CV berat) | Fase 2 = vektor+OCR-teks deterministik SAJA; vision-LLM jalur terpisah owner-gated. |
| PaddleOCR berat/gagal install | Dependency lazy-optional; service tetap boot tanpa itu; warning jelas. |
| **Dokumen hilang lagi** (insiden hari ini) | Commit dokumen rencana/prompt SEGERA setelah ditulis; jangan biarkan untracked lintas-sesi. |
| Reimplementasi liar menimpa PR yang benar | Tegaskan di tiap prompt: rebase/merge branch yang ada, JANGAN tulis ulang dari nol. |

---

## 7. Yang dibutuhkan dari owner (minimal)

1. **Konfirmasi commit dokumen rencana ini SEKARANG** (supaya tidak hilang lagi).
2. **Merge PR #27** (Fase 0) — atau izin stacking di atas branch Fase 0.
3. **Akses PDF PLHUT** untuk Codex (env `PAAX_PLHUT_PDF`) saat menjalankan P1.
4. **Urutan eksekusi**: rekomendasi Claude = P5-FIX (cepat) → P1 & P2 (paralel)
   → P6 (paralel dgn P3, butuh P1) → P3 → P4 (Gerbang-2 tutup, termasuk
   menyerap P6). Setuju urutan ini?
