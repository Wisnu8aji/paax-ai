# PAAX — Rencana Besar: Dari "OCR Viewer" ke "AI Estimator" (Gambar → RAB) (2026-07-13)

> Ditulis Claude, 2026-07-13, atas instruksi owner (`docs/ai-map/prompt claude.txt`,
> file itu SENGAJA dibiarkan sbg arsip instruksi asli — jangan dihapus tanpa
> tanya). Ini **melanjutkan & menggantikan arah lanjutan** dari
> `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md` (Fase 0-S sudah
> selesai di dokumen itu — JANGAN dikerjakan ulang). Living roadmap — update
> status di sini, jangan tulis ulang dari nol.

---

## 0. Kenapa dokumen ini ada

Owner memberi kritik mendalam (bukan cuma "kurang bagus" — dengan **bukti
nyata** dari screenshot aplikasi berjalan di `G:\gambar contoh\*.png`, hasil
upload `GAMBAR KERJA PLHUT SURAKARTA (1).pdf` ke halaman Analisa Gambar Kerja
proyek uji "Gedung 3 lantai"). Saya cek isi screenshot itu langsung (bukan
cuma baca deskripsi owner) dan menemukan **bukti konkret** yang mengonfirmasi
tiap keluhan:

1. **Klasifikasi halaman gagal untuk banyak sheet**: "Sheet 1: Belum
   diketahui", "Sheet 2: Belum diketahui · Skala NTS", "Sheet 3: Belum
   diketahui". Root cause (dicek ke kode): `zone_classifier.py` HANYA kenal
   prefix judul `DENAH/TABEL/DETAIL/POTONGAN/TAMPAK` + keyword struktur
   (FOOTPLAT/PONDASI/ATAP/LT.n) — sheet cover, daftar gambar, situasi, dll
   TIDAK punya kategori sama sekali, jatuh `None` lalu tampil "Belum
   diketahui" mentah ke user.
2. **Grid & Elemen per Zona menampilkan data mentah yang tidak actionable**:
   chip "dekat A2 (perlu verifikasi): P1", "13: F2", "grid tidak tersedia di
   sheet ini: RB3", dll — istilah internal pipeline, bukan bahasa BOQ/RAB.
