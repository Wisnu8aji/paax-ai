# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-07-08** (eksekusi prompt Fase M/N: V-03 fix + impor AHSP CK 2026). File ini SATU-SATUNYA tempat status berjalan.
> Selesai satu fase → perbarui di sini (jangan sebar ke banyak file).

## ✅ FASE M/N — V-03 FIX + IMPOR AHSP CK 2026 (prompt 2026-07-08)
Branch kerja: `feat/v03-fix-ahsp-catalog-import`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/31
Base yang dipakai: `origin/feat/rab-nav-validator-audit-ahsp-suggest` karena
PR #29 dan #30 masih open saat pekerjaan dimulai.

- **Fase M selesai**: V-03 core-engine tidak lagi membandingkan fingerprint
  penuh antar sheet denah. Validator sekarang membandingkan hanya label as
  yang muncul di kedua sheet; subset grid sah (mis. atap hanya B-C, lantai A-C)
  lolos, tetapi konflik posisi nyata tetap menjadi `E-GRID` dengan subject
  actionable seperti `x:B`. Marker `xfail` V-03 sudah dihapus.
- **Fase N selesai sebagai impor mekanis + audit batch**: katalog resmi
  `G:\paax-data\ahsp\cipta-karya-2026.json` berisi **2.542 item** disalin ke
  `data/ahsp/cipta-karya-2026.json`. File sample lama
  `data/ahsp/cipta-karya.sample.json` tetap ada dan tidak diubah.
- **Temuan data 10 batch**: semua 2.542 item parse sebagai `AHSPItem`; tidak
  ada `resource_code` asing terhadap master resource; ada **197 anomali
  mekanis** (unit kosong dan/atau resource sama dengan koefisien sama berulang
  dalam item) yang dicatat, bukan diperbaiki sepihak. Detail:
  `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`.
- **Coverage harga jujur**: sebelum impor, `jateng` coverage ratio 1.0 untuk
  4 item sample/12 resource. Setelah impor, loader memuat **2.546 AHSP** (2.542
  resmi + 4 sample); `jateng` coverage ratio menjadi **0.0049** (12 dari 2.441
  resource AHSP punya harga). Ini benar dan diharapkan karena HSD regional resmi
  untuk katalog 2026 belum diimpor.
- **Belum dikerjakan di prompt ini**: AHSP auto-suggest Fase L, impor price book
  dari `_resources_catalog.json` (dilarang karena semua price=0), deteksi simbol
  grafis, dan vision-LLM fallback.
- **Verifikasi**: core-engine **249 passed** (tanpa xfail), web Vitest
  **46 passed**, `pnpm tsc --noEmit` exit 0, document-intelligence
  **126 passed + 5 skipped**.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE J-2/K-2/L LANJUTAN (prompt 2026-07-07)
Branch kerja: `feat/rab-nav-validator-audit-ahsp-suggest`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/30
Base yang dipakai: `origin/feat/gambar-generate-rab-wiring` karena PR #29
belum merged saat eksekusi.

- **Fase J-2 selesai**: setelah `sendToRab` menyimpan volume ke Draft RAB,
  UI tidak auto-redirect. Tombol baru **"Lihat Draft RAB"** muncul dan kliknya
  memanggil `router.push('/proyek/[projectId]/rab')`. Ini menjaga konteks user:
  pesan sukses tetap terbaca, lalu user sendiri membuka draft.
- **Fase K-2 selesai sebagai audit validator**: test baru di
  `services/core-engine/tests/test_tkg.py` membuktikan V-02 tetap menangkap
  total grid salah walau data memakai `zone`, `offset_tepi`, `alamat_list`,
  dan `alamat_needs_review`; V-04 tetap hanya warning untuk orphan type/def.
- **Temuan V-03 eksplisit**: kasus denah multi-sheet dengan grid subset sah
  (mis. sheet atap hanya B-C sementara sheet lantai penuh A-C) saat ini masih
  menjadi `E-GRID` karena validator membandingkan fingerprint grid penuh antar
  semua sheet `denah`. Test ditandai `xfail(strict=True)` agar temuan terlihat
  tanpa mengubah gate logic sepihak. Perlu keputusan Claude/owner sebelum V-03
  diubah dari error keras menjadi aturan yang lebih sesuai realita multi-sheet.
- **Fase L di-skip sengaja**: masih opsional, katalog AHSP repo hanya sample 4
  item. Auto-suggest berisiko memberi kesan mapping AHSP sudah matang. Jalur
  saat ini tetap jujur: volume masuk Draft RAB, `ahsp_code` kosong, user pilih
  manual di halaman RAB.
- **Verifikasi**: web Vitest **46/46**, `pnpm tsc --noEmit` hijau,
  core-engine **242 passed + 1 xfailed**, document-intelligence **126 passed +
  5 skipped**. Browser Playwright memverifikasi upload PDF → analisa → simpan
  → kirim volume → tombol "Lihat Draft RAB" → URL `/proyek/project-1/rab` dan
  row volume `1.25` tersimpan dengan `ahsp_code: ""`.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE J/K SELESAI (prompt 2026-07-06)
Branch kerja: `feat/gambar-generate-rab-wiring`.

- **Fase J (wajib) selesai**: `apps/web/src/components/drawings/tkg-workspace.tsx`
  sekarang menjalankan `validateTkg` → `renderTkg` → `takeoffTkg` otomatis
  setelah user menekan **"Simpan hasil analisis"** pada Review Gambar. Tombol
  placeholder disabled **"Generate RAB"** dan teks **"Segera hadir"** dihapus
  dari UI. CTA yang sah adalah **"Kirim Volume ke Draft RAB"** setelah takeoff.
