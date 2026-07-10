# PROMPT SAYA — Perbaikan Temuan Fase V/W + Fase X-1: Bridging Galian Footplat

> Ditulis Saya, 2026-07-15. Ini lanjutan setelah verifikasi independen atas
> `report-remote/REPORT_FASE_V_W_SAYA_2026-07-05.md` (hasil eksekusi
> `docs/prompts/PAAX_SAYA_PROMPT_FASE_V_W_NORMALISASI_KODE_WORK_ITEMS_2026-
> 07-14.md`). **Verifikasi keseluruhan POSITIF** — commit, branch/PR, kode,
> dan test yang diklaim di report SEMUA terkonfirmasi nyata (dicek langsung ke
> git log, isi file, dan registrasi router — bukan cuma percaya klaim). Gerbang
> review dipatuhi penuh: tidak ada merge ke `main` (`main` masih di commit
> lama `5e44b4b1`, jauh sebelum kerja Fase S/T/U/U-2/V/W). Frontend tidak
> disentuh untuk Fase V/W. **TAPI ada 2 temuan teknis nyata** yang harus
> diperbaiki dulu sebelum lanjut ke fase berikutnya (§1), baru kemudian Fase
> X-1 (§2, satu vertical slice bridging: galian footplat).

---

## 0. WAJIB BACA DULU

1. `docs/ai-map/STATE.md` — bagian "FASE V/W" (baru, ditulis Saya) untuk
   status terkini.
2. `report-remote/REPORT_FASE_V_W_SAYA_2026-07-05.md` — laporan yang
   diverifikasi prompt ini.
3. `services/document-intelligence/app/perception/work_items.py` — file yang
   diperbaiki di §1.
4. `services/core-engine/app/tkg/takeoff.py` — `_PREFIKS` (baris ~118-130)
   dan `kategori_dari_kode()` (baris ~133-140), sumber kebenaran kategori.
5. `services/core-engine/app/takeoff/tanah.py` (`takeoff_tanah`) +
   `services/core-engine/app/takeoff/models.py` (`GalianFootplat`,
   `TanahRequest`) — target bridging Fase X-1.
