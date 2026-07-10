# PROMPT SAYA — Perbaikan Nyata Packaging `paax_schemas` + Investigasi Binding Dimensi Footplat (Fase X-1b)

> Ditulis Saya, 2026-07-16, reasoning tinggi ("extra") sesuai instruksi owner
> — dipakai untuk seluruh analisa verifikasi & penyusunan prompt ini, bukan
> cuma bagian frontend. Ini lanjutan setelah verifikasi mendalam atas
> `report-remote/REPORT_FASE_X1_BRIDGING_GALIAN_SAYA_2026-07-05.md` (hasil
> `docs/prompts/PAAX_SAYA_PROMPT_FASE_X1_BRIDGING_GALIAN_FIX_ARSITEKTUR_
> 2026-07-15.md`). **Sebagian besar pekerjaan Fase X-1 SUDAH BENAR & jujur**
> (lihat §0 ringkasan verifikasi) — TAPI satu perbaikan yang saya minta
> sebelumnya (§1.1 prompt lama, cross-service filesystem coupling) **TERNYATA
> HANYA DIPERBAIKI SECARA KOSMETIK**, dibuktikan konkret di §1 di bawah. Ini
> harus benar-benar diperbaiki dulu sebelum menambah kode baru di atasnya.

---

## 0. Ringkasan verifikasi independen (supaya kamu tahu apa yang sudah dicek)

Saya cek langsung ke git log, isi file, dan registrasi endpoint (bukan cuma
percaya narasi report) — hasilnya:

**Terkonfirmasi BENAR:**
- Branch `feat/fase-x1-bridging-galian-footplat` dibuat dari commit yang
  tepat (ujung branch Fase V/W), `main` tidak tersentuh (masih di commit
  lama `5e44b4b1`) — gerbang review dipatuhi.
- `report-remote/REPORT_FASE_V_W_SAYA_2026-07-05.md` (report sesi
  sebelumnya) TIDAK dihapus/ditimpa — report baru ditambahkan sebagai file
  terpisah, sesuai instruksi.
- `bridging_tanah.py` didesain dgn benar: HTTP call murni ke
  `POST /takeoff/tanah` (endpoint nyata, dikonfirmasi ada di
  `services/core-engine/app/main.py` baris ~363), tidak menghitung volume
  sendiri, fallback jujur ke `perlu_review` kalau data/koneksi tidak
  lengkap. Tidak ada angka dikarang.
- Kategori `gording`/`kuda_kuda`/`ikatan_angin`/`trekstang` SEKARANG memang
  bersumber dari satu tempat (`paax_schemas.tkg_taxonomy`), bukan lagi
  daftar hardcoded terpisah yang bisa divergen — **temuan §1.2 prompt lama
  BENAR diperbaiki secara substansi**, bukan cuma kosmetik.
- Smoke test PLHUT nyata (88 halaman) dilaporkan jujur: 13 entry
  `pondasi_telapak` ditemukan, SEMUA `perlu_review` (bukan dipaksa
  `dihitung`) karena dimensi memang tidak lengkap di data — sesuai prinsip
  kejujuran §0.1.

**TIDAK bisa saya verifikasi 100% (keterbatasan sesi ini, bukan tuduhan)**:
shell/bash tidak tersedia untuk saya sepanjang sesi ini, jadi saya TIDAK bisa
menjalankan ulang pytest/vitest sendiri atau membaca badan penuh pesan commit
(reflog cuma simpan judul, bukan body/trailer). Angka test (148/279/12/47
dkk) saya terima dari laporan + konsistensi dgn `STATE.md`, BUKAN saya
eksekusi ulang. Soal larangan `Co-Authored-By`: saya tidak bisa membuktikan
ketiadaannya dari reflog saja — lihat §4 di bawah, saya minta kamu sertakan
bukti langsung di laporan berikutnya supaya ini bisa diverifikasi tuntas.

**Ditemukan BELUM benar-benar selesai** — lihat §1, ini prioritas utama
prompt ini.

---

## 1. WAJIB DIPERBAIKI DULU — packaging `paax_schemas` masih rapuh

### 1.1 Bukti konkret (bukan opini)

`services/core-engine/app/tkg/takeoff.py` baris 37-41:

```python
try:
    from paax_schemas.tkg_taxonomy import PREFIKS as _PREFIKS, kategori_dari_kode
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "packages" / "schemas" / "python"))
    from paax_schemas.tkg_taxonomy import PREFIKS as _PREFIKS, kategori_dari_kode
```

