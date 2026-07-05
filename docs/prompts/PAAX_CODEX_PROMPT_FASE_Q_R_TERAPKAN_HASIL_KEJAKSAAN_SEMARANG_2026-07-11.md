# PROMPT CODEX — Fase Q/R: Terapkan Hasil Fase O/P + Sumber Harga Kedua (KEJAKSAAN)

> Ditulis Claude, 2026-07-11. PR #33 (Fase O/P) sudah saya verifikasi
> **dua arah, bukan cuma baca laporan**: saya jalankan ulang kedua script
> (`scripts/ahsp/resolve_unit_gap.py`, `scripts/harga/semarang_batch2_report.py`)
> dari nol — hasilnya **byte-per-byte identik** dengan laporan yang di-commit.
> Untuk Fase O saya juga buka sendiri PDF resmi (`Lampiran...-1.pdf` halaman
> 46) dan baca teks mentahnya — cocok persis klaim. **Fase O/P genuinely
> solid, tidak ada yang dikarang.**
>
> Prompt ini **2 fase**: **Fase Q** (WAJIB) menerapkan hasil yang SUDAH saya
> verifikasi ke file produksi (mekanis, saya sudah putuskan nilainya — Anda
> tinggal terapkan + tes). **Fase R** (WAJIB, tugas baru) menggali sumber
> harga NYATA KEDUA yang belum pernah dipakai sama sekali — saya temukan file
> proyek pemerintah sungguhan (`G:\AHSP\KEJAKSAAN.xlsx`) yang selama ini
> hanya dipakai sbg template export, padahal isinya 121 baris harga bahan/
> upah nyata dari kota yang SAMA (Semarang) — belum pernah ditambang.

---

## 0. WAJIB BACA DULU

1. `CLAUDE.md` §1, §9.
2. `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md` — 188 usulan satuan
   (SEMUA sudah saya verifikasi, status "ditemukan pasti di PDF resmi").
3. `report/HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md` — 2 match diusulkan,
   4 ambigu, 62 tidak ketemu (sudah saya verifikasi).
4. `scripts/ahsp/resolve_unit_gap.py`, `scripts/harga/semarang_batch2_report.py`,
   `scripts/harga/extract_harga.py` — logic yang SUDAH ada, reuse jangan
   ditulis ulang.
5. `services/core-engine/app/rab/loader.py`, `app/rab/models.py` (`ResourcePrice`).

**Temuan tambahan saya (penting, WAJIB paham sebelum Fase Q.2):**
Saat mengecek `data/harga-satuan/` di repo, **tidak ada file `semarang.json`
sama sekali** — hanya `semarang_overrides.json` (bentuknya BEDA, cuma
pemetaan nama→kode, BUKAN daftar harga). Artinya region "semarang" saat ini
ADA terdaftar (`store.regions["semarang"]` via glob) tapi **price book-nya
KOSONG** (karena `semarang_overrides.json` tidak punya key `"resources"`,
loader mengembalikan `{}`untuk key itu). Sumber harga real Semarang yang
SUDAH ADA hasil kerja lama (Fase A-2, di luar repo) ada di
`G:\paax-data\harga-satuan\semarang.json` — **23 resource, sudah saya cek
skemanya benar (cocok `ResourcePrice`)** — tapi **belum pernah disalin ke
repo**. Ini bukan pekerjaan baru yang saya minta dikarang, ini menyalin
pekerjaan lama yang sudah ada tapi belum masuk repo, plus menambah 2 hasil
baru dari Fase P.

---

## 1. FASE Q (WAJIB) — Terapkan hasil yang SUDAH saya verifikasi

### Q.1 Terapkan 188 satuan AHSP

1. Baca `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md` tabel "Detail 188
   Kode" (parsing via marker HTML comment `<!-- unit-gap-code:KODE -->` yang
   sudah ada persis untuk keperluan ini — reuse, jangan re-parse tabel
   markdown mentah yang rawan salah split kolom).
2. Untuk SETIAP 188 kode: di `data/ahsp/cipta-karya-2026.json`, set
   `unit` = nilai di kolom "Satuan diusulkan" utk kode itu. **JANGAN ubah
   field lain** (name, components, overhead_profit, dst) sama sekali.
3. Verifikasi setelah selesai: 0 item tersisa dengan `unit=""` di seluruh
   2.542 item (assert eksplisit di test), dan **188 item yang diubah
   PERSIS** cocok kode dari laporan (tidak lebih, tidak kurang) — kalau ada
   selisih, itu tanda ada kode salah ketik, STOP dan laporkan, jangan
   dipaksakan.

### Q.2 Import penuh region "semarang" ke repo (23 resource lama + 2 baru)