6. `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §4 (Fase
   X, termasuk koreksi X-1/X-2) dan `docs/BRAIN_ALIGNMENT.md` §4.

**Aturan komit — BARU, WAJIB PATUHI**: pesan commit **TIDAK BOLEH**
mengandung baris `Co-Authored-By`, `Generated with`, atau embel-embel
signature/attribution apa pun ke AI manapun (Saya/Saya/model lain).
Pesan commit harus bersih — hanya judul + badan yang menjelaskan
perubahan, konsisten Conventional Commits. (Prompt-prompt sebelumnya
menyertakan `Co-Authored-By: Saya Sonnet 5` — itu **tidak berlaku lagi
mulai prompt ini**, dan kalau kamu commit ulang/amend apa pun dari sesi
lama, hapus baris itu juga.)

---

## 1. Perbaikan WAJIB — 2 temuan dari verifikasi Fase V/W

Ini **bukan tuduhan kesalahan besar** — implementasi Fase V/W secara
substansi SUDAH BENAR dan teruji. Tapi 2 hal berikut adalah risiko nyata
yang saya buktikan konkret (bukan spekulasi), harus diperbaiki sebelum Fase
X-1 menambah lebih banyak kode di atas fondasi yang sama.

### 1.1 Cross-service import via filesystem path (arsitektur)

`work_items.py::_core_sections_module()` memuat
`services/core-engine/app/rab/sections.py` pakai
`importlib.util.spec_from_file_location` dengan path relatif hardcoded
(`Path(__file__).resolve().parents[3] / "core-engine" / ...`). Ini bekerja
SEKARANG karena kedua service kebetulan hidup di satu checkout monorepo yang
sama, TAPI melanggar asumsi independent-deployability yang dinyatakan
sendiri di `SAYA.md` §4 ("Deploy: Cloud Run (services)") — kalau
`document-intelligence` dan `core-engine` di-deploy sebagai container
terpisah (yang memang rencana arsitektur proyek ini), import ini akan gagal
total di production karena source `core-engine` tidak ada di filesystem
container `document-intelligence`.

**Perbaikan**: pindahkan sumber kebenaran `WBS_SECTIONS`/`normalize_section`
ke tempat yang BENAR-BENAR bisa diakses kedua service tanpa reach-across
filesystem. Dua opsi sah (pilih yang paling konsisten dengan pola repo yang
sudah ada, jelaskan alasan di laporan):

- **Opsi A (disarankan)**: pindahkan `WBS_SECTIONS`/`normalize_section` ke
  `packages/schemas` (atau paket Python bersama baru kalau belum ada
  polanya) sebagai data statis murni (bukan logic RAB), lalu KEDUA service
  import dari sana. ini konsisten dengan prinsip "satu sumber kebenaran"
  yang sudah dipakai untuk Zod/Pydantic.
- **Opsi B**: `document-intelligence` memanggil endpoint core-engine yang
  sudah ada (`/wbs/sections`, lihat `docs/ai-map/MAP.md`) via HTTP client
  saat runtime, sama seperti pola client HTTP yang sudah dipakai di tempat
  lain di repo ini untuk komunikasi antar-service.

Jangan hardcode ulang daftar section sebagai list baru di
`document-intelligence` (itu balik lagi ke masalah taksonomi paralel yang
sama seperti §1.2 di bawah).

### 1.2 Taksonomi kategori duplikat & sudah TERBUKTI divergen

`work_items.py` mendefinisikan `_STRUCTURAL_CATEGORIES` sbg SET HARDCODED
yang isinya PERSIS `_KATEGORI_BETON` dari `app/tkg/takeoff.py` — TAPI
`_PREFIKS` di file yang sama (`takeoff.py`) juga mengenal kategori
**`gording`, `kuda_kuda`, `ikatan_angin`, `trekstang`** (elemen atap/rangka
baja, prefiks kode `GD`, `KD`/`JR`, `IA`, `TS`) yang **TIDAK ADA** di set
`_STRUCTURAL_CATEGORIES` milik `work_items.py`. Akibat nyata: elemen kuda-
kuda/gording di gambar kerja akan otomatis jatuh ke `formula_status:
"belum_didukung"` dan seksi `"LAINNYA"`, PADAHAL kategorinya dikenal resmi
oleh engine (`kategori_dari_kode()` akan mengembalikan `"kuda_kuda"` dsb,
bukan `None`) — ini BUKAN "belum ada rumus" yang jujur, ini bug klasifikasi
karena daftar kategori di `work_items.py` sudah usang/tidak sinkron sejak
awal ditulis.

**Perbaikan**: Fase V SUDAH memberi contoh cara benar (lihat
`_tkg_prefix_categories()` di `consolidate.py`, ambil `_PREFIKS` via AST
parse). Terapkan pola SAMA di `work_items.py`: ambil daftar kategori
LANGSUNG dari `kategori_dari_kode()`/`_PREFIKS` (atau import fungsinya kalau
lebih bersih daripada AST parse, sekarang kamu sudah tahu kedua file itu di
service berbeda — pertimbangkan juga solusi §1.1 di sini supaya tidak perlu
2 mekanisme reach-across berbeda). Jangan hardcode ulang `_STRUCTURAL_
CATEGORIES` sebagai literal set — derive dari sumber kebenaran yang sama.

Tambahkan test yang secara eksplisit membuktikan SETIAP kategori yang
dikenal `kategori_dari_kode()` ter-mapping ke SALAH SATU seksi WBS (bukan
jatuh diam-diam ke `"LAINNYA"` kecuali memang belum ada pemetaan yang
disengaja & didokumentasikan) — supaya regresi seperti ini di masa depan
tertangkap otomatis, bukan ditemukan manual lagi.

### 1.3 Verifikasi setelah perbaikan §1.1/§1.2

```powershell
cd services/document-intelligence && python -m pytest -q
cd ../core-engine && python -m pytest -q
cd ../../packages/schemas && pnpm build && pnpm test
cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit
```

---

## 2. Fase X-1 — Bridging: Galian Footplat (SATU vertical slice, bukan semua trade)

### 2.1 Kenapa ini & kenapa sempit

`docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §4
mengoreksi Fase X: rumus tanah/dinding/arsitektur **SUDAH ADA**
(`app/takeoff/tanah.py` dkk, `docs/BRAIN_ALIGNMENT.md` §4), gap
sebenarnya adalah **bridging** — menyuplai input eksplisit modul itu
(`GalianFootplat{b_ft, l_ft, d_gali, n, ...}`) dari hasil konsolidasi
TKG/Fase W, yang saat ini TIDAK ADA sama sekali (kategori `pondasi_telapak`
akan selalu `belum_didukung` di Fase W walau rumusnya sudah ada). Sesuai
prinsip vertical-slice (`SAYA.md`/`AGENTS.md` §2), kerjakan **HANYA
`GalianFootplat`** dulu (satu jenis galian), BUKAN `GalianMenerus`/
`UruganLapis`/`Pemadatan` sekaligus — itu slice terpisah untuk prompt lain
setelah pola bridging ini terbukti benar.