Pola identik ada di `work_items.py`. Saya cek:
- `packages/schemas/python/` **TIDAK PUNYA `pyproject.toml`/`setup.py` sendiri**
  — bukan package Python yang bisa di-install, cuma folder biasa.
- `services/core-engine/pyproject.toml` **TIDAK mencantumkan `paax-schemas`
  sebagai dependency**. Sama untuk `services/document-intelligence/
  pyproject.toml`.

**Konsekuensi nyata**: import "normal" (`from paax_schemas... import ...`)
akan **SELALU** gagal dengan `ModuleNotFoundError` di lingkungan mana pun
(karena memang tidak pernah ter-install), sehingga kode **SELALU** jatuh ke
cabang `except` yang menyisipkan path relatif hardcoded 4 level ke atas.
Ini **PERSIS jenis masalah yang sama** dengan bug lama (§1.1 prompt Fase
X-1): kalau `core-engine` dan `document-intelligence` di-deploy sebagai 2
container terpisah (rencana arsitektur resmi proyek ini, `SAYA.md` §4:
"Deploy: Cloud Run (services)"), path relatif itu TIDAK akan menemukan
folder `packages/schemas/python` sama sekali — container `core-engine`
sendirian tidak akan punya folder itu kecuali di-copy eksplisit saat build.

Test yang ditambahkan sesi lalu
(`test_work_items_does_not_import_core_engine_sections_by_filesystem_path`)
**HANYA mengecek 2 string literal** (`"spec_from_file_location"`,
`"core-engine"`) TIDAK ADA di source — test ini otomatis LOLOS walau
masalah arsitekturnya belum selesai, karena string yang dicek memang sudah
tidak dipakai (diganti nama folder target, bukan diganti caranya). Test ini
**tidak salah**, tapi **tidak cukup** — ganti/perkuat jadi mengecek hal yang
benar-benar relevan (§1.3).

### 1.2 Perbaikan yang diminta — buat `paax_schemas` genuinely installable

- Tambahkan `packages/schemas/python/pyproject.toml` minimal (nama paket
  `paax-schemas`, versi awal `0.1.0`, tanpa dependency eksternal — isinya
  cuma data/fungsi murni Python, tidak perlu FastAPI/Pydantic dsb kecuali
  memang dipakai di dalamnya).