1. Salin `G:\paax-data\harga-satuan\semarang.json` (23 resource) MENJADI
   `data/harga-satuan/semarang.json` di repo — ini file yang PERTAMA KALI
   masuk repo, bukan modifikasi existing (schema-nya sudah saya cek benar:
   `{region, region_code, currency, source, effective_date, resources:
   [{code,name,category,unit,price}]}`, salin apa adanya).
2. Tambahkan 2 resource BARU dari `report/HARGA_SEMARANG_BATCH2_FINDINGS_
   2026-07-10.md` bagian "Matched Diusulkan" (parsing via marker
   `<!-- semarang-batch2-source-row:N -->`, reuse) ke `resources` list file
   itu — total jadi **25 resource**:
   - `M.GEN.0085` (nama katalog "Baja Profil", harga dari Excel = **12000**,
     kategori & unit ikuti data resource di `_resources_catalog.json`
     kode itu — JANGAN asal isi category/unit, ambil dari master).
   - `M.GEN.0456` (nama katalog "Sealtape", harga dari Excel = **10000**,
     sama, ambil category/unit dari master).
3. **JANGAN** memasukkan 4 item ambigu (Wiremesh, Kran air, 2 varian
   Keramik) — itu masih perlu keputusan domain saya, TETAP di luar file ini.
4. **JANGAN** mengubah `semarang_overrides.json` — biarkan seperti sekarang,
   itu dokumentasi historis Fase A-2, bukan bagian yang dibaca loader
   sebagai price book.

### Q.3 Test wajib

1. `load_data()` sekarang memuat region "semarang" dengan **25** resource
   (bukan 0). `store.regions["semarang"]` tidak kosong.
2. `audit_data_coverage` untuk region "semarang" terhadap katalog AHSP CK
   2026 — catat angka SEBELUM (0 resource priced) vs SESUDAH (25 resource
   priced) di laporan akhir — **jangan klaim coverage tinggi**, dengan
   cuma 25 dari ±2.429 kode unik, `coverage_ratio` akan tetap sangat kecil,
   itu WAJAR dan jujur, sama seperti kasus jateng di Fase N.
3. Test bahwa 188 item AHSP yang tadinya `unit=""` sekarang semuanya terisi
   (assert langsung ke file, bukan cuma sampel).
4. Regresi: semua test lama (termasuk `test_ahsp_import_2026.py`,
   `test_katalog_ck_2026_price_binding_jujur_banyak_missing_resources` dkk)
   tetap lolos — kalau ada yang gagal karena asumsi lama soal semarang
   kosong, itu WAJAR berubah (region semarang sekarang punya isi), perbaiki
   assert-nya supaya mencerminkan kondisi baru yang benar, bukan dihapus.

---

## 2. FASE R (WAJIB) — Tambang sumber harga kedua: KEJAKSAAN.xlsx

### 2.1 Konteks temuan saya

`G:\AHSP\KEJAKSAAN.xlsx` adalah RAB proyek pemerintah SUNGGUHAN:
**"Pembangunan Kantor Cabang Kejaksaan Negeri Semarang"**, lokasi Jln. Puri
Anjasmoro Raya, **Semarang Barat**, TA 2024 — proyek NYATA di kota YANG SAMA
dengan region "semarang" yang baru diisi di Fase Q, sumber KEDUA yang
independen dari `Daftar harga bahan dan upah.xlsx` yang sudah dipakai
Fase A-2/P. Sheet `HARGA BAHAN` (dimensi A1:J219) berisi **121 baris** data
harga (unit+harga terisi, sudah saya cek: baris 12 `Pekerja | OH | 102000`,
dst — format sama dgn `Daftar harga bahan dan upah.xlsx`, kolom SATUAN di
kol E, HARGA di kol F). File ini SEBELUMNYA hanya dipakai sbg **template
export** (per catatan lama), isi harganya belum pernah ditambang.

### 2.2 Tugas Anda

1. Ekstrak 121 baris `HARGA BAHAN` (nama, satuan, harga) — reuse parser
   Excel yang sudah ada polanya di `scripts/harga/` (cek
   `_generate_surakarta_from_alfa.py` di `data/harga-satuan/` sbg contoh
   pola baca Excel harga→JSON yang sudah pernah dipakai, atau
   `scripts/harga/extract_harga.py` kalau lebih relevan — pakai salah satu
   yang paling cocok, jangan tulis parser Excel dari nol tanpa cek dulu).