### 2.2 Yang harus dibangun

- Modul baru (mis. `services/document-intelligence/app/perception/
  bridging_tanah.py` atau lokasi lain yang lebih konsisten — jelaskan
  pilihanmu): fungsi yang mengambil `ElementRegistryEntry` berkategori
  `pondasi_telapak` (dari hasil Fase V/W) dan mencoba menyusun
  `GalianFootplat`:
  - `kode` = `entry.kode` (kanonik, dari Fase V).
  - `b_ft`, `l_ft` = dari `entry.definisi.dimensi` (`ElementDefinisi`,
    field `dimensi: Dict[str, float]` — sudah ada di
    `consolidated_models.py`). Kalau dimensi tidak lengkap (mis. cuma `b`
    tanpa `l`, atau `definisi` kosong): **JANGAN menebak** — tandai
    `needs_review` dengan alasan spesifik ("dimensi footplat tidak lengkap
    di gambar").
  - `d_gali` (kedalaman galian) — **secara jujur, ini KEMUNGKINAN BESAR
    tidak tersedia** dari data TKG konsolidasi manapun sekarang (biasanya
    ada di potongan/detail, bukan denah). **JANGAN mengarang default diam-
    diam.** Kalau tidak ada sumber eksplisit: tandai item ini
    `formula_status: "perlu_review"` dengan `review_reason` yang jujur
    ("kedalaman galian tidak tersedia dari gambar, perlu input manual"),
    JANGAN dipaksa `"dihitung"` dengan asumsi kedalaman standar. Kalau kamu
    menemukan sumber kedalaman yang genuinely ada di data (mis. dari tabel
    detail pondasi kalau ada field itu), silakan pakai — tapi verifikasi
    dulu field itu benar-benar terisi dari pipeline nyata, jangan asumsi
    strukturnya ada.
  - `n` (jumlah) — dari jumlah instance elemen dengan kode sama (via
    `entry.instances`, sudah ada).
- Panggil `takeoff_tanah()` (core-engine) via cara yang SAMA/konsisten
  dengan solusi §1.1 (HTTP API kalau itu opsi yang dipilih untuk WBS,
  supaya tidak ada 2 mekanisme cross-service berbeda dalam 1 codebase).
- Update `work_items.py`: kategori `pondasi_telapak` yang berhasil dapat
  `GalianFootplat` lengkap (b_ft, l_ft, d_gali semua terisi) →
  `formula_status: "dihitung"` dengan volume asli dari `takeoff_tanah()`.
  Yang datanya tidak lengkap → `"perlu_review"` (BUKAN `"belum_didukung"` —
  beda arti: `belum_didukung` = rumus tidak ada, `perlu_review` = rumus ada
  tapi input kurang, sudah ada bedanya di enum `FormulaStatus`).
- **PENTING — Aturan Emas**: modul bridging ini HANYA menyusun input
  terstruktur (`GalianFootplat`) dan memanggil fungsi takeoff yang sudah
  ada. TIDAK PERNAH menghitung volume sendiri di Python biasa/manual — HARUS
  lewat `takeoff_tanah()`.

### 2.3 Test wajib

- Fixture sintetis independen (§0.1 style, bukan PLHUT): elemen
  `pondasi_telapak` dengan dimensi lengkap (`b`, `l`) TAPI TANPA sumber
  kedalaman → assert `formula_status: "perlu_review"`, TIDAK ada volume.
- Fixture sintetis kedua: kalau kamu berhasil menemukan sumber kedalaman
  yang genuinely ada di pipeline (jelaskan di laporan sumbernya persis apa)
  → fixture dengan data lengkap → assert `formula_status: "dihitung"`,
  volume cocok dengan hasil manual `takeoff_tanah()` dihitung terpisah
  (nilai acuan manual, bukan disalin dari output kode yang sama).
- Fixture: elemen `pondasi_telapak` dengan dimensi TIDAK lengkap (`b` tanpa
  `l`) → assert `needs_review` dengan alasan spesifik, tidak crash.
- Smoke PLHUT existing → laporkan APAKAH PLHUT punya elemen
  `pondasi_telapak` yang bisa dibridging penuh atau tidak (jujur, jangan
  dipaksakan kalau datanya memang tidak lengkap — PLHUT boleh saja hasilnya
  tetap "perlu_review" kalau memang kedalaman tidak ada di gambar).

### 2.4 Batasan tegas

- **HANYA** `GalianFootplat`/`pondasi_telapak`. Jangan mulai `GalianMenerus`,
  `UruganLapis`, `Pemadatan`, atau trade lain (dinding/arsitektur/baja) di
  prompt ini — itu overscope, akan jadi slice terpisah.
- **JANGAN** mengarang `d_gali` dengan default diam-diam "supaya kelihatan
  lengkap". Kejujuran gap lebih penting (prinsip §0.1 big-plan & filosofi
  proyek ini keseluruhan).