3. **"PERLU DICEK" meledak jadi 4281 item**, dan ini BUKAN cuma soal jumlah —
   dicek isinya, sebagian besar adalah **noise dari 2 bug nyata**:
   - `consolidate.py::_grid_conflicts` (baris 44-65) membandingkan
     `posisi_mm` ABSOLUT antar sheet (bug SAMA PERSIS dengan V-03 core-engine
     yang sudah diperbaiki Fase M-2 — tapi versi document-intelligence ini
     TIDAK IKUT diperbaiki, luput). Karena tiap halaman PDF merekonstruksi
     grid dgn origin sendiri (`grid_geometry.py`), 1 axis nyata yang sama
     ("as 4") bisa menghasilkan puluhan Assumption "tinggi" berulang — bukti
     nyata di screenshot: *"Grid as '4' beda posisi antara sheet 6 (0mm) dan
     sheet 39/40/41/42/…/47 (10000mm)"* — 9+ baris nyaris identik untuk SATU
     axis yang sama.
   - `consolidate.py` baris 108-112: SEMUA teks yang tidak cocok grammar
     kode/level/grid otomatis masuk `Assumption` "perlu dicek", TANPA filter
     — termasuk teks kop administratif ("KEMENTRIAN AGAMA RI", "DIREKTORAT
     JENDERAL", "TAHUN ANGGARAN 2024", "SKALA GBR", "NO. GBR") yang berulang
     di HAMPIR SETIAP halaman. Ini metadata proyek, bukan masalah teknis.
4. **Alur kerja 2 langkah** (Analisa Gambar Kerja → baru nanti "Generate
   RAB"/halaman RAB terpisah) tidak sesuai visi owner: 1 tombol, 1 alur,
   hasil akhir = tabel RAB siap pakai.

**Kesimpulan jujur:** keluhan owner BUKAN "AI belum pintar" secara abstrak —
ada bug konkret yang bikin noise meledak (grid conflict absolut + filter
teks nol), DAN ada gap desain nyata (cakupan page-type sempit, tidak ada
lapisan structuring BOQ, takeoff formula cuma cover beton/bekisting/besi
struktural). Rencana ini menangani keduanya, berurutan dari yang paling
murah-tapi-berdampak ke yang paling besar.

## 0.1 Batasan yang TIDAK BERUBAH (Aturan Emas, CLAUDE.md §1)

Ini bagian PALING PENTING dari dokumen ini karena permintaan owner
("AI harus menalar", "AI harus berpikir seperti estimator", "AI boleh buat
asumsi wajar") **bisa disalahartikan** jadi "AI menghitung angka RAB" kalau
tidak dijaga ketat. Interpretasi yang BENAR & dipakai di seluruh rencana ini:

- **AI/reasoning BOLEH**: mengklasifikasi jenis halaman (cover/denah/detail/
  dst), menghubungkan elemen di denah ke definisi di tabel/detail (cross-page
  linking), mengelompokkan elemen jadi item pekerjaan (work item grouping),
  menyaring mana yang layak jadi "perlu dicek" vs metadata, MENGUSULKAN kode
  AHSP (sudah ada, token-overlap deterministik). Semua ini = STRUKTURISASI,
  bukan aritmetika.
- **AI/reasoning TIDAK PERNAH**: menghitung volume/mandays/HSP/subtotal RAB
  sendiri. Volume tetap wajib lewat rumus `services/core-engine` (§5
  CLAUDE.md, `app/tkg/takeoff.py`). Kalau suatu jenis pekerjaan BELUM punya
  rumus takeoff (mis. pekerjaan tanah, dinding, sanitasi — lihat Fase X), AI
  **TIDAK BOLEH mengarang angkanya** — item itu masuk daftar "belum bisa
  dihitung otomatis, perlu input manual", bukan diberi angka tebakan.
- **Asumsi teknis boleh (owner eksplisit mengizinkan)**, TAPI wajib: (a)
  tertaut ke `Assumption`/`needs_review` yang terlihat user, (b) tidak pernah
  disamakan dgn nilai pasti di tabel RAB akhir, (c) bisa diverifikasi/diubah
  user. Ini best-effort, bukan longgar.
- **Confidence AI (LLM) untuk klasifikasi halaman** (Fase V) kalau dipakai:
  HANYA sbg fallback saat rule-based gagal, output dibatasi ke enum tertutup
  (bukan teks bebas), selalu ditandai `assumption` kalau dipakai, dan tetap
  tidak pernah menyentuh angka.

## 0.2 §0.1 lama (fixture bukan template) tetap berlaku

PLHUT + `G:\gambar contoh` screenshot = bukti bug & bahan uji, BUKAN sumber
kebenaran logika. Setiap perbaikan di rencana ini WAJIB lolos fixture
sintetis independen sebelum dianggap selesai (pola yg sama dipakai sepanjang
proyek ini).

---

## 1. Peta fase (U seterusnya — Fase 0-S di plan lama SUDAH selesai)

| Fase | Isi | Status |
|---|---|---|
| U | Perbaiki noise konsolidasi: grid-conflict relatif+dedupe, filter teks metadata administratif | 🟢 selesai — verifikasi PDF nyata: 0 "tinggi" severity (dari puluhan berulang), 85/88 sheet terklasifikasi |
| U-2 | Tutup gap page-type classifier (cover/daftar-gambar/situasi/tampak/potongan generik) | 🟢 selesai — kategori baru terpakai nyata di PDF 88-halaman |
| T | AHSP auto-suggest (spek sudah ada: `docs/prompts/PAAX_CODEX_PROMPT_FASE_T_AHSP_AUTO_SUGGEST_2026-07-12.md`) | 🟢 selesai — aktif utk sebagian bekisting (margin terverifikasi), beton/besi sengaja tidak (ambigu nyata, lihat `docs/ai-map/STATE.md` Fase T) |
| V | Reasoning lintas-halaman lanjutan: linking elemen→detail yang lebih toleran (variasi penulisan kode), fallback klasifikasi halaman via LLM terbatas (opsional, hanya kalau rule-based gagal) | ⚪ belum mulai |
| W | Lapisan "Item Pekerjaan" (BOQ grouping): ubah `TakeoffItem`+registry jadi baris pekerjaan berkategori (persiapan/tanah/pondasi/sloof/kolom/balok/pelat/dinding/lantai/plafon/atap/sanitasi/drainase/finishing) — bagian yg SUDAH ada rumus (beton/bekisting/besi) dipetakan langsung, bagian yg BELUM ada rumus ditandai jujur "perlu rumus baru" | ⚪ belum mulai |
| X | **KOREKSI 2026-07-13 (lihat catatan di bawah §4)**: rumus tanah/dinding/ arsitektur/baja SUDAH ADA di `app/takeoff/*` (Fase 3b, `docs/BRAIN_ALIGNMENT.md`) — gap sebenarnya adalah BRIDGING dari TKG/konsolidasi ke input model-model itu, bukan menulis rumus dari nol. Sisa gap rumus murni jauh lebih kecil dari perkiraan awal (F-F06, F-G04/G06-G14, F-C07-C10) | 🟢 X1 (bridging galian footplat) selesai — lihat §4a |
| X1B | Perbaikan arsitektur packaging `paax_schemas` (installable, bukan fallback `sys.path.insert`) + investigasi kenapa dimensi footplat PLHUT tidak sampai ke `TypeRecord.dimensi` | 🟢 selesai (2026-07-05, PR #38) — lihat §4a |
| X2 | Lapisan AI-assist klasifikasi/binding — LLM fallback paralel (bukan pengganti) utk `zone_classifier.py`/`consolidate.py` saat rule-based gagal, dipicu bukti nyata X1B (13/13 `pondasi_telapak` PLHUT `perlu_review` krn dimensi hanya di halaman detail/grafis). Detail penuh: §X2 di bawah. | 🟢 slice #1 (dimensi footplat) + slice #2 (zona sheet) SELESAI diimplementasikan langsung oleh Claude 2026-07-05 (owner mengubah rencana dari "tulis prompt Codex" jadi "kerjakan langsung"), **belum di-commit**. `binding.py` (label→grid) belum jadi slice terpisah. |
| Y | Alur 1-tombol: rename "Analisa Gambar Kerja" → "Analisa RAB dari Gambar Kerja", wiring penuh upload→perception→konsolidasi→BOQ→takeoff→AHSP-suggest→isi halaman RAB otomatis; panel data mentah (grid/elemen/OCR) dipindah ke "mode developer" (toggle, bukan dihapus dari kode); halaman RAB tetap bisa diedit manual | ⚪ belum mulai — lihat catatan interaksi dgn X2 di §X2.4 |
| Z | Verifikasi ulang PLHUT (1).pdf yg sama dgn screenshot bukti, ukur noise 4281→berapa, update STATE.md | ⚪ belum mulai |

Legenda: 🟢 selesai · 🟡 sebagian · ⚪ belum mulai.

### 1a. Fase X1/X1B — ringkasan (detail penuh: `docs/ai-map/STATE.md`)

- **X1 (prompt 2026-07-15, eksekusi 2026-07-05, PR #37)**: WBS & taksonomi
  kategori TKG dipindah ke `packages/schemas/python/paax_schemas` (shared,
  bukan lagi di-load lewat filesystem/importlib lintas-service). Modul baru
  `bridging_tanah.py` membentuk `GalianFootplat` dari `ElementRegistryEntry`
  lalu memanggil `core-engine /takeoff/tanah` — TIDAK ada hitung volume
  manual di document-intelligence. Smoke PLHUT 88 halaman: 13 elemen
  `pondasi_telapak` dikenali, **0 dihitung, 13 perlu_review** — alasan
  seragam: "dimensi footplat tidak lengkap di gambar: b, l".
- **X1B (prompt 2026-07-16, eksekusi 2026-07-05, PR #38)**: (a) packaging
  `paax_schemas` diperbaiki jadi pip package installable
  (`packages/schemas/python/pyproject.toml`), fallback `sys.path.insert`/
  `except ModuleNotFoundError` dihapus dari source core-engine &
  document-intelligence, CI+README mengikuti. (b) Investigasi mendalam kenapa
  X1 gagal 13/13: halaman 49 PLHUT memang punya kode (`PC 1`, `PC 2`, `PC 3`)
  dan angka (`1500`, `1300`, dst.) tetapi dalam bentuk **detail/grafis**
  (`page.find_tables()` hanya menangkap fragmen tak berstruktur), BUKAN tabel
  kode-dimensi yang bisa diparse `page.find_tables()`. Kesimpulan jujur:
  bukan bug alias field (`bridging_tanah.py` sudah cari `b/b_ft/lebar/
  lebar_bawah` & `l/l_ft/panjang/panjang_bawah`), tapi gap ekstraksi
  detail/grafis. Tidak ada perbaikan dipaksakan — status `perlu_review`
  tetap jujur. **Diverifikasi ulang di sesi ini (Claude, 2026-07-05)**:
  klaim packaging & investigasi cocok dgn kondisi kode nyata (`git show
  6f355a7`, grep `sys.path.insert`/`except ModuleNotFoundError` di source
  target = kosong, `bridging_tanah.py` baris 91-92 memang mencari alias yang
  diklaim).

---

**KOREKSI PENTING (ditemukan saat mulai Fase T, 2026-07-13):** perkiraan
awal saya soal Fase X SALAH — saya belum cek `services/core-engine/app/
takeoff/` sebelum menulis rencana ini. Faktanya, `docs/BRAIN_ALIGNMENT.md`
§4 Fase 3b (2026-07-02) SUDAH mengimplementasi rumus deterministik utk
**tanah (F-F01/02/03/04/05/07), dinding/finishing (F-E01/02/03/05/07),
arsitektur (F-G01/03/05), besi/BBS penuh (F-D01-08)** — endpoint
`/takeoff/tanah`, `/takeoff/dinding`, `/takeoff/arsitektur` sudah ada &
teruji (13 anchor manual). Gap SEBENARNYA bukan "tulis rumus dari nol",
tapi **BRIDGING**: modul `app/takeoff/*` menerima input geometrik EKSPLISIT
(mis. `GalianFootplat{b_ft, l_ft, ...}`), BUKAN `TkgDocument` — belum ada
yang menyuplai nilai itu otomatis dari hasil konsolidasi gambar. Sisa gap
rumus MURNI (belum ada implementasi sama sekali) jauh lebih kecil: F-F06
(pemadatan+angkut jarak), F-G04/G06-G14 (keramik dinding/baja profil/atap
detail/kusen/MEP/waterproofing/railing), F-C07-C10 (dinding beton/tangga/
perancah). Fase X di rencana ini DIREVISI jadi 2 sub-fase: **X-1 (bridging,
lebih besar tapi tidak "dari nol")** dan **X-2 (isi gap rumus murni yang
tersisa, jauh lebih kecil dari perkiraan awal)** — detail ditulis saat Fase
W selesai dan gap konkretnya terlihat.

---

## 2. Detail Fase U — Perbaikan noise (dikerjakan sesi ini)

### U.1 `_grid_conflicts` — posisi relatif, bukan absolut
Root cause sama seperti V-03 lama (`services/core-engine/app/tkg/
validate.py::_cek_v03`, diperbaiki Fase M-2 via perbandingan jarak relatif
ke anchor label bersama). `consolidate.py` versi document-intelligence
punya bug identik dan TIDAK ikut diperbaiki waktu itu (beda service, luput).
Perbaikan: pakai pola yang sama — pilih anchor label bersama per pasangan
sheet, bandingkan jarak relatif, bukan `posisi_mm` mentah.

### U.2 Dedupe & ringkas per axis
Alih-alih 1 Assumption per (axis, sheet) — kalau axis yang sama konflik di
BANYAK sheet terhadap kanonik, gabung jadi SATU Assumption per axis yang
merangkum daftar sheet bermasalah (mis. "Grid as '4' beda posisi relatif di
9 sheet: 39,40,41,...,47 vs kanonik sheet 6"). Mengurangi noise tanpa
menyembunyikan informasi (daftar sheet tetap ada, cuma tidak diulang per
baris).

### U.3 Filter teks metadata administratif
Tambah heuristik (rule-based, bukan LLM) utk teks yg SECARA STRUKTURAL
adalah kop/header administratif proyek, bukan konten teknis gambar:
- Pola label kop gambar generik: `JUDUL PROYEK`, `NO. GBR`, `SKALA GBR`,
  `KODE GBR`, `TANGGAL`, `DIGAMBAR`, `DIPERIKSA`, `DISETUJUI`, `PARAF`.
- Nama instansi/kop pemerintah yang muncul BERULANG identik di banyak
  sheet (heuristik frekuensi: teks yang sama persis muncul di ≥N sheet
  DENGAN posisi mirip → kop halaman, bukan elemen unik per halaman).
- Teks ini TIDAK dibuang dari data (tetap tersimpan di `SheetMeta`/raw utk
  audit/debug), HANYA tidak lagi masuk daftar `assumptions`/"perlu dicek".
- **Batasan jujur**: heuristik frekuensi BUKAN pengenalan universal —
  dokumen dgn kop administratif yang HANYA muncul 1x tetap bisa lolos filter
  (dicatat sbg limitasi, bukan disembunyikan).

### U.4 Test wajib
- Fixture sintetis: 3 sheet dgn axis sama posisi berbeda origin (pola sama
  seperti reproduksi V-03 M-2) → assert TIDAK ada E-GRID/assumption palsu
  utk subset yg sah, TAPI konflik nyata tetap 1 assumption ringkas (bukan
  hilang total).
- Fixture sintetis kop administratif berulang (10 sheet, 1 teks kop sama +
  1 teks unik per sheet) → assert kop tidak masuk assumptions, teks unik
  tetap masuk.
- Smoke PLHUT existing (fixture repo, BUKAN PDF asli 25MB di Downloads) →
  assert jumlah assumptions turun dibanding sebelum fix, dan tidak ada
  regresi elemen registry.

---

## 3. Detail Fase U-2 — Gap page-type classifier

`zone_classifier.py::classify_zone` mengembalikan `None` kalau judul tidak
match prefix `DENAH/TABEL/DETAIL/POTONGAN/TAMPAK` ATAU tidak match keyword
struktur. Ini bikin sheet non-struktur (cover, daftar gambar, situasi/
site-plan) selalu "Belum diketahui".

Tambahan kategori (rule-based, keyword umum Indonesia — BUKAN spesifik
PLHUT, konsisten §0.1):
- `cover` — indikator: sheet pertama TANPA prefix DENAH/TABEL/dst, biasanya
  dominan judul proyek + logo/instansi (heuristik: sheet index rendah +
  banyak teks admin yg baru difilter Fase U.3 + tidak ada grid/elemen sama
  sekali).
- `daftar_gambar` — keyword: "DAFTAR GAMBAR", "DAFTAR ISI GAMBAR", "INDEX
  GAMBAR".
- `situasi` — keyword: "SITUASI", "SITE PLAN", "LOKASI".
- `tampak` — prefix `TAMPAK` sudah dikenali `_TITLE_PREFIX` tapi belum
  punya zone sendiri (jatuh ke `detail_tabel` krn tidak match `_ZONE_RULES`
  manapun) → tambah entry eksplisit `tampak`.
- `potongan` — sama kasusnya dgn `tampak`, tambah entry eksplisit.
- Sisa yang benar-benar tidak match apa pun (nama tidak umum) tetap jujur
  `None`/"belum diketahui" — TIDAK dipaksakan, ini prinsip §0.1.

### Test wajib
Fixture sintetis per kategori baru (judul beda dari PLHUT) + smoke PLHUT
(assert sheet yg sebelumnya `None` karena TAMPAK/POTONGAN sekarang
terklasifikasi, assert cover-like sheet di fixture sintetis baru juga benar).

---

## 4. Fase T, V, W, X, Y, Z — ringkasan arah (detail lengkap ditulis saat
fase itu mulai dikerjakan, supaya tidak jadi dokumen basi kalau desain
berubah setelah lihat hasil Fase U)

- **Fase T** — jalankan spek yang SUDAH lengkap (`PAAX_CODEX_PROMPT_FASE_T_
  AHSP_AUTO_SUGGEST_2026-07-12.md`), dieksekusi LANGSUNG oleh Claude
  (bukan Codex, konsisten mode sesi ini), tanpa mengubah spek intinya.
- **Fase V** — perluas `consolidate.py` type-record binding: saat ini
  binding registry per `kode` sudah ADA (baris 82-106) tapi PERSIS
  string-match; owner minta toleransi variasi penulisan (K1 vs K-1 vs
  "KOLOM K1") — perlu normalisasi kode (deterministik, regex, bukan LLM)
  sebelum dianggap "reasoning lintas halaman" yang lebih baik. Fallback
  LLM utk klasifikasi halaman HANYA dipertimbangkan di sini kalau rule-based
  Fase U-2 terbukti tidak cukup general (perlu data lebih dulu).
- **Fase W** — modul baru (mis. `app/perception/work_items.py`) yang
  mengelompokkan `ElementRegistryEntry` + `TakeoffItem` (dari core-engine,
  dipanggil via API yang sudah ada) jadi baris "item pekerjaan" berkategori
  trade. Kategori yang BELUM ada rumus (Fase X belum jalan) ditandai eksplisit
  `formula_status: "belum_didukung"` — TIDAK diberi volume palsu.
- **Fase X** — ekspansi rumus per trade, satu vertical slice per trade,
  masing-masing: (1) baca spek `docs/specs/brain-v4.1/` kalau ada, (2) tulis
  anchor manual, (3) implementasi di `core-engine`, (4) test, (5) baru pindah
  trade berikutnya. Urutan prioritas diusulkan: dinding → lantai/finishing →
  atap (non-struktur, mis. penutup genteng/talang) → plafon → pekerjaan
  tanah → sanitasi → drainase (urutan berdasar seberapa sering muncul di
  RAB gedung + seberapa jelas rumusnya dari AHSP CK 2026 yang sudah ada).
- **Fase Y** — UI: satu tombol "Analisa RAB dari Gambar Kerja", hasil akhir
  = tabel RAB (kolom: item pekerjaan, kategori, sumber halaman, dasar
  pembacaan, satuan, volume, rumus volume, asumsi, kode AHSP, harga satuan,
  total, confidence, status verifikasi). Data mentah (grid/OCR/elemen chip)
  dipindah ke toggle "mode developer" (tetap ada di kode, disembunyikan
  default). **Sebelum menghapus tombol "Susun dengan AI"/"Hitung RAB" di
  halaman RAB**, WAJIB cek dulu kode halaman itu — kalau dipakai juga utk
  alur RAB manual (tanpa gambar), tombol itu TETAP ADA sbg jalur terpisah
  (owner eksplisit: "fitur hitung RAB manual bisa dibuat sebagai halaman
  terpisah") — jangan hapus fungsionalitas yang masih dibutuhkan.
- **Fase Z** — jalankan ulang PDF yang SAMA dgn bukti screenshot owner
  (`GAMBAR KERJA PLHUT SURAKARTA (1).pdf` di Downloads, 24.6MB) lewat
  pipeline yang sudah diperbaiki, laporkan angka noise sebelum/sesudah
  (4281 → ?) secara jujur, update `docs/ai-map/STATE.md`.

---

## X2. Fase X2 — Lapisan AI-Assist Klasifikasi & Binding (ditulis 2026-07-05)

### X2.0 Kenapa fase ini ada

Fase X1/X1B (di atas) membuktikan dgn DATA NYATA (bukan dugaan) bahwa
rule-based murni punya batas keras: PDF PLHUT asli (88 halaman) menghasilkan
**13/13 (100%)** elemen `pondasi_telapak` jatuh `perlu_review` karena
dimensinya (`b`, `l`, `d_gali`) hanya ada di halaman detail/grafis (mis.
halaman 49: kode `PC 1/2/3` + angka `1500/1300/...` berserakan sbg span teks
lepas, BUKAN tabel kode-dimensi yang bisa diparse `page.find_tables()`).
Angka ini jauh di atas ambang 30-40% yang dipakai sbg sinyal keputusan (lihat
diskusi owner-Claude 2026-07-05): ini alasan kuat utk memprioritaskan
lapisan AI-assist berbasis-teks INI lebih dulu, sebelum menaikkan investasi
ke Vision-LLM piksel penuh (v1.0, masih ditunda) yang risikonya jauh lebih
tinggi (akurasi ~60% baca dimensi dari piksel).

### X2.1 Prinsip desain (WAJIB, mengunci Aturan Emas — lihat `CLAUDE.md` §1.1)

1. **Regex/rule-based tetap fast-path utama** — cepat, gratis, deterministik,
   sudah teruji (`zone_classifier.py`, `binding.py`, `consolidate.py`,
   `bridging_tanah.py`). LLM TIDAK PERNAH menggantikan jalur ini.
2. **LLM hanya dipanggil untuk kasus yang SUDAH gagal/ambigu di rule-based**
   (hasilnya `perlu_review` atau `belum_didukung`). Ini murni fallback, bukan
   jalur paralel yang selalu jalan.
3. **LLM membaca DATA YANG SUDAH DIEKSTRAK** — span teks + koordinat/bbox
   presisi dari PyMuPDF (sudah ada di pipeline P1-P3) — BUKAN piksel gambar
   mentah. Ini beda mendasar dari Vision-LLM v1.0 yang masih ditunda:
   akurasi vision-on-pixel utk dimensi gambar teknik ~60% (`MASTER_PLAN.md`
   §6.1), sedangkan data vektor PDF yang sudah diekstrak sudah EKSAK — LLM
   hanya diminta menyusun/menghubungkan, bukan membaca ulang gambar.
4. **Validasi silang deterministik wajib** sebelum usulan LLM jadi kandidat:
   - Setiap angka yang diusulkan HARUS benar-benar muncul di span yang
     diekstrak pada halaman itu (cek string match ke data mentah) — kalau
     LLM "mengarang" angka yang tak ada di span, usulan itu DIBUANG.
   - Setiap kode/grid yang diusulkan HARUS ada di `element_registry` yang
     sudah dikonsolidasi — tidak boleh kode baru yang tak pernah terdeteksi.
   - Nilai harus masuk rentang wajar (mis. dimensi footplat mm, bukan angka
     administratif seperti nomor halaman/tahun anggaran yang ikut ternocap
     span).
5. **Tidak ada auto-commit ke input engine.** Usulan yang lolos validasi
   tetap berstatus `perlu_review` (pola yang SUDAH ada di `work_items.py`),
   dilengkapi field baru `ai_suggestion` (nilai + `confidence` + `reason` +
   model + timestamp). Hanya setelah manusia approve, nilai itu boleh dipakai
   sbg input `GalianFootplat`/model takeoff lain di `core-engine`.
6. **Audit trail wajib** — tiap keputusan berbasis-AI dicatat lengkap (model,
   prompt version, input span yang dipakai, output, reasoning) karena LLM
   bisa bervariasi antar run dan RAB harus tetap auditable. Pakai temperature
   rendah utk minimalkan varian; TIDAK diklaim deterministik.
7. **Biaya & latency dipikirkan dari awal** — panggilan LLM per
   halaman/elemen tidak gratis di skala produksi. Cache hasil per
   dokumen+halaman (jangan panggil ulang dokumen yang sama), dan ukur biaya
   nyata sebelum memutuskan skala penuh (selaras `MASTER_PLAN.md` §12-14).

### X2.2 Slice pertama (vertical slice sempit, BUKAN rewrite besar)

Scope sengaja SEMPIT — hanya menutup satu kasus konkret yang sudah
dibuktikan gagal, generalisasi ke `zone_classifier`/`binding`/`consolidate`
lain menyusul di slice berikutnya setelah pola ini terbukti aman:

- Target: elemen `pondasi_telapak` (atau kategori takeoff lain yang butuh
  bridging serupa) yang keluar `perlu_review` dari `bridging_tanah.py` karena
  `dimensi` kosong/tidak lengkap, DAN halaman sumbernya terklasifikasi
  `detail_tabel` (sudah ada dari `zone_classifier.py`).
- Modul baru yang diusulkan: `services/document-intelligence/app/
  perception/ai_assist/` — client LLM (pola sama dgn
  `apps/web/src/lib/ai/orchestrator.ts`: `GEMINI_API_KEY` yang SUDAH ada di
  `.env.example`, structured JSON response schema, temperature rendah) +
  fungsi validasi deterministik (poin X2.1.4) + logging keputusan.
- **WAJIB fixture sintetis independen** (bukan PLHUT hardcoded, konsisten
  §0.1/§0.2) dgn kode & angka BERBEDA dari PLHUT, utk membuktikan
  generalisasi bukan hafalan.
- **WAJIB stub/mock client di test** — test unit TIDAK memanggil API Gemini
  sungguhan (deterministik, gratis, cepat). Integrasi nyata (opsional,
  di belakang `GEMINI_API_KEY` ada/tidak) diverifikasi terpisah, pola sama
  dgn PaddleOCR (`ocr` extra, degradasi anggun kalau dependency/key tak ada).
- Detail teknis & kriteria terima lengkap: lihat prompt Codex
  `docs/prompts/PAAX_CODEX_PROMPT_FASE_X2_AI_ASSIST_KLASIFIKASI_BINDING_2026-07-05.md`.

### X2.3 Keputusan arsitektur yang perlu diperhatikan

- **Kenapa Python (document-intelligence), bukan Node (ai-orchestrator)?**
  `CLAUDE.md` §3 Lapis 2A (Persepsi) SUDAH mencantumkan "Vision-LLM" sbg
  teknologi yang sah di lapis ini. Memanggil LLM langsung dari
  document-intelligence (Python) lebih dekat ke data (span+koordinat sudah
  ada di proses yang sama, tidak perlu round-trip HTTP tambahan ke Node).
  Ini BEDA dari klasifikasi AHSP (Tahap 3 pipeline, `MASTER_PLAN.md` §6.2)
  yang tetap di Lapis 1 (Orkestrasi/TS) krn itu domain RAG+tool-calling.
- **Update hasil implementasi (2026-07-05)**: TIDAK ada dependency Python
  baru ditambahkan. `ai_assist/client.py` pakai REST call manual via stdlib
  `urllib.request` (pola sama `bridging_tanah.py::HttpTanahTakeoffClient`),
  bukan SDK `google-genai` — pilihan ini menghindari dependency baru sama
  sekali, konsisten `CLAUDE.md` §2.

### X2.3a Perbandingan provider AI (Gemini vs alternatif) — 2026-07-05

Ditambahkan sbg dokumentasi referensi (owner meminta pencatatan opsi,
**BUKAN mengganti keputusan/implementasi** — `GeminiAiAssistClient` TETAP
default aktif di `ai_assist/client.py`). Tabel ini relevan spesifik utk
lapisan AI-assist X2 (yang HANYA butuh baca/reasoning TEKS, bukan
vision/piksel — lihat `CLAUDE.md` §1.1), jadi kriteria "harus multimodal"
tidak berlaku mutlak seperti pada Tahap 1-2 pipeline gambar (§6.1
`MASTER_PLAN.md`, vision-LLM ~60% akurat dimensi, tetap dihindari).

| Provider / Model | Tipe | Harga (indikatif, wajib dikalibrasi ulang) | Context window | Kekuatan | Kelemahan | Akses |
|---|---|---|---|---|---|---|
| **Gemini 2.5 Flash** (dipakai sekarang, default) | Cloud-only, tertutup (Google tidak rilis weight) | Gratis perpetual di AI Studio (1500 request/hari); tarif per-token berlaku di luar kuota gratis / lewat Vertex AI | 1M token | Multimodal/vision native (berguna kalau X2 diperluas ke halaman raster/scan nanti), konteks besar, kuota gratis tinggi, SUDAH terintegrasi (`GEMINI_API_KEY` yang sama dipakai `apps/web/src/lib/ai/orchestrator.ts`) | Tertutup — tidak bisa di-audit/self-host; biaya per-token naik signifikan di luar kuota gratis pada skala produksi | REST API resmi Google (`generativelanguage.googleapis.com`), sudah dipakai `GeminiAiAssistClient` |
| **DeepSeek** (V4 Flash / R1) | Open-weight (MoE 284B, 13B aktif) — bisa self-host ATAU via API resmi | Kredit trial 5-10 juta token/30 hari; setelah itu harga per-token jauh lebih murah dari Gemini | 1M token | Reasoning teks & coding sangat kuat, murah setelah trial, open-weight (independensi vendor kalau suatu saat dibutuhkan) | TIDAK ADA vision/multimodal — TIDAK masalah utk X2 (hanya baca teks), TAPI membatasi kalau modul ini nanti diperluas ke input gambar langsung | API resmi DeepSeek (cloud) — self-host = jalur arsitektur BERBEDA, lihat catatan di bawah |
| **OpenRouter** | Aggregator cloud (bukan model sendiri) — meng-host puluhan model open-weight gratis (DeepSeek R1, Llama 3.3 70B, Qwen3 Coder 480B, Llama 4 Scout, Gemma 3, dll) | Gratis dgn rate limit 20 RPM / 50 request/hari; naik ke 1000/hari setelah top-up $10 sekali | Bervariasi per model (Qwen3 Coder 480B 262K, Llama 4 Scout 10M, dll) | Satu API key utk banyak model open-weight sekaligus — murah utk eksperimen/bandingkan kualitas tanpa integrasi berulang | Rate limit ketat di tier gratis; bergantung uptime pihak ketiga (aggregator, bukan vendor model langsung) | REST API OpenRouter (cloud) |
| **Groq** | Platform inferensi cloud (hardware LPU khusus) — bukan model sendiri | Gratis utk Llama 3.3 70B (30 RPM, 1000 request/hari) | Tergantung model yang di-host | Latency sangat rendah (LPU) — relevan kalau AI-assist X2 dipanggil sinkron dlm alur `/drawings/analyze` dan latency jadi keluhan pengguna | Pilihan model terbatas ke yang mereka host; kuota gratis lebih ketat dari Gemini | REST API Groq (cloud) |
| **Qwen3 Coder 480B** (lewat OpenRouter, gratis) | Open-weight | Gratis (tunduk rate limit OpenRouter di atas) | 262K token | Dioptimalkan utk coding & output terstruktur/JSON — relevan langsung utk `response_schema` yang dipakai `dimension_assist.py`/`zone_assist.py` | Tidak ada vision; akses tidak langsung (lewat OpenRouter, bukan API resmi Alibaba) | Lewat OpenRouter (cloud) |

**Catatan penting (jangan disalahpahami sbg rencana self-host):** SEMUA
opsi di atas — termasuk DeepSeek/Llama/Qwen yang open-weight — di tabel ini
dipakai sbg **CLOUD API** (dipanggil lewat HTTP dari Cloud Run, arsitektur
identik dgn `GeminiAiAssistClient` sekarang: stdlib `urllib.request`, tanpa
dependency SDK baru). **Self-host model open-weight di infrastruktur
sendiri** (perlu GPU, model-serving, DevOps tambahan) **adalah jalur
arsitektur BERBEDA yang TIDAK direncanakan saat ini** — konsisten ADR-0003
("Google-First Cloud", `docs/adr/0003-google-first-cloud.md`: "We will
**not** host local models... The AI will be purely API-driven"). Tabel ini
murni referensi keputusan masa depan (mis. kalau kuota gratis Gemini AI
Studio tidak lagi cukup di skala produksi, atau kalau owner ingin
membandingkan kualitas reasoning provider lain utk validasi anti-
halusinasi X2) — bukan perubahan implementasi sesi ini.

### X2.4 Interaksi dengan Fase Y (tombol 1-klik)

Fase Y (alur 1-tombol "Analisa RAB dari Gambar Kerja") **TIDAK terblokir**
oleh X2 — Y bisa dikerjakan Claude (frontend) secara paralel dgn X2 dikerjakan
Codex (backend), sesuai pembagian kerja `CLAUDE.md` §9. Tapi urutan yang
disarankan: **selesaikan slice pertama X2 dulu (atau minimal jalankan
paralel, verifikasi bareng) sebelum mengklaim demo Fase Y "selesai"** —
alasannya: nilai demo 1-tombol Y sangat bergantung pada berapa banyak item
yang benar-benar `dihitung` vs `perlu_review`. Tanpa X2, demo Y akan jujur
menunjukkan PLHUT: 0/13 pondasi_telapak dihitung — itu boleh (kejujuran lebih
penting dari kesan "sudah pintar"), tapi kalau X2 slice pertama sudah
menaikkan angka itu, Y jadi demo yang lebih kuat. Rekomendasi konkret:
kerjakan X2 slice pertama SEBELUM verifikasi akhir end-to-end Fase Y, tidak
harus sebelum Y MULAI dikerjakan.

---

## 5. Kaitan dgn pekerjaan lama yang belum selesai (digabung, bukan hilang)

- **Fase S (perbaikan ranking kandidat harga Semarang/Kejaksaan)**: sudah
  selesai & terverifikasi, masih **BELUM di-commit** di branch
  `fix/semarang-candidate-ranking-claude-direct`. TIDAK bagian dari rencana
  gambar→RAB ini (beda domain: harga vs perception) — tetap menunggu
  keputusan commit dari owner, dikerjakan di working tree yang sama.
- **Fase T (AHSP auto-suggest)**: SEKARANG masuk sbg bagian resmi rencana
  ini (di atas) karena langsung relevan utk Fase W/Y (BOQ butuh AHSP
  ter-suggest). Spek lama TETAP DIPAKAI, tidak ditulis ulang.
- **8 item harga ambigu** (Wiremesh/Kran air/Keramik/Tukang Cat/Paku/dst,
  lihat `docs/ai-map/STATE.md` Fase S) tetap terbuka, butuh keputusan owner,
  di luar cakupan rencana ini.

---

## 6. Verifikasi & disiplin

- Tiap fase: pytest core-engine + document-intelligence, vitest + tsc web,
  fixture sintetis WAJIB sebelum smoke PLHUT/PDF asli dianggap valid.
- Tidak commit — Claude kerja di working tree, laporan jujur tiap fase
  selesai (bukan minta izin tiap langkah kecil, konsisten mode sesi ini),
  TAPI berhenti & tanya kalau ketemu keputusan arsitektural yang sungguh
  butuh owner (mis. Fase Y soal hapus/tidak tombol RAB manual).
- Fase X dilaporkan progresnya per-trade, jujur soal apa yang BELUM
  didukung — tidak pernah diklaim "RAB lengkap semua trade" sebelum benar.