2. Cocokkan ke `_resources_catalog.json` (2.456 kode) pakai
   `normalize_name`/`normalize_unit`/`_numbers_compatible` dari
   `scripts/harga/extract_harga.py` — **PERBAIKAN WAJIB** dari metode
   Fase P: kalau hasilnya "tidak ketemu" (tidak ada exact/partial match),
   **tetap tampilkan kandidat TERDEKAT yang gagal filter** (mis. kode +
   nama + alasan spesifik kenapa ditolak: "unit beda", "kategori beda",
   "angka tidak cocok (diameter/ukuran)") di kolom laporan — JANGAN
   dikosongkan begitu saja. **Alasan**: saya sendiri menemukan kasus nyata
   di Fase P (`Baja tulangan polos U-24`, row 65) yang punya 2 kandidat
   dekat (`M.GEN.0138`/`M.GEN.0141`, beda tingkatan diameter) tapi HILANG
   dari laporan karena masuk "tidak ketemu" tanpa jejak kandidatnya — saya
   harus cari manual sendiri ke katalog utk menemukan itu. Jangan ulangi
   kekurangan ini di Fase R.
3. **Cross-check dengan region "semarang" yang baru diisi di Fase Q**: untuk
   kode resource yang SAMA-SAMA muncul di kedua sumber (KEJAKSAAN vs
   `Daftar harga bahan dan upah.xlsx`/25-resource semarang.json) — bandingkan
   HARGA-nya (dua proyek Semarang, tahun sama 2024). Kalau beda jauh (mis.
   >15%), catat sbg "perlu ditinjau" (bisa jadi beda supplier/kualitas,
   BUKAN otomatis salah satu benar satu salah) — JANGAN dirata-rata atau
   dipilih sepihak yang mana yang "benar".
4. Tulis laporan `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`: ringkasan
   jumlah matched/ambigu/tidak-ketemu (dengan kandidat dekat kalau ada),
   dan bagian terpisah "Perbandingan dengan sumber Semarang lain" (kode yg
   overlap + harga dari kedua sumber + selisih %).
5. **JANGAN** menerapkan apa pun ke `data/harga-satuan/semarang.json` di
   Fase R ini — SEMUA masih usulan, saya yang putuskan penerapannya di
   sesi review berikutnya (persis pola O/P → Q).

### 2.3 Test

1. Laporan memuat SEMUA 121 baris sumber (tidak ada yang tercecer).
2. Minimal 1 test yang membuktikan kandidat-dekat SEKARANG muncul di baris
   "tidak ketemu" (bukan kosong) — pakai kasus nyata yang mirip skenario
   "Baja tulangan polos" kalau muncul lagi di 121 baris ini, atau kasus
   sintetis kalau tidak ada yang persis sama.
3. Test perbandingan harga: minimal 1 kasus sintetis yang membuktikan kode
   sama dengan harga beda >15% ditandai "perlu ditinjau", BUKAN
   dirata-ratakan diam-diam.

---

## 3. Batasan tegas (kedua fase)

- **Fase Q**: HANYA menyalin nilai yang SUDAH saya verifikasi/putuskan
  (188 satuan dari laporan Fase O, 23+2 resource Semarang) — TIDAK ADA
  keputusan baru yang Anda buat sendiri di sini.
- **Fase R**: HANYA usulan + laporan, TIDAK menulis ke
  `data/harga-satuan/semarang.json` sama sekali.
- **JANGAN** sentuh Fase M/M-2/N yang sudah selesai & benar.
- **JANGAN** memilih sepihak salah satu dari 4 item ambigu Fase P atau
  kasus harga-beda-jauh Fase R — semua tetap terbuka utk saya.
- **TIDAK ADA LLM**, semua deterministik/dapat diaudit ulang.
- Boleh Q lalu R berurutan tanpa berhenti minta izin, KECUALI file
  `KEJAKSAAN.xlsx` ternyata tidak terbaca/rusak — itu alasan sah berhenti.

---

## 4. Verifikasi WAJIB

```powershell
cd services/core-engine
python -m pytest -q
# harapan: semua lolos, bertambah dari 258 karena test baru Q & R.

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: tidak berubah (46 passed).

cd ../services/document-intelligence
python -m pytest -q
# harapan: tidak berubah (126 passed + 5 skipped).
```

---

## 5. GERBANG REVIEW

Cek `git log origin/main -6` utk status merge PR #29-#33. Branch dari base
paling mutakhir yang tersedia. Branch baru (mis.
`feat/ahsp-unit-apply-semarang-import-kejaksaan`), PR ke `main`, **JANGAN
merge sendiri**.

---

## 6. Setelah selesai — laporkan ke owner

1. Branch + PR link + base yang dipakai.
2. Fase Q: konfirmasi 188 unit diterapkan (0 tersisa kosong), region
   semarang sekarang 25 resource, angka coverage sebelum/sesudah.
3. Fase R: ringkasan matched/ambigu/tidak-ketemu dari 121 baris KEJAKSAAN
   (dengan kandidat dekat utk yang tidak ketemu), hasil perbandingan harga
   overlap dengan sumber semarang lain (kode + selisih % kalau ada).
4. Hasil test lengkap tiap service.
5. Temuan jujur apa pun yang perlu keputusan saya sebelum diterapkan.
