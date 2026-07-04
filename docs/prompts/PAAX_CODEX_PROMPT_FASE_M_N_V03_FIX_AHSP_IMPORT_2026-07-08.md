# PROMPT CODEX — Fase M/N: Perbaiki V-03 & Impor Katalog AHSP CK 2026 (10 batch)

> Ditulis Claude, 2026-07-08. Lanjutan dari PR #29 (`feat/gambar-generate-
> rab-wiring`) dan PR #30 (`feat/rab-nav-validator-audit-ahsp-suggest`) —
> keduanya sudah saya (Claude) verifikasi ulang independen (baca ulang diff,
> jalankan ulang seluruh test sendiri, bukan cuma percaya laporan) dan
> **akurat, tidak ada yang dikarang**: web 46/46, core-engine 242 passed +
> 1 xfailed, tsc bersih.
>
> Prompt ini punya 2 pekerjaan besar yang TIDAK saling bergantung urutan
> ketat (boleh M dulu baru N, itu disarankan karena M lebih kecil/cepat):
> **Fase M** memperbaiki temuan nyata Codex sendiri (V-03 false-positive),
> **Fase N** mengimpor katalog AHSP CK 2026 resmi (2.542 item) dalam
> **10 batch ~250 item**, dengan laporan temuan per-batch untuk Claude
> review — BUKAN Codex memutuskan sendiri data mana yang "benar".

---

## 0. WAJIB BACA DULU

1. **`CLAUDE.md`** §1 (Aturan Emas), §9 (pembagian tugas — **kerja data AHSP
   secara default adalah tugas Claude**; Fase N di prompt ini adalah
   pengecualian yang DIIZINKAN owner secara eksplisit: Codex mengerjakan
   validasi mekanis per-batch, Claude yang mereview & memutuskan perbaikan
   substansi — BUKAN Codex mengubah nilai koefisien resmi atas inisiatif
   sendiri).
2. **`docs/ai-map/STATE.md`** dan **`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`**
   §3/§5 — status terkini.
3. **`report/REPORT_FASE_J2_K2_L_LANJUTAN_CODEX_2026-07-07.md`** — laporan
   Codex sebelumnya, termasuk temuan V-03 yang diperbaiki di Fase M ini.
4. **`docs/prompts/PAAX_CODEX_PROMPT_FASE_J2_K2_L_LANJUTAN_2026-07-07.md`**
   §4 — instruksi audit validator yang menghasilkan temuan V-03 ini.

**Kode yang harus dibaca:**

| File | Kenapa |
|---|---|
| `services/core-engine/app/tkg/validate.py` | `_grid_fingerprint`, `_cek_v02`, `validate_tkg` — yang diperbaiki di Fase M |
| `services/core-engine/tests/test_tkg.py` | Test `test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid` (baris ±178-213, saat ini `xfail(strict=True)`) — HARUS jadi lolos tanpa marker xfail setelah Fase M |
| `services/core-engine/app/tkg/models.py` | `GridAxis.posisi_mm` (Optional), `GridSpan`, `Grid` |
| `services/document-intelligence/app/perception/consolidate.py` | fungsi `_grid_conflicts` — pola serupa SUDAH ada di layer lain (beda service, TIDAK bisa di-share langsung, tapi PENDEKATANNYA yang harus ditiru: bandingkan hanya label yang tumpang-tindih, bukan seluruh grid) |
| `services/core-engine/app/rab/loader.py` | `load_data()` — cara file `data/ahsp/*.json` dimuat (glob semua file, digabung per `item.code`) |
| `services/core-engine/app/rab/models.py` | `AHSPItem`, `Component`, `ResourcePrice` — skema yang WAJIB dipatuhi item baru |
| `services/core-engine/app/data_audit/coverage.py` | `audit_data_coverage` — dipakai untuk laporan honest coverage setelah impor |
| `data/ahsp/cipta-karya.sample.json` | Katalog sample LAMA (4 item, kode gaya `AHSP.CK.001`) — **JANGAN DIHAPUS/DIUBAH**, 10 file test (`test_scenario_custom.py`, `test_rab.py`, `test_api.py`, `test_excel_export.py`, `test_sections.py`, `test_validate.py`, `test_scenario.py`, dll.) bergantung pada kode-kode ini |
| `data/harga-satuan/surakarta.json`, `jateng.sample.json`, `semarang_overrides.json` | Region price book YANG SUDAH ADA di repo — cek `GET /regions` utk daftar region nyata, JANGAN asumsikan "jateng" penuh tersedia hanya karena itu default param di `main.py` |

**Sumber data BARU (di luar repo, path absolut lokal mesin ini):**

| Path | Isi |
|---|---|
| `G:\paax-data\ahsp\cipta-karya-2026.json` | Katalog AHSP resmi **2.542 item**, `bidang: "Cipta Karya"`, `source: "SE DJBK No. 47 Tahun 2026 — Lampiran VI"`. Sudah HAMPIR PERSIS berbentuk `{bidang, source, note, items: [{code, name, unit, overhead_profit, components: [{resource_code, category, coefficient}]}]}` — cocok skema `AHSPItem` tanpa transformasi besar. |
| `G:\paax-data\harga-satuan\_resources_catalog.json` | Master **2.456 kode resource** (`{region, region_code, currency, source, resources: [{code, name, category, unit, price}]}`) — **SEMUA `price: 0`** (placeholder, BUKAN harga nyata). **JANGAN pernah diimpor sebagai region price book** — kalau dipakai sebagai `data/harga-satuan/*.json` baru, HSP akan terhitung ~0 padahal terlihat "lengkap", itu bahaya data palsu terselubung. Gunakan HANYA untuk cross-check nama/unit/kategori resource_code. |

Kalau path `G:\paax-data\...` tidak bisa diakses dari environment Anda: **STOP,
laporkan ke owner** — jangan mengarang isi katalog dari ingatan/tebakan.

**Peringatan penting soal karakter Unicode (supaya tidak salah diagnosis):**
saat memeriksa isi `cipta-karya-2026.json`, beberapa nama item memakai
karakter seperti U+2019 (’, tanda kutip kanan, dipakai sbg notasi "meter-prime"
`m’`/`m'`) dan U+2014 (—, em dash) di field `source`. Di terminal/shell
tertentu ini bisa TAMPIL sebagai `�` — **itu artefak rendering terminal,
BUKAN data korup.** Verifikasi selalu dengan `ord(c)`/`repr()` di Python
sebelum menyimpulkan sesuatu "rusak". JANGAN strip/ganti karakter ini.

---

## 1. FASE M (WAJIB, kerjakan duluan — kecil & jelas) — Perbaiki V-03

### 1.1 Akar masalah (sudah dibuktikan Codex sendiri di PR #30)

`_grid_fingerprint` (`validate.py` baris 54-60) membuat satu string sidik
jari dari **SELURUH** `sumbu_x`/`sumbu_y`/`bentang_x`/`bentang_y` per sheet.
`validate_tkg` (baris 96-102) menandai `E-GRID` keras kalau ADA sheet
"denah" yang fingerprint-nya beda dari sheet lain — padahal di gambar kerja
NYATA, sheet denah atap sering hanya menampilkan **sebagian** as dari sheet
denah pondasi (bukan salah baca, itu konvensi gambar biasa). Test
`test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid` sudah
membuktikan ini nyata (ditandai `xfail(strict=True)` sekarang).

### 1.2 Spesifikasi perbaikan (WAJIB diikuti, ini bukan saran longgar)

Ganti logika V-03 dari "samakan SELURUH fingerprint" menjadi
**"bandingkan HANYA label as yang muncul di kedua sheet"**:

1. Untuk setiap sheet berjenis "denah" yang punya grid, bangun **peta posisi
   per label** untuk `sumbu_x` dan `sumbu_y` terpisah:
   - Kalau `GridAxis.posisi_mm` terisi untuk SEMUA axis di keluarga itu →
     pakai langsung.
   - Kalau tidak (None untuk sebagian/semua) → turunkan dari rantai
     `bentang_x`/`bentang_y` dengan menjangkarkan axis PERTAMA di daftar
     `sumbu_x`/`sumbu_y` pada posisi 0, lalu akumulasi jarak antar-as
     berurutan (pola sama seperti `grid_distance_m` yang sudah ada,
     reuse logic-nya, jangan tulis ulang dari nol).
2. Untuk setiap PASANGAN sheet "denah" (atau sheet pertama sbg acuan vs
   sheet lain — pilih pendekatan yang lebih sederhana untuk diimplementasi
   dgn benar, keduanya sah selama hasil akhirnya sama untuk kasus test di
   §1.3), per keluarga sumbu (x lalu y terpisah):
   - Cari label yang ADA DI KEDUA peta posisi (irisan set label).
   - Kalau irisan KOSONG → tidak ada dasar perbandingan, JANGAN error
     (tidak ada bukti konflik ATAUPUN kecocokan).
   - Kalau irisan TIDAK kosong: untuk tiap label bersama, bandingkan posisi
     (dalam meter, pakai `ke_meter` yang sudah ada). Beda relatif
     `abs(posA - posB) / max(abs(posA), abs(posB), epsilon_kecil)` melebihi
     `params.tol_grid` (default 0.005 = 0.5%, field YANG SUDAH ADA, jangan
     bikin param baru) → `E-GRID` (asli, subject bisa berisi label as yang
     konflik + kedua sheet_id supaya pesan actionable). Kalau kedua posisi
     dekat 0 (di bawah toleransi absolut kecil, mis. 1mm) → anggap cocok
     tanpa pembagian (hindari div-by-zero).
   - Kalau SEMUA label bersama cocok → TIDAK ada error untuk pasangan itu,
     walau salah satu sheet punya label EKSTRA yang tidak ada di sheet lain
     (subset itu SAH).
3. Pertahankan `_cek_v02` (per-sheet total-bentang) APA ADANYA — itu sudah
   benar dan sudah punya test yang lolos, JANGAN disentuh.

### 1.3 Anchor test WAJIB (hitung ulang sendiri, jangan copy tanpa verifikasi)

1. **Test yang sudah ada** (`test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid`,
   `test_tkg.py` ±baris 181): sheet 1 (`buat_tkg()`) py sumbu_x A(0),B(3000),C(6500);
   sheet baru S06 sumbu_x B(posisi_mm=3000),C(posisi_mm=6500) — label bersama
   B,C, posisi SAMA persis → **HAPUS marker `xfail`, test ini HARUS lolos**
   (`gate_passed is True`, tidak ada `E-GRID`).
2. **Test BARU wajib** (belum ada, ini gap nyata — saat ini TIDAK ADA test
   yang membuktikan V-03 masih menangkap konflik SUNGGUHAN): buat 2 sheet
   "denah" yang SAMA-SAMA punya label "B" tapi posisi berbeda jauh (mis.
   sheet 1: B di 3000mm; sheet 2: B di 3500mm — beda 500mm dari basis 3000mm
   = 16,7%, jauh di atas toleransi 0,5%) → HARUS tetap `E-GRID`,
   `gate_passed is False`. Ini membuktikan perbaikan Anda tidak
   "melonggarkan jadi tidak pernah error sama sekali".
3. Test regresi: semua test V-02/V-04/V-05/V-08 yang sudah lolos (termasuk
   yang ditambah Fase K/K-2 sesi lalu) **harus tetap lolos tanpa perubahan**.

---

## 2. FASE N (WAJIB, kerjakan setelah M) — Impor katalog AHSP CK 2026 (10 batch)

### 2.1 Kenapa dipecah 10 batch, bukan sekali commit 2.542 item

Ini data KOEFISIEN RESMI (Permen PUPR/SE DJBK) yang akan langsung memengaruhi
angka RAB nyata kalau dipakai user — bukan sekadar file JSON teknis. Owner
secara eksplisit minta proses **10 batch @ ~250 item** supaya tiap batch bisa
DIREVIEW (oleh Claude) sebelum lanjut, bukan satu tumpukan 2.542 item yang
mustahil diperiksa teliti sekaligus. **Ini BUKAN 10 branch/PR terpisah** —
cukup SATU branch/PR, tapi proses kerja & laporan dipecah per-batch supaya
temuan bisa dibaca bertahap.

### 2.2 Pembagian batch (deterministik, ikuti persis)

```python
import json
data = json.load(open(r"G:\paax-data\ahsp\cipta-karya-2026.json", encoding="utf-8"))
items = data["items"]  # 2542
BATCH_SIZE = 255  # ceil(2542/10)
batches = [items[i*BATCH_SIZE:(i+1)*BATCH_SIZE] for i in range(10)]
# batch 1-9: 255 item; batch 10: sisa (247 item). Total tetap 2542.
```

### 2.3 Per batch (1 sampai 10), kerjakan urutan ini:

1. **Validasi schema**: setiap item WAJIB berhasil di-parse sebagai
   `AHSPItem` (Pydantic, `app/rab/models.py`) tanpa modifikasi field. Kalau
   ADA item yang gagal parse — itu temuan, catat kode+alasan, JANGAN
   dipaksakan lolos dengan mengubah nilai sumber tanpa lapor.
2. **Cross-check resource_code**: kumpulkan semua `resource_code` unik di
   batch ini, cocokkan ke `G:\paax-data\harga-satuan\_resources_catalog.json`
   (2.456 kode). Kode yang MUNCUL di AHSP tapi TIDAK ADA di master resource
   → catat sebagai temuan (`resource_code_tidak_dikenal`), JANGAN ditebak
   nama/kategorinya.
3. **Anomali nilai** (deteksi, JANGAN "perbaiki" sendiri): `coefficient <= 0`,
   `overhead_profit` di luar rentang [0, 0.15] (BUK maks 15% per Permen,
   `rab/models.py` baris 30 komentar), `name`/`unit` kosong, kode
   `resource_code` yang MUNCUL DUA KALI dengan koefisien SAMA persis dalam
   satu item (bisa jadi wajar, bisa jadi duplikasi sumber — catat sbg
   temuan utk Claude putuskan, jangan dihapus sepihak).
4. **Tulis temuan batch ini** ke file laporan kumulatif
   `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md` — tiap batch jadi satu
   section baru (`## Batch N (item {start}-{end})`), isi: jumlah item OK,
   jumlah gagal parse (dgn kode+alasan), jumlah `resource_code` tak dikenal
   (daftar kodenya), jumlah anomali nilai (dgn kode+detail). **JANGAN
   menyimpulkan "semua aman" tanpa benar-benar menjalankan ketiga cek di
   atas per item di batch tsb.**
5. **Lanjut ke batch berikutnya TANPA berhenti minta izin** (owner sudah
   bilang boleh jalan berurutan) — KECUALI kalau menemukan sesuatu yang
   benar-benar ambigu secara arsitektural (mis. format item yang sama
   sekali tidak cocok skema, bukan cuma satu-dua anomali nilai) — itu baru
   alasan sah berhenti & lapor duluan.

### 2.4 Setelah 10 batch selesai — gabungkan jadi 1 file di repo

- Tulis SELURUH 2.542 item (utuh, TIDAK dipecah 10 file di repo — pemecahan
  batch HANYA proses kerja, bukan struktur akhir) ke file BARU:
  `data/ahsp/cipta-karya-2026.json` dengan bentuk
  `{"bidang": "Cipta Karya", "source": "SE DJBK No. 47 Tahun 2026 — Lampiran VI (AHSP Bidang Cipta Karya)", "note": "Koefisien resmi. Harga (HSD) diisi terpisah dari SHSD regional.", "items": [...]}`
  (salin apa adanya dari sumber, JANGAN mengubah nilai koefisien — item yang
  ditemukan bermasalah di §2.3 TETAP disalin apa adanya, ditandai di laporan
  temuan, BUKAN dihapus/diperbaiki diam-diam dari repo).
- **JANGAN sentuh** `data/ahsp/cipta-karya.sample.json` — biarkan tetap ada,
  kode-nya dipakai 10 file test yang sudah ada (lihat tabel §0).
- **JANGAN** membuat file baru di `data/harga-satuan/` dari
  `_resources_catalog.json` — itu bukan tugas Fase N (lihat peringatan §0).

### 2.5 Test setelah impor (WAJIB)

1. `load_data()` memuat total >= 2542 + 4 item AHSP tanpa error, dan tidak
   ada `code` yang collision antara file sample lama & file baru (assert
   jumlah key unik di `store.ahsp` == jumlah gabungan, bukan lebih sedikit
   karena overwrite diam-diam).
2. Ambil 2-3 kode NYATA dari katalog baru (mis. `"1.1.1.1"`,
   `"1.1.1.2"` dari sample yang sudah Anda lihat) → `compute_hsp` /
   `/rab/hsp` untuk region yang BENAR-BENAR ADA (cek `GET /regions`
   dulu, JANGAN asumsikan "jateng" — kemungkinan besar hasilnya BANYAK
   `missing_resources` karena price book regional jauh lebih kecil dari
   2.429 kode unik yang dirujuk katalog baru — itu HASIL YANG BENAR &
   diharapkan, assert kondisi itu (mis. `coverage_ratio < 1.0` dgn pesan
   jelas), JANGAN dianggap bug.
3. Jalankan `GET /data/coverage` untuk region yang ada, catat angka
   `coverage_ratio` SEBELUM vs SESUDAH impor di laporan akhir — ini metrik
   jujur yang owner perlu lihat, bukan diklaim "selesai" begitu saja.
4. Test regresi: seluruh test lama yang bergantung pada
   `cipta-karya.sample.json` (10 file di §0) **harus tetap lolos tanpa
   perubahan sama sekali** pada test itu sendiri.

---

## 3. Hal lain dari prompt awal owner & rencana besar yang MASIH belum dikerjakan
(dicatat di sini supaya konteksnya jelas, TAPI **JANGAN dikerjakan di prompt
ini** — di luar cakupan Fase M/N, disebut supaya Anda tahu ini bukan
"terlupakan", memang sengaja ditunda dengan alasan masing-masing):

- **Fase D (deteksi simbol grafis/`count_simbol`)** — masih ditunda jujur
  sejak sesi lalu, simbol PLHUT dianggap terlalu spesifik-drafter untuk
  digeneralisasi aman. Belum ada informasi baru yang mengubah keputusan itu.
- **Fase L (AHSP auto-suggest otomatis)** — SEKARANG jadi lebih relevan
  setelah Fase N (katalog 2.542 item, bukan cuma 4 sample) — TAPI itu tugas
  TERPISAH untuk prompt SELANJUTNYA setelah Fase N ini selesai & direview
  Claude, supaya auto-suggest diuji terhadap katalog yang sudah bersih, bukan
  yang masih ada temuan mentah dari §2.3.
- **Vision-LLM fallback** (baca gambar raster/scan tanpa teks vektor) — masih
  arah masa depan (v1.0+ sesuai roadmap CLAUDE.md §6), belum waktunya.
- **Redesign visual besar** — masih ditunda ke sesi terpisah (Opus 4.8),
  tidak berubah dari instruksi owner sebelumnya.
- **Impor 2.456 resource master jadi price book region baru** — TIDAK
  disarankan sama sekali (lihat peringatan §0: semua price=0, akan
  menyesatkan) — kalau owner mau harga regional baru, itu perlu sumber
  harga SUNGGUHAN per resource, bukan dari file ini.

---

## 4. GERBANG REVIEW — branch & PR

```
git fetch origin
git log origin/main -3
```
Cek dulu apakah PR #29 & #30 sudah merge. Branch dari base yang paling
mutakhir yang sudah tersedia (`main` kalau keduanya sudah merge; kalau
belum, dari `origin/feat/rab-nav-validator-audit-ahsp-suggest`). Buat branch
baru (mis. `feat/v03-fix-ahsp-catalog-import`), buka PR ke `main`, **JANGAN
merge sendiri**.

---

## 5. Verifikasi WAJIB sebelum membuka PR

```powershell
cd services/core-engine
python -m pytest -q
# harapan: SEMUA lolos (termasuk xfail yang sekarang jadi passed setelah
# Fase M — HAPUS marker xfail, jangan biarkan dobel ditandai xfail padahal
# sudah lolos), jumlah bertambah dari 242 karena test baru Fase M & N.

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: tidak berubah dari 46 passed — fase ini tidak menyentuh frontend.

cd ../services/document-intelligence
python -m pytest -q
# harapan: tidak berubah dari baseline (126 passed + 5 skipped) — service
# ini tidak disentuh fase ini.
```

---

## 6. Batasan tegas

- **Fase M**: JANGAN ubah `_cek_v02` atau param baru selain reuse
  `tol_grid`. JANGAN buat tolerance baru tanpa alasan kuat.
- **Fase N**: JANGAN ubah nilai koefisien/nama/unit apa pun dari sumber
  `cipta-karya-2026.json` — salin apa adanya, catat temuan di laporan,
  BUKAN "perbaiki" sendiri. JANGAN sentuh `cipta-karya.sample.json`. JANGAN
  impor `_resources_catalog.json` sebagai price book.
- **TIDAK ADA LLM** di proses validasi/impor — semua mekanis/deterministik.
- **TIDAK mengerjakan** Fase D, Fase L, vision-LLM fallback, atau redesign
  visual — semua di luar cakupan (lihat §3).
- Boleh jalan M → N (10 batch) berurutan tanpa berhenti minta izin, KECUALI
  menemukan masalah arsitektural nyata (skema sama sekali tidak cocok,
  bukan sekadar anomali nilai per-item).

---

## 7. Setelah selesai — laporkan ke owner

1. Branch + PR link + base branch yang dipakai.
2. Fase M: bukti anchor §1.3 lolos (termasuk test konflik-sungguhan yang
   baru), xfail marker sudah dihapus.
3. Fase N: ringkasan 10 batch (jumlah OK/gagal-parse/resource-tak-dikenal/
   anomali per batch, link ke `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`
   lengkap untuk saya baca detail), angka coverage_ratio sebelum/sesudah.
4. Hasil test semua service (angka pasti, bukan "semua hijau" tanpa angka).
5. Temuan jujur apa pun yang menurut Anda perlu keputusan Claude/owner
   sebelum data ini dipakai user sungguhan — jangan disembunyikan.