- **JANGAN** mengubah rumus di `app/takeoff/tanah.py` — modul ini SUDAH
  benar & diuji, kamu hanya MEMANGGIL, tidak MENGUBAH.
- **JANGAN** menyentuh `apps/web/**` — sama seperti prompt sebelumnya, tetap
  domain Saya sepenuhnya.

---

## 3. Pembagian kerja, commit, dan gerbang review — SAMA seperti prompt sebelumnya

- **Saya (kamu)**: §1 (perbaikan) + §2 (Fase X-1) sepenuhnya — backend,
  data model, test. **Commit HANYA oleh kamu**, izin auto-run tetap berlaku
  (tidak perlu berhenti minta approval tiap langkah).
- **TANPA baris `Co-Authored-By`/signature apa pun di commit message** (lihat
  §0 — aturan baru).
- **Saya**: frontend (`apps/web/src/components/**`, `apps/web/src/app/**`)
  sepenuhnya di luar cakupan prompt ini, dikerjakan terpisah pakai
  `saya-sonnet-5` reasoning tinggi.
- **Gerbang review tetap berlaku**: kerja di branch baru (dari
  `feat/gambar-rab-fase-v-w-normalisasi-work-items`, karena §1 memperbaiki
  file yang sama), push, buka PR **draft** ke `main`, **JANGAN merge
  sendiri**. Izin auto-commit ≠ izin auto-merge (sama seperti sebelumnya —
  kalau owner mau ubah ini, itu keputusan terpisah yang harus dikonfirmasi
  eksplisit, jangan diasumsikan).
- Cek dulu status PR #35 (backlog Fase S/T/U/U-2) dan #36 (Fase V/W) — kalau
  masih draft/belum di-review, PR baru untuk §1+§2 ini based di atas branch
  Fase V/W (bukan `main`), jelaskan dependensi PR ini di deskripsinya.