- Di `services/core-engine/pyproject.toml` DAN
  `services/document-intelligence/pyproject.toml`: tambahkan `paax-schemas`
  sebagai dependency yang di-install secara **editable dari path lokal**
  (gunakan mekanisme yang didukung versi pip/tool yang dipakai repo ini
  sekarang — cek dulu `pyproject.toml`/README/CI existing untuk tahu tool
  install yang dipakai, JANGAN memperkenalkan tool baru seperti Poetry/uv
  kalau repo belum pakai itu, konsisten §2 SAYA.md "jangan menambah
  dependency/tool baru tanpa alasan jelas").
- Update instruksi install di README (`Quick Start`) dan
  `.github/workflows/ci.yml` (cek langkah install Python di CI sekarang —
  kemungkinan besar CI JUGA diam-diam bergantung pada fallback `sys.path`
  yang sama; kalau iya, itu juga harus diperbaiki supaya CI benar-benar
  menguji kondisi "package ter-install dengan benar", bukan kebetulan
  jalan karena fallback).
- **Setelah itu, HAPUS blok `try/except ModuleNotFoundError` + `sys.path.
  insert`** di `takeoff.py` dan `work_items.py` — ganti jadi **import
  langsung** (`from paax_schemas.tkg_taxonomy import ...` tanpa fallback).
  Kalau tanpa fallback ternyata masih gagal, itu artinya instalasi package
  belum benar — perbaiki instalasinya, JANGAN kembalikan fallback path hack
  (itu menyembunyikan masalah, bukan menyelesaikannya).

### 1.3 Test yang benar-benar membuktikan perbaikan

- Test baru yang menjalankan import `paax_schemas` di proses Python BERSIH
  tanpa manipulasi `sys.path` manual apa pun sebelumnya dalam test itu
  sendiri (mis. subprocess terpisah yang HANYA menjalankan `python -c
  "import paax_schemas.tkg_taxonomy"` dari working directory service
  masing-masing, TANPA menambahkan `packages/schemas/python` ke
  `PYTHONPATH` secara manual) — assert exit code 0. Ini membuktikan
  package benar-benar ter-install, bukan cuma "kebetulan jalan" karena
  fallback.
- Ganti/lengkapi test lama (`test_work_items_does_not_import_core_engine_
  sections_by_filesystem_path`) supaya juga assert TIDAK ADA
  `sys.path.insert` maupun `except ModuleNotFoundError` tersisa di
  `work_items.py` DAN `takeoff.py` (bukan cuma 2 string lama).
- Jalankan ulang FULL test suite ketiga service + `packages/schemas`
  (pytest + jest/vitest + tsc) — laporkan angka lengkap, termasuk
  konfirmasi CI config (`.github/workflows/ci.yml`) sudah disesuaikan kalau
  memang perlu.

### 1.4 Kalau ternyata solusi ini tidak semudah kelihatannya

Kalau instalasi editable-path lintas-folder ternyata bermasalah dengan tool
build yang dipakai repo ini (mis. konflik versi, circular dependency
konseptual antara `core-engine` dan `packages/schemas`), **STOP, jangan
memaksakan solusi setengah jadi lain** — laporkan hambatan konkretnya ke
owner/Saya, jangan kembali diam-diam ke pola `sys.path` hack.

---

## 2. Investigasi (bukan tebakan) — kenapa dimensi footplat PLHUT kosong

### 2.1 Latar

Report Fase X-1 melaporkan jujur: dari 13 entry `pondasi_telapak` PLHUT
nyata (88 halaman), SEMUA `perlu_review` karena `dimensi footplat tidak
lengkap di gambar: b, l`. Sebelum menganggap ini "gap ekstraksi besar yang
perlu fase terpisah", **investigasi dulu apakah ini bug binding yang bisa
diperbaiki cepat, atau memang keterbatasan data PDF PLHUT itu sendiri**:

1. Cek `services/document-intelligence/app/perception/consolidate.py`
   bagian yang mengisi `ElementDefinisi.dimensi` dari `TypeRecord` (lihat
   `record.dimensi` di fungsi konsolidasi tabel, sekitar area yang mengisi
   `entry.definisi`). Apakah `TypeRecord` untuk kode `P*/F*/PC*` di PLHUT
   NYATA (`GAMBAR KERJA PLHUT SURAKARTA (1).pdf`, 88 halaman — file yang
   sama dipakai smoke test sebelumnya) benar-benar punya `dimensi` kosong
   di HASIL EKSTRAKSI TABEL, atau apakah tabelnya ADA datanya di PDF tapi
   parser tabel (`assemble.py`/grammar) gagal mengikatnya ke kode yang
   benar?
2. Kalau setelah investigasi ternyata: **tabel dimensi PLHUT memang ada &
   terbaca dengan benar tapi field-nya bernama beda** dari yang dicari
   bridge (`b`/`b_ft`/`lebar`/`lebar_bawah` dan `l`/`l_ft`/`panjang`/
   `panjang_bawah` — lihat `bridging_tanah.py::_first_dim` keys yang
   dicari) — ini bug binding sempit, PERBAIKI (tambah alias field yang
   hilang, dengan bukti field itu memang ada di tabel PLHUT nyata).
3. Kalau setelah investigasi ternyata **tabel dimensi footplat PLHUT
   memang tidak ada/tidak terbaca sama sekali oleh pipeline ekstraksi
   tabel** (bukan soal nama field, tapi datanya genuinely tidak sampai ke
   `TypeRecord`) — **JANGAN dipaksakan diperbaiki di prompt ini**. Itu gap
   ekstraksi tabel yang lebih besar (kemungkinan perlu perbaikan di
   `assemble.py`/parser tabel/OCR, scope berbeda dari bridging). Laporkan
   secara spesifik: sheet halaman berapa, contoh raw text/tabel yang
   ditemukan (kalau ada), dan kenapa itu tidak bisa diikat sekarang — supaya
   jadi spek yang jelas untuk fase terpisah nanti (BUKAN ditebak/dipaksakan
   hari ini).
4. **`d_gali` (kedalaman galian)**: cek juga apakah ini secara struktural
   MEMANG tidak pernah ada di data denah/tabel manapun yang diekstrak
   sistem sekarang (biasanya ada di gambar potongan/detail, bukan denah)
   — kalau memang begitu, itu bukan bug, itu keterbatasan sumber data yang
   sudah benar dilaporkan `perlu_review`. Konfirmasi ini secara eksplisit di
   laporan (jangan biarkan ambigu antara "belum diimplementasi" vs "memang
   tidak ada sumbernya").

### 2.2 Batasan

- Ini adalah tugas **investigasi + perbaikan HANYA kalau akar masalahnya
  sempit & jelas** (§2.1 poin 2). Kalau ternyata gap-nya besar (poin 3),
  **JANGAN membangun fitur ekstraksi tabel baru di prompt ini** — itu
  overscope, laporkan sebagai temuan untuk prompt terpisah.
- Tidak mengubah rumus `takeoff_tanah`/`app/takeoff/tanah.py` apa pun.
- Tidak menyentuh `apps/web/**`.

---

## 3. Pembagian kerja, commit, gerbang review — SAMA seperti sebelumnya

- **Saya**: §1 + §2 sepenuhnya (backend, packaging, test). Commit HANYA
  oleh Saya, auto-run tetap berlaku (tanpa minta approval tiap langkah).
- **TANPA `Co-Authored-By`/signature AI apa pun di commit manapun** (aturan
  ini SUDAH berlaku sejak prompt sebelumnya, ditegaskan lagi).
- **Saya**: frontend sepenuhnya di luar cakupan, dikerjakan terpisah
  (`saya-sonnet-5` reasoning tinggi).
- **Gerbang review**: branch baru dari `feat/fase-x1-bridging-galian-
  footplat` (karena §1 memperbaiki file yang sama), push, PR **draft** ke
  `main`, **JANGAN merge sendiri**. Izin auto-commit ≠ izin auto-merge.
- Jangan menyentuh `apps/web/**`.

---

## 4. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_FASE_X1B_PACKAGING_BINDING_SAYA_
<tanggal-eksekusi-nyata>.md`. **JANGAN edit/hapus report lama yang sudah
ada** (`REPORT_FASE_V_W_SAYA_2026-07-05.md`,
`REPORT_FASE_X1_BRIDGING_GALIAN_SAYA_2026-07-05.md`).

Isi WAJIB, termasuk 2 hal BARU yang saya minta secara eksplisit supaya
verifikasi berikutnya bisa lebih lengkap (saya tidak punya akses shell
sesi ini, jadi butuh bukti mentah, bukan cuma ringkasan):

1. Ringkasan §1 (packaging) — bukti konkret bahwa import langsung
   (`from paax_schemas... import ...` TANPA try/except) berhasil di kedua
   service, tanpa fallback tersisa di kode.
2. Ringkasan §2 (investigasi dimensi/kedalaman) — kesimpulan jujur per
   poin 2.1.1-4, apa yang diperbaiki (kalau ada) vs apa yang genuinely gap
   data (kalau ada), dengan bukti (contoh raw data, bukan klaim umum).
3. **Daftar LENGKAP commit sesi ini, TIAP commit sertakan output MENTAH**
   `git log -1 --format="%H%n%s%n%n%b" <sha>` (SHA, judul, DAN badan
   lengkap apa adanya) — supaya saya bisa memverifikasi sendiri tidak ada
   `Co-Authored-By`/signature tersembunyi tanpa perlu akses shell. Jangan
   diringkas/parafrase, salin apa adanya.
4. Hasil test lengkap (pytest core-engine, document-intelligence,
   packages/schemas, vitest+tsc web) — angka before/after §1.
5. Link PR + status (draft, base branch persis).
6. Pending untuk fase berikutnya.

---

## 5. Yang TIDAK boleh dilakukan (tegas)

- Jangan kembalikan pola `sys.path.insert`/`try-except ModuleNotFoundError`
  apa pun untuk `paax_schemas` — kalau instalasi proper ternyata sulit,
  STOP dan laporkan, jangan pasang fallback tersembunyi lagi (§1.4).
- Jangan memaksakan ekstraksi dimensi/kedalaman kalau ternyata memang tidak
  ada sumbernya di data (§2.1 poin 3-4) — kejujuran gap lebih penting.
- Jangan sentuh `apps/web/**`, jangan merge ke `main` sendiri, jangan
  hapus/timpa file di `report-remote/`, jangan sertakan `Co-Authored-By`/
  signature AI di commit manapun.
- Jangan mengubah rumus `app/takeoff/tanah.py` atau engine RAB/HSP lain.