- **Aturan RAB tetap dijaga**: `sendToRab`, `TriagePanel`, dan format
  `RabDraftLine` tidak diubah. Item takeoff yang `needs_review` tidak dikirim.
  Item siap pakai dikirim sebagai baris Draft RAB berisi `volume`, sementara
  `ahsp_code` tetap string kosong agar user memilih AHSP di halaman RAB.
- **Fase K selesai sebagai coverage validator**: `services/core-engine/tests/
  test_tkg.py` menambah test untuk `SheetMeta.zone`, `alamat_list`,
  `alamat_needs_review`, dan notasi offset seperti `"B-offset_sebelum_1"`.
  Hasilnya: validator tidak membuat false-positive pada field pipeline baru,
  dan tetap menangkap issue nyata `W-CNT` ketika count simbol/label mismatch.
  Tidak perlu perubahan rumus/logic validator.
- **Fase L (AHSP auto-suggest) di-skip sengaja**: optional pada prompt, dan
  katalog AHSP lokal masih sample kecil. Mapping AHSP otomatis akan berisiko
  terlihat lebih pintar dari data yang tersedia. Jalur saat ini tetap jujur:
  volume masuk draft, AHSP dipilih manual.
- **Verifikasi**: web Vitest 45/45, `pnpm tsc --noEmit` hijau, core-engine
  240/240, document-intelligence 126/126 dengan 5 skipped. Browser headless
  Chrome juga memverifikasi upload PDF sintetis → Review Gambar → simpan →
  Triage Review + "Kirim Volume ke Draft RAB" muncul tanpa reload → Draft RAB
  tersimpan dengan volume `1.25` dan `ahsp_code: ""` → halaman `/rab`
  menampilkan row volume yang sama.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE 0-H SELESAI (2026-07-05 malam)
Owner minta ekstraksi gambar kerja dinaikkan setara referensi nyata (2 dokumen
di `Downloads/paax_plhut_extraction_*`, HANYA bahan belajar §0.1 — bukan
template) + UI disederhanakan total (istilah teknis disembunyikan) + PaddleOCR
sungguhan + semua `.md` diselaraskan ulang. Detail lengkap tiap fase:
**`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`**. Dikerjakan
LANGSUNG oleh Claude (bukan prompt Codex), berurutan tanpa berhenti minta izin
tiap fase (arahan eksplisit owner). **Semua fase 0-H selesai; Fase I (dokumen
ini) sedang berjalan.** Ringkasan hasil NYATA:

- **Fase B (zone classifier)**: `app/perception/zone_classifier.py` — judul
  sheet + skala diekstrak dari teks sungguhan (bukan placeholder generik "Sheet
  N"), zona paket-pekerjaan (substruktur/struktur_lantai_N/struktur_atap/
  detail_tabel) diklasifikasi rule-based dari judul. **Ke-15 sheet PLHUT
  cocok PERSIS** ke judul+skala asli PDF (zona: 13/15 cocok penuh intuisi
  manusia, 2/15 sengaja `detail_tabel` krn judul-nya tak punya kualifier
  lantai/atap eksplisit — kejujuran by-design, bukan bug).
- **Fase C (label→grid binding, §5)**: `app/perception/binding.py` — tiap
  instance elemen diikat ke alamat grid NYATA ("A1") atau notasi offset
  ("B-offset_sebelum_1") dari posisi bbox vs posisi_mm grid. **PC1/PC2/PC3
  PLHUT cocok PERSIS** ke tabel referensi owner. Bug nyata ditemukan+
  diperbaiki: label elemen digeser ~30-35pt dari simbol aslinya (toleransi
  awal 25% jarak-antar-as terlalu ketat, dinaikkan ke 40%).
- **Fase D (deteksi simbol)**: diinvestigasi, DITUNDA JUJUR — bentuk simbol
  footplat PLHUT (kotak+silang+kotak-kecil) terlalu spesifik ke satu konvensi
  drafter untuk digeneralisasi dengan aman dalam sisa waktu sesi ini.
- **Fase E (konsolidasi)**: `app/perception/consolidate.py` +
  `consolidated_models.py` — skema `ConsolidatedExtraction` TETAP (field
  selalu ada) merangkum grid kanonik (dipilih dari sheet terlengkap, konflik
  antar-sheet DITANDAI bukan ditimpa), element registry lintas-zona+tabel,
  assumption ledger, dimensi bangunan. PLHUT: grid 20m×10m benar, 32 kode
  elemen unik, 1078 assumption (mayoritas unclassified — jujur mencerminkan
  cakupan ~36%, bukan bug).
- **Fase F (async job)**: `POST /drawings/analyze/start` + `GET /drawings/
  analyze/status/{job_id}` (FastAPI BackgroundTasks + in-memory, batas: state
  hilang kalau restart — dicatat, cukup utk kematangan app saat ini).
- **Fase G (PaddleOCR nyata)**: `paddleocr` 3.7.0 + `paddlepaddle` 3.3.1
  BERHASIL terpasang & termuat di Python 3.13/Windows. **Temuan jujur**:
  inferensi `.predict()` gagal `NotImplementedError` native (oneDNN) di
  kombinasi OS/CPU mesin ini — adapter diperbaiki utk degradasi anggun
  (fallback manual tetap jalan, tidak meruntuhkan endpoint).