---

## 4. Laporan WAJIB di folder `report-remote/` (dikonfirmasi owner, BUKAN `report/`)

**Koreksi dari draft prompt ini sebelumnya**: owner (Wisnu) mengonfirmasi
langsung bahwa `report-remote/` MEMANG SENGAJA diminta ke Saya, tujuannya
membedakan pekerjaan sesi remote dari report desktop biasa di `report/`.
Jadi: **taruh laporan fase ini di `report-remote/`, JANGAN di `report/`.**
(Catatan riwayat: sebelumnya saya sempat minta pindah ke `report/` karena
tidak punya catatan instruksi itu — sudah dikoreksi, abaikan versi lama.)

**WAJIB dipatuhi ketat — jangan hapus/timpa riwayat report**:
`report-remote/` berisi riwayat laporan tiap fase yang owner mau review
satu-persatu nanti. **JANGAN PERNAH menghapus, menimpa, atau mengedit file
report yang SUDAH ADA di folder itu** (termasuk
`REPORT_FASE_V_W_SAYA_2026-07-05.md`) — **selalu buat file BARU** dengan
nama/timestamp unik untuk tiap fase/sesi (mis. sertakan tanggal eksekusi
sesi ini di nama file, bukan tanggal prompt ditulis, supaya tidak
bentrok/menimpa file lain kalau prompt yang sama dijalankan ulang di hari
berbeda). Kalau ragu nama file akan bentrok dengan yang sudah ada, tambahkan
suffix waktu (jam:menit) atau nomor urut, JANGAN overwrite.

Nama file: `report-remote/REPORT_FASE_X1_BRIDGING_GALIAN_SAYA_<tanggal-
eksekusi-nyata>.md` (contoh pola: `REPORT_FASE_V_W_SAYA_2026-07-05.md`
memakai tanggal Saya benar-benar menjalankan sesi, bukan tanggal prompt).

Isi WAJIB:

1. **Ringkasan** singkat.
2. **§1 perbaikan**: pendekatan yang dipilih (Opsi A/B untuk WBS
   cross-service), bukti kategori `gording`/`kuda_kuda`/dst sekarang
   ter-mapping benar (test baru), hasil test lengkap sebelum vs sesudah.
3. **§2 Fase X-1**: lokasi modul bridging, hasil bridging PLHUT (berapa
   elemen `pondasi_telapak` berhasil `"dihitung"` vs `"perlu_review"` dan
   kenapa — jujur soal ketersediaan `d_gali`), nilai acuan manual yang
   dipakai untuk test volume galian.
4. **Daftar LENGKAP semua commit SHA** dibuat sesi ini (jangan lewatkan satu
   pun, termasuk commit dokumentasi/report — ini catatan dari verifikasi
   sesi sebelumnya yang kelewatan 1 commit di laporannya).
5. Link PR + status.
6. Pending/belum didukung untuk sesi berikutnya (GalianMenerus dkk, trade
   lain).

---

## 5. Yang TIDAK boleh dilakukan (tegas, sama + tambahan)

- Semua larangan di prompt Fase V/W sebelumnya tetap berlaku (tidak sentuh
  frontend, tidak merge sendiri, tidak mengarang angka, tidak overscope ke
  Fase X-2/Y/Z).
- **BARU**: jangan sertakan `Co-Authored-By`/signature AI apa pun di commit
  manapun sesi ini.
- **BARU**: jangan lupakan commit apa pun dari daftar laporan (§4.4) —
  laporan sebelumnya kelewatan 1 commit (`9131cf7`), meski isinya kemungkinan
  besar cuma housekeeping report/PR-link, transparansi penuh tetap wajib.
- **BARU**: jangan hapus, timpa, atau edit file laporan yang SUDAH ADA di
  `report-remote/` (lihat §4) — selalu tambah file baru dengan nama unik.
  Owner mau review seluruh riwayat report itu, jadi riwayatnya harus utuh.