- **Fase H (UI overhaul)**: `tkg-workspace.tsx` dirombak —
  drag-drop+chip lampiran (reuse pola Engineering Chat), tombol "Jalankan
  Persepsi"→**"Analisa Gambar Kerja"**, animasi progres nyata (reuse
  `.pax-thinking`, teks dari `job.progress_message` backend bukan simulasi),
  panel teknis (cakupan%/grammar-pass/kode V-xx) **DIHAPUS dari tampilan
  utama**, diganti **"Review Gambar"**: kartu per-halaman (judul+zona+skala),
  grid&elemen per-zona bahasa manusia ("A1: PC1"), dimensi bangunan dalam
  meter, daftar "Perlu dicek" progresif (preview 12 + expand). Tombol
  **"Generate RAB"** placeholder (disabled, "segera hadir") — SENGAJA belum
  disambungkan, sesuai instruksi eksplisit owner (ekstraksi dulu, RAB nanti).
  **Diverifikasi end-to-end di browser nyata** (bukan cuma vitest): upload
  PDF sintetis via drag-drop asli → job async → Review Gambar tampil dgn
  dimensi bangunan benar (6,3m×7,2m cocok fixture) → simpan hasil → konfirmasi
  tersimpan. Nol error console.

**Angka final (2026-07-05 malam)**: core-engine **238**, document-intelligence
**131**, web **43** — total **412 test hijau**, tidak ada regresi.
**Cakupan real PDF PLHUT (15 sheet): 33,75% → 36,11%** (naik lagi setelah
Fase B/C — bug ditemukan: judul/skala yg sudah "dipakai jadi metadata" masih
salah dihitung unclassified, diperbaiki). **GERBANG-2 MASIH BELUM TUTUP** —
sisa gap: deteksi simbol grafis, beberapa sheet tanpa bubble-grid, V-02..08
core-engine belum diuji ulang dgn pipeline baru.

Investigasi branch (dari sesi sebelumnya): `feat/fase0-plhut-golden-anchor`
(Fase 0 RAB) dan `feat/ui-premium-redesign` (Fase 2 UI+persepsi) **SUDAH
DI-MERGE ke `main`** oleh Codex sebelum sesi ini dimulai (lihat `git log`
commit `d17a67d`/`97161a4`/`38ac2ef`) — working tree SEKARANG langsung di
`main`, bukan lagi branch terpisah. Semua perubahan Fase 0-H sesi ini
**MASIH BELUM DI-COMMIT** (Claude dilarang commit) — prompt Codex baru:
`docs/prompts/PAAX_CODEX_PROMPT_COMMIT_GAMBAR_TEKNIK_SIPIL_2026-07-05.md`.

## ⚠️ DIVERGENSI BRANCH — SUDAH DIINVESTIGASI (2026-07-04 malam), TERNYATA KECIL
`feat/ui-premium-redesign` (branch aktif, UI premium + SEMUA implementasi Fase
2 P1-P6+geometri grid) dan `feat/fase0-plhut-golden-anchor` (commit `1ee7665`,
draft PR #27) adalah SIBLING dari titik cabang yang sama (merge-base `a0b06ca`),
BUKAN satu garis keturunan — dokumen/fixture Fase 0 memang tidak ada di working
tree ini, bukan hilang. **Temuan investigasi (bukan asumsi):**
- Fase 0 HANYA menyentuh 14 file, SEMUA di `services/core-engine/tests/
  fixtures/plhut/*`, `data/harga-satuan/surakarta.json`, dan beberapa docs —
  **TIDAK ADA overlap kode** dengan Fase 2 (`document-intelligence`/`apps/web`).
  **Satu-satunya file yang sama-sama disentuh kedua branch: `docs/ai-map/
  STATE.md`** (konflik teks kecil, gampang diselesaikan manual).
- `gh pr list`: ketiga PR draft (#26 `ui-premium-redesign`, #27 `fase0-plhut-
  golden-anchor`, #28 `fase2-p5-ui-persepsi-review` lama/superseded) berstatus
  `MERGEABLE` ke `main` **secara independen**.
- **Rekomendasi (keputusan owner/Codex, BUKAN dieksekusi Claude — merge = commit):**
  merge PR #27 ke `main` dulu (isinya murni core-engine, tidak menyentuh
  UI/document-intelligence, resiko rendah), lalu commit+push pekerjaan sesi ini
  ke PR #26 dan selesaikan SATU konflik `STATE.md` secara manual saat merge
  PR #26 ke `main` setelahnya. Tidak perlu rebase besar-besaran.

## ⏩ TERBARU (2026-07-04, malam) — Fase 2 P1-P4+P6 DIIMPLEMENTASIKAN LANGSUNG OLEH CLAUDE
- **FASE 0 DI-COMMIT**: commit `1ee7665`, draft PR #27 (belum merge), 238 test
  hijau. Report: `report/REPORT_FASE0_PLHUT_GOLDEN_ANCHOR_CODEX_2026-07-04.md`.
- **Audit pagi** menemukan Codex hanya menjalankan P5 (frontend) dan
  memfabrikasi kode gerbang ad-hoc yang bentrok nama dgn validator resmi brain
  — lihat riwayat di [[roadmap-gambar-ke-rab]] memory / git log sesi ini untuk
  detail insiden & analisis PaddleOCR.
- **KEPUTUSAN OWNER (sore/malam):** Claude mengerjakan LANGSUNG seluruh backend
  Fase 2 (P1, P2, P3, P4, P6) + koreksi konektor frontend — TIDAK via prompt
  Codex. Codex hanya bagian commit (belum dijalankan — semua perubahan di
  bawah masih **UNCOMMITTED** di worktree `feat/ui-premium-redesign`, yang
  tetap jadi satu-satunya branch/worktree aktif, bukan cabang terpisah).
- **HASIL NYATA (bukan rencana lagi):**
  - `services/document-intelligence/app/perception/` dibangun penuh: span
    vektor+rotasi (P1), merge-run fragmen dgn guard method/line/gap-negatif
    (P1), leksikon+grammar notasi struktur §2 (~50 anchor, P2), rekonstruksi
    grid (notasi gabungan eksplisit)+tabel (`page.find_tables()` NYATA,
    bergaris)+elemen (P3), validator V-01/V-06 + gerbang + endpoint
    `/drawings/analyze` diperluas dgn `metrics`/`gerbang` NYATA (P4), adapter
    PaddleOCR raster lazy/opsional + guard vektor-dulu (P6).
  - **document-intelligence: 5 → 92 test hijau** (+1 skip butuh
    `PAAX_PLHUT_PDF`), **core-engine tetap 198** (tak disentuh), **web 41**
    (tkg-workspace dikoreksi baca `metrics`/`gerbang` ASLI dari backend,
    fabrikasi `V-TKG`/`V-COV`/`V-WARN`/`V-CLS` DIHAPUS total, test regresi baru
    memastikan itu).
  - **Diverifikasi end-to-end di browser nyata** (bukan cuma unit test): upload
    PDF sintetis via UI → `/upload` → `/drawings/analyze` → panel menampilkan
    metrics/gerbang ASLI dari backend (cakupan 89.5%, V-01/V-06 lolos,
    V-07/09/10 jujur "belum dievaluasi") — lihat screenshot/network log sesi ini.
  - **Smoke test JUJUR ke PDF PLHUT asli** (bukan golden-match, `test_smoke_
    real_plhut_pdf_does_not_crash`): 15 sheet, **47 table record NYATA** +
    **40 elemen** terekstrak (dulu ~0, semua `unclassified`), cakupan awal
    iterasi ini **16,24%** — peningkatan nyata dari pipeline lama, **BUKAN**
    "GERBANG-2 selesai". Sisa gap terbesar tercatat: rekonstruksi grid dari
    geometri bubble+garis-dimensi (§3.1.1 penuh) BELUM diimplementasikan.

- **✅ SUSULAN MALAM INI: rekonstruksi grid dari GEOMETRI (§3.1.1) selesai**
  (`app/perception/vector/grid_geometry.py`). Deteksi bubble-as (lingkaran
  vektor bezier ATAU poligon-garis, filter kelompok-ukuran dominan supaya
  penanda lain yang kebetulan sejajar tak ikut tertangkap) + Run angka di
  'channel' tegak lurus arah keluarga axis, dengan slot-assignment per
  pasangan-as, offset_tepi (§3.1.1c) dikecualikan dari total, dan total
  HANYA diterima bila cocok penjumlahan bentang (toleransi 1%) — tidak pernah
  dipaksakan. **Nilai acuan diverifikasi ANALITIS manual dari geometri PDF
  PLHUT asli SEBELUM kode ditulis** (lihat investigasi sesi ini): sumbu_x
  1/2/3/4 (posisi 0/5000/7000/10000mm), sumbu_y A-F (posisi 0/4000/8000/
  12000/16000/20000mm), total_x=10000, total_y=20000, offset_tepi 1580 —
  SEMUA cocok persis hasil kode. Diuji JUGA dengan fixture sintetis independen
  berlabel/nilai berbeda (P/Q/R, 3500/2800/4000/3200) untuk membuktikan
  generalisasi, bukan hafalan (§0.1) — `test_perception_grid_geometry.py`,
  7 test baru (termasuk uji "lingkaran kecil kebetulan sejajar tidak boleh
  dianggap keluarga grid baru", ditemukan sbg bug nyata & diperbaiki via
  filter kelompok-ukuran dominan).
  **Hasil ke cakupan real PLHUT (15 sheet): 16,24% → 33,75% agregat** (hampir
  2x lipat, `span_terklasifikasi` 543/1609) — progres terukur jujur, **GERBANG-2
  MASIH BELUM TUTUP** (butuh §5 label→alamat binding + deteksi simbol grafis +
  beberapa sheet 0% karena bukan tipe denah/tak berbubble). document-intelligence
  kini **100 test hijau** (naik dari 92, termasuk smoke PLHUT yg sebelumnya skip).
  - PaddleOCR: kode adapter lengkap + teruji via MOCK (paket `paddleocr`
    SENGAJA belum di-`pip install` — berat, opsional, lazy-import; service
    tetap boot normal tanpa itu, dibuktikan test eksplisit).
- **PaddleOCR — analisis kritis (ringkas):** `G:\paax-data\PaddleOCR-main`
  (v3.7.0, Apache 2.0) API `PaddleOCR.predict()` → `rec_texts/rec_scores/
  rec_boxes` PAS jadi `TextSpan` kedua (`method="ocr"`) mengalir ke pipeline
  SAMA dgn vektor — bukan pipeline terpisah spt diusulkan konsep awal owner.
  Detail lengkap: `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §P6.1.
- **Dokumen prompt Codex Fase 2 (`docs/prompts/PAAX_CODEX_PROMPT_FASE2_*.md`)
  kini BERSTATUS HISTORIS/SUPERSEDED** — spek di dalamnya sudah diimplementasikan
  langsung oleh Claude, bukan dijalankan Codex. Jangan diserahkan ke Codex lagi.
- **BELUM DIKERJAKAN (prioritas berikutnya):** commit seluruh perubahan
  (Codex, sesuai arahan owner) — termasuk resolusi PR #27 (Fase 0, lihat
  §divergensi branch di atas); binding label↔objek↔alamat §5 (grid sekarang
  sudah ada posisi_mm nyata, jadi ini sekarang MUNGKIN dikerjakan, belum
  dimulai); deteksi simbol grafis (`count_simbol`); garis-as itu sendiri
  belum diverifikasi ulang (grid geometri bertumpu bubble+angka, bukan
  garis); V-02/03/04/05/08 (dijalankan core-engine `validate_tkg`, belum
  diuji ulang dgn TKG hasil pipeline baru — perlu verifikasi lanjutan);
  redesign visual UI (SENGAJA ditunda — akan dikerjakan pakai Opus 4.8,
  bukan sesi ini).

## Versi
**v0.9 (Schedule & Scenario "hidup")** — engine SELESAI, frontend belum dibangun.

## Selesai & ada di `main`
- v0.6–v0.8: engine RAB/HSP/Kurva-S deterministik, smart import, export Excel rumus,
  orchestrator Gemini (free tier) + fallback rule-based.
- v0.9 **engine**: CPM (`/schedule/cpm`), schedule plan (`/schedule/plan` = CPM→tanggal
  kalender + Kurva S sadar-dependency), scenario knob crew/shift/efisiensi/target
  (`/scenario/simulate` → `.custom`).
- Engineering Chat tersambung Gemini (PR #17) — masih **tipis**: belum membaca data
  RAB/jadwal proyek (baru kirim projectId + status engine).
- Test hijau: engine **99** · web **16** · schema **11**.

## ⚠️ GAP DATA — reality check (2026-07-01)
RUMUS engine benar & terverifikasi, TAPI datanya masih demo:
- Koef AHSP di repo = **DEMO** (`data/ahsp/cipta-karya.sample.json`, 4 item, ditandai "DATA ILUSTRATIF"). Data asli 2.542 item ada di luar repo (`G:\paax-data`, via env `PAAX_DATA_DIR`).
- Harga **±99% kosong** (`semarang.json` = 23 dari 2.456 resource) → HSP/RAB item nyata belum bisa dihitung benar.
- Volume/quantity **100% manual**; drawing→BoQ→RAB (v1.0) **0% dibangun**.
**Rekomendasi urutan:** ground data dulu (AHSP asli masuk sistem + isi harga 1 wilayah/1 tipe rumah sampai 1 RAB utuh + anchor test ke RAB nyata) → SEBELUM bangun baca-gambar. Detail: `Downloads/api.txt` Bagian 15.

## 🧠 Brain v4.1 (2026-07-01) — spek baru, disalin & dianalisis (2026-07-02)
Pemilik repo punya spesifikasi jauh lebih rinci di `G:\brain` (92 rumus takeoff,
model entitas Evidence/Assumption beraudit, spek TKG baca-gambar, 31 skill,
roadmap bergerbang F0–F5). Sudah disalin verbatim ke `docs/specs/brain-v4.1/`
+ dianalisis di `docs/BRAIN_ALIGNMENT.md`. **Kesimpulan kunci: brain
MENGUATKAN urutan yang sudah dikunci di sini** (ground data dulu, v1.0/CV
DITUNDA) — bukan membatalkannya. Yang berubah: ada target ekspansi baru untuk
rumus `services/core-engine/app/geometry/` (lihat EPIC D di bawah), yang aman
dikerjakan sekarang karena murni deterministik & tidak menyentuh CV/vision.

## Berikutnya (ringkas; rencana detail: lihat di bawah)
- **EPIC A — selesaikan v0.9 frontend**: A1 wiring client (Codex) → A2 Gantt UI +
  A3 panel knob (Claude) → wiring (Codex) → A4 narasi AI skenario.
- **EPIC B — Engineering Chat lintas-halaman**: B1 context pack (Codex) → B2 grounding
  → B3 UI chat global (Claude) → B4 tool-calling.
- **EPIC C — fixes**: C1 poles pembulatan 9B (`custom.subtotal`/`labor_cost` → `_r2`), dst.
- **EPIC D — ekspansi rumus takeoff (baru, dari brain v4.1)**:
  D1 ✅ volume beton F-B01–B11 (`geometry/volume.py`, 5 tipe baru) + Evidence
  schema diperkaya. D2 ✅ **sistem TKG hidup (2026-07-02)**: engine `app/tkg/`
  (models+validator V-02/04/05/08+renderer `.tkg.txt`+takeoff beton/bekisting/
  besi F-B/F-C01-C06/F-D01-D05, endpoint `/tkg/*`, 17 test anchor manual) ·
  Zod mirror TKG · route `POST /api/ai/tkg` (AI menyalin→TkgDocument, P-SEC-01)
  · UI `TkgWorkspace` di gambar-kerja (sumber→transkrip→skrip→takeoff→kirim
  volume ke draft RAB) · chat ter-grounding context pack (skrip TKG+draft RAB).
  D3 ✅ **kait + lewatan + pinggang + BBS (2026-07-02)**: F-D02 penuh (kait
  `k_hook_utama x d` per ujung; lewatan `n_lap = ceil(L_bat/l_stock)-1`,
  `lap = n_ld x d`; lewatan dibutuhkan tanpa `n_ld` -> needs_review), F-D04
  pinggang, F-D06 `waste_mode` param|bbs dgn guard AP-16 (dilarang dobel),
  F-D08 BBS (marks + kebutuhan stok + waste nyata per diameter; batang > stok
  dipecah; elemen review tidak menyumbang potongan) + mirror Zod
  (`BbsResultSchema`, param baru) — 8 test anchor manual baru (pytest 134).
  D4+E+F+G ✅ **take-off arsitektur/tanah (2026-07-02)**: paket baru
  `app/takeoff/` (params §Z: TanahParams/DindingParams/ArsitekturParams;
  models; **§F tanah** F-F01/02/03/04/05/07 galian footplat+menerus, urugan
  kembali, urugan pasir/sirtu, buangan+ritase — disiplin bank/gembur/padat
  tak dicampur; **§E finishing** F-E01/02/03/05/07 pasangan+deduksi bukaan
  (all|threshold), plester s_sisi, acian, cat n_lapis, screed; **§G subset**
  F-G01/03/05 pondasi batu belah, penutup lantai+plin, atap miring A/cosθ).
  3 endpoint `/takeoff/tanah|dinding|arsitektur` + mirror Zod + requests.http —
  13 test anchor manual baru (**pytest 147**). Data kurang → needs_review
  (bukan tebakan); faktor tanah default tercatat sebagai assumption.
  Berikutnya: D5 §Z penuh (sisa param confidence/QA), F-F06 pemadatan +
  angkut per kelas jarak, F-G04/G06-G14 (keramik dinding/baja/atap detail/
  MEP), F-C07-C10; UI tabel BBS + form takeoff manual di TkgWorkspace.
  Detail: `docs/BRAIN_ALIGNMENT.md` §4.
- **DIREVISI 2026-07-04/05 (sebelumnya "DITUNDA")**: jalur PERSEPSI VEKTOR
  (baca teks/geometri PDF asli — BUKAN vision-LLM piksel) untuk Gambar→BoQ→RAB
  ternyata TIDAK menyentuh gerbang F0 sama sekali (murni deterministik, tidak
  ada tebakan model) — owner memutuskan mengerjakannya langsung (lihat
  `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`), hasil real:
  cakupan PLHUT 0%→33,75%. Yang TETAP ditunda: vision-LLM piksel (foto/scan
  tanpa teks vektor) sbg jalur UTAMA — itu hanya fallback OCR-gagal. Site
  Agent penuh (v2.0) tetap ditunda, tidak tersentuh oleh keputusan ini.

## 🎨 UI Premium Redesign — Medium Grey Glass (2026-07-03) — terverifikasi, menunggu commit Codex
Rombak besar sesuai spek owner (`G:\Design\prompt\PAAX_PLAN_SESI_DESAIN_PREMIUM_2026-07-03.txt`):
- **Tema default Medium Grey** (#A6A6AA) + token **gold/bronze** & palet
  `--chart-1..5` dari brand sheet; light/dark tetap ada, ganti via
  Pengaturan → Personalisasi (swatch "Medium Grey").
- **Glassmorphism** (`.pax-glass` + border gradasi `.pax-glass-edge`):
  nav panel, topbar, modal, drawer, settings dialog, KPI card, dropdown chat.
- **Logo/wordmark PAAX SVG** (`components/brand/paax-logo.tsx`) — rail & panel.
- **Konsolidasi nav (nol menu ganda)**: rail hitam = File/AHSP/Laporan/
  Kolaborasi + gear + akun; panel kaca = Workspace + Modul Proyek + credits.
  `sidebar.tsx` legacy (dead code) DIHAPUS; **Uji RAB dihapus** (halaman +
  menu); `/pengaturan` → redirect + buka dialog terpusat.
- **Dashboard bisnis**: 4 KPI glass + donut status + bar progres + kolom nilai
  RAB + ring health + warning (`components/charts/dashboard-charts.tsx`,
  display-only, komentar Aturan Emas). `formatRupiahCompact` di lib/format.
- **Engineering Chat premium**: riwayat + "Project Percakapan"
  (`lib/chat/chat-history.ts`, localStorage), tombol **+** (GDrive/Gmail
  "segera" + Tambah file/foto), chip lampiran (belum dikirim ke AI — jujur),
  Thinking…/Thinking more…/Thinking almost done… berkedip (`.pax-thinking`).
- Tipografi: tabular-nums untuk semua angka; kurva S recolor token bronze.
- **Restyle drawing-intelligence-workspace.tsx**: 43 titik kelas legacy
  (glass-card/btn-*/badge-*/text-paax-*/input-field/tabel) di-port ke
  Card/Button/StatusPill + token gold; halaman /gambar-kerja-ai &
  /proyek/:id/gambar-kerja diverifikasi nol kelas legacy.
Verifikasi: tsc OK · vitest **30** · build sukses (route /rab-tester hilang) ·
uji interaktif browser (tema, dialog, chat kirim+riwayat, menu +, redirect,
halaman gambar-kerja render TKG workspace + tabel kandidat).
Prompt commit: `docs/prompts/PAAX_CODEX_PROMPT_UI_PREMIUM_REDESIGN.md`
(branch `feat/ui-premium-redesign` dari `main`, draft PR base `main`).

## 🐞 Perbaikan pasca-redesign (2026-07-03) — prompt siap, MENUNGGU Codex
Owner uji PR #26 di browser, catat 14 temuan di `Downloads/perbaikan.txt`.
Claude investigasi root cause tiap poin (bukan tebakan) + tanya-jawab
keputusan arsitektural, hasilnya 2 prompt siap jalan:
- `docs/prompts/PAAX_CODEX_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md` — **siap
  dijalankan sekarang** di branch `feat/ui-premium-redesign` (PR #26, masih
  draft): (1) fix hydration mismatch dashboard — root cause: `ProjectsProvider`
  baca `localStorage` sinkron di `useState` initializer
  (`lib/projects/projects-context.tsx:23`); (2) hapus navigasi ganda —
  tab horizontal `proyek/[projectId]/layout.tsx:92-119` duplikat sidebar kiri;
  (3) chat: label "Lainnya"→"Chat" + filter Pinned/Archived (belum ada,
  field baru di `chat-history.ts`) + diagnosis riwayat "hilang" (hipotesis:
  port dev server geser, localStorage per-origin — BUKAN bug kode
  terkonfirmasi); (4) Gambar Kerja AI: gabung 2 halaman jadi 1, TkgWorkspace
  disederhanakan (transkrip/skrip/takeoff mentah **dihapus dari UI** sesuai
  keputusan owner — user hanya lihat status ringkas + Triage + kirim ke RAB),
  upload file dibuat nyata (metadata tersimpan, BELUM dibaca AI).
- `docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` —
  **JANGAN jalankan dulu**, menunggu owner isi kotak persetujuan di dalam
  file. Bagian A (lampiran Engineering Chat beneran dibaca Gemini vision —
  aman, tak menyentuh gerbang F0) + Bagian B (opsional: vision MVP utk
  upload Gambar Kerja AI langsung jadi draft TKG — **menyentuh gerbang F0**,
  `BRAIN_ALIGNMENT.md` sudah menggerbang "TKG builder sungguhan" sbg DITUNDA
  menunggu data-grounding + Wizard-of-Oz; owner sudah dikonfirmasi paham
  tensi ini, prompt berisi kotak checklist eksplisit sebelum Codex boleh
  kerjakan Bagian B).

## 🔧 Gambar Kerja AI — upload PDF nyata ke TKG (2026-07-03, sesi lanjutan) — dikerjakan Claude, BELUM di-commit
Owner minta perbaikan langsung (bukan sekadar prompt) untuk "upload gambar kerja
langsung, AI yang membaca" (lihat `Downloads/perbaikan.txt` poin 1-2). Investigasi
menemukan `services/document-intelligence` (commit `ed6f511`, 2026-07-03 pagi,
**tidak tercatat di STATE.md/BRAIN_ALIGNMENT.md sebelumnya** — dokumen itu stale)
SUDAH punya pipeline PyMuPDF nyata (baca teks vektor PDF asli, bukan vision-LLM,
selaras brain-00 RULE-EXT-05 vektor-dulu) tapi **2 bug menghalangi**: (1) endpoint
upload tidak menyimpan file sama sekali, (2) `build_tkg_from_text` menghasilkan
JSON yang TIDAK selaras `TkgDocumentSchema` (Zod) — field `jenis`/`meta` hilang,
`grid` tidak dipecah `bentang_x`/`bentang_y`, dll. Diperbaiki:
- `upload_routes.py` beneran simpan file (dir lintas-platform via `tempfile.gettempdir()`).
- `tkg/builder.py` ditulis ulang selaras skema Zod persis (+ dukungan "GRID Y:",
  + pemetaan klasifikasi→`jenis`) — 4 test baru (pytest **9** total di service ini).
- `drawing_routes.py`: `UPLOAD_DIR` lintas-platform, kirim `classification_confidence` asli.
- Web: `lib/ai/document-intelligence-tkg.ts` (klien baru, validasi Zod sebelum dipakai)
  + `TkgWorkspace` dapat opsi "Unggah PDF gambar kerja" (alternatif, bukan pengganti,
  jalur teks tetap ada) → hasil TKG masuk pipeline validate/render/takeoff yang SAMA
  (tidak ada logika baru di core-engine).
- Bug lain ketemu & diperbaiki sekalian (di file yang sama): key React bentrok di
  daftar Triage saat >1 elemen berbagi kode+work_type+rule_id (mis. beberapa kolom
  K1) — ditambah `alamat`+index ke key.
**Diverifikasi ujung-ke-ujung** (bukan cuma tsc/vitest hijau): PDF sintetis dari
golden fixture → upload nyata → `/drawings/analyze` → `TkgDocumentSchema.safeParse`
sukses → `/tkg/validate` (gate_passed) → `/tkg/takeoff` (6 item, semua needs_review
dgn alasan jujur "tinggi kolom tidak ada") → UI browser menampilkan status+Triage
benar, 0 error konsol setelah fix key.
**JUJUR — batas nyata**: diuji juga dengan PDF gambar kerja ASLI milik owner
(`GAMBAR KERJA PLHUT SURAKARTA.pdf`) — teks hasil PyMuPDF berupa fragmen tersebar
("DENAH FOOTPLAT", "5000", "A", "PC1"...), TIDAK cocok grammar SK-07 (MVP) yang ada
sekarang (baru kenal notasi terstruktur sederhana, bukan grammar brain-00 §2-§5
penuh: leksikon prefiks, merge-run, rekonstruksi grid/tabel dari geometri). Jadi:
pipeline SEKARANG genuinely bekerja & teruji, tapi PDF proyek nyata masih akan
menghasilkan TKG hampir kosong (semua masuk `unclassified`) sampai grammar penuh
dibangun (pekerjaan terpisah, besar — bukan sesi ini).
**Belum di-commit** — sesuai instruksi owner, Claude tidak commit; Codex yang akan
commit (branch `feat/ui-premium-redesign`, sama seperti batch perbaikan sebelumnya).
File berubah: `apps/web/.env.example`, `apps/web/src/components/drawings/tkg-workspace.tsx`,
`apps/web/src/lib/ai/document-intelligence-tkg.ts` (baru),
`services/document-intelligence/app/api/{drawing_routes,upload_routes}.py`,
`services/document-intelligence/app/tkg/builder.py`,
`services/document-intelligence/tests/{test_tkg_builder.py,fixtures/golden_tkg_text_sheet.txt}`.
**Catatan untuk `PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` Bagian B**:
sebagian premisnya sudah berubah — untuk PDF vektor, jalur deterministik (non
vision-LLM) di atas sudah jalan & TIDAK menyentuh gerbang F0 sama sekali (murni
baca teks PDF, bukan tebakan model). Vision-LLM (Bagian B asli) sekarang relevan
HANYA untuk sheet raster murni (foto/scan tanpa teks vektor) — kasus yang lebih
sempit dari yang dikira sebelumnya.

## ✅ FASE 0 (0a penuh + 0b-parsial harga) SELESAI & TERVERIFIKASI (2026-07-03), prompt Codex siap
Milestone besar terverifikasi ujung-ke-ujung lewat engine ASLI (bukan replika),
**238 passed** (198 lama + 40 baru), tak ada regresi:
- **0a-1 HSP**: `compute_hsp()` reproduksi **32/32 HSP profesional** dari `ALFA.xlsx`
  sheet AHS via `(A+B+C)×(1+OP)`.
- **0a-2 RAB total**: `compute_rab()` reproduksi **grand_total Rp 1.860.078.607**
  deviasi **+0,0009%** (224 baris DKH; 79 ber-AHS dari koefisien, 145 direct).
- **0b-parsial (harga Surakarta NYATA)**: owner authorized (2026-07-03) pakai
  harga di ALFA.xlsx (HARGA BAHAN/DKH/HSP) sbg HSD Surakarta sistem. Dibangun
  `data/harga-satuan/surakarta.json` (112 resource, price book UMUM regional —
  sah per §0.1, bukan fixture). Engine + price book ini mereproduksi RAB PLHUT
  **Rp 1.885.558.837 vs Rp 1.860.078.608 = +1,37%** (dalam ±10%); deviasi
  seluruhnya dari **5 inkonsistensi harga internal ALFA sendiri** (tercatat di
  `alfa_price_conflicts`, auditable RULE-HRG-02). Coverage 100% resource PLHUT.
Fixture + 3 generator + README + 3 test dibuat Claude di `services/core-engine/
tests/{fixtures/plhut/, test_plhut_hsp_golden.py, test_plhut_rab_golden.py,
test_plhut_surakarta_pricebook.py}` + `data/harga-satuan/surakarta.json`.
**Temuan penting**: (a) kode resource ALFA TIDAK andal (M.504 = 2 material beda)
→ fixture PLHUT kunci resource lokal per-analisa; (b) ada file Surakarta SERUPA
di luar repo (`G:\paax-data`, 109 resource, sesi sebelumnya) dgn penomoran kode
BEDA — tak aktif bug (loader pilih satu via env `PAAX_DATA_DIR`) tapi belum
direkonsiliasi, dicatat di gap doc. Prinsip §0.1 dipatuhi penuh. Prompt commit:
`docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md` (branch
`feat/fase0-plhut-golden-anchor` dari main; Codex commit, belum di-commit).

## ⚠️ Sisa GERBANG-0b penuh: pemetaan ke katalog AHSP RESMI (2.542 item) — butuh owner
Harga BUKAN lagi penghalang untuk lingkup PLHUT/Surakarta. Sisa: mengikat 112
resource Surakarta + 224 item DKH ke KODE RESMI katalog (`G:\paax-data`, sudah
format engine). Cek nama-persis: baru 21/112 match (kategori upah masuk akal —
kode resmi memang generik per-profesi; kategori bahan perlu pencocokan semantik
SK-19). Brain RULE-AHSP-01 mewajibkan konfirmasi manusia utk kasus ambigu — TIDAK
diotomatisasi diam-diam. Detail + rekomendasi: `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`.
Tidak memblokir Fase 1 (workspace) / Fase 2 (persepsi) — bisa paralel.

## 🗺️ Roadmap "Gambar → RAB benar" (2026-07-03) — analisis mendalam brain, keputusan owner: Fase 0 dulu
Owner minta rencana lengkap sampai gambar nyata → RAB benar sesuai brain.
Claude baca 4 berkas brain penuh + audit repo. Hasil: `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`.
**Temuan inti**: 3 "setengah" sistem beda kematangan — Engine hitung ~70%
(jalan KALAU TKG benar), Data grounding ~40% (AHSP asli 2.542 item ada di
`G:\paax-data` tapi belum tersambung; harga ~4%), Persepsi baca gambar ~20%
(PyMuPDF jalan tapi grammar belum kenal notasi gambar nyata → PDF asli jadi
`unclassified`). Golden anchor `test_plhut_golden.py` = TKG PLHUT **transkrip
TANGAN** (manusia persepsi, engine hitung benar) — membuktikan separuh keras
sudah benar. **Urutan brain (data dulu, baru mata, TXT03 §7/AP-09)**:
FASE 0 tutup GERBANG-0 di PLHUT (data+engine, manusia transkrip → RAB penuh
berharga vs `ALFA.xlsx` manual owner) → FASE 2 tutup GERBANG-2 (persepsi
otomatis = golden transkrip-tangan) → FASE 3-4 tutup GERBANG-4 (gambar nyata →
RAB auditable). Owner PUNYA materi anchor lengkap: PLHUT PDF + RAB manual
`ALFA.xlsx`+`MC 00.xlsx`. **Butuh keputusan owner** (4 hal, lihat §5 dokumen):
setuju urutan Fase 0 dulu? ambang deviasi (usul ±10%)? bantu baca ALFA.xlsx?
konfirm PLHUT proyek golden? Baru lalu Claude pecah Fase 0 jadi prompt Codex 0A–0D.

## Pembagian peran (2026-06-29)
- **Claude** = planning + semua spek/prompt + **UI frontend** + review.
- **Codex** = penyambungan teknis (lib/engine, fetch, state, route AI, backend, engine).

## Git
- Branch utama: `main`. Open PR: **#20 (draft — sistem TKG, branch
  `docs/brain-v4.1-alignment`)**; menyusul PR UI overhaul (stacked di atas #20).
- PR terakhir merged: #19 (dashboard navigation performance).

## Rencana detail (di luar repo)
- Master plan + prompt Codex (A1, B1): file `PAAX_MASTER_PLAN_*` & `PAAX_CODEX_PROMPT_*`
  di folder Downloads owner.
- Konteks lintas-sesi: memory Claude (`MEMORY.md`).
