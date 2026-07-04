# PROMPT CODEX — Fase O/P: Tutup Gap Satuan AHSP (188 item) + Lanjutkan Harga Semarang

> Ditulis Claude, 2026-07-10. PR #32 (Fase M-2, perbaikan V-03 relatif) sudah
> saya verifikasi ULANG penuh: saya jalankan skrip reproduksi yang sama
> persis di kode hasil fix — hasilnya `ok=True gate_passed=True []`, cocok
> klaim laporan. 251 test core-engine + 46 web semua saya jalankan sendiri,
> cocok. **Fase M-2 genuinely benar, tidak ada yang dikarang.**
>
> Prompt ini 2 pekerjaan BARU, sama beratnya dengan impor AHSP 2.542 item
> (Fase N) — bukan "beres-beres kecil". Keduanya **data resmi, bukan
> spekulasi**: saya temukan sumber PDF asli & file Excel asli yang belum
> pernah dipakai penuh.

---

## 0. WAJIB BACA DULU

1. `CLAUDE.md` §1, §9 — kerja data AHSP/harga = domain Claude; Codex di sini
   MENGUSULKAN dengan bukti, TIDAK memutuskan/menerapkan sendiri nilai akhir.
2. `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md` — daftar 197 anomali
   dari Fase N (188 item `unit` kosong + 9 duplikasi resource dalam 1 item).
3. `report/REPORT_FASE_M_N_V03_FIX_AHSP_IMPORT_CODEX_2026-07-08.md` dan
   `report/REPORT_FASE_M2_V03_RELATIVE_FIX_CODEX_2026-07-09.md` — histori.
4. `docs/ai-map/STATE.md` — status terkini.

**Temuan saya sendiri (sudah diverifikasi, JANGAN diverifikasi ulang dari
nol, cukup lanjutkan):**

- **9 duplikasi resource dalam 1 item** (mis. `1.1.1.1` resource `L.02`
  muncul 2x dengan koefisien sama) **SUDAH saya cek: itu BUKAN bug.**
  `services/core-engine/app/rab/rab.py` fungsi `compute_hsp` (baris ±38-63)
  menjumlahkan SETIAP baris `item.components` apa adanya — resource_code
  yang sama muncul 2x akan dihitung 2x secara BENAR (itu memang konvensi
  dokumen AHSP resmi: satu kode tenaga/bahan bisa muncul di lebih dari satu
  baris analisa untuk peran berbeda). **Tugas Anda soal ini HANYA**: tambah
  1 test yang membuktikan `compute_hsp` menjumlahkan duplikat dengan benar
  (pakai salah satu kode nyata spt `1.1.1.1`), lalu tutup temuan ini di
  laporan sebagai "diverifikasi, bukan bug". **Jangan menghapus/mengubah**
  baris duplikat di `data/ahsp/cipta-karya-2026.json`.
- **188 item `unit` kosong ADALAH gap nyata**, dan saya temukan sumber
  OTORITATIF untuk menutupnya: **16 file PDF asli** ada di
  `G:\AHSP\Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya-{1..16}.pdf`
  — ini dokumen sumber ASLI yang dipakai membuat `cipta-karya-2026.json`.
  Saya sample beberapa nama item yang unit-nya kosong dan pola satuan
  SERING sudah tersirat di teks nama itu sendiri, contoh nyata (saya baca
  langsung dari `cipta-karya-2026.json`):
  - `1.1.4.1`: `"Pengukuran Ulang Topografi Seluas 1 Ha"` → satuan jelas **Ha**.
  - `9.1.1.1`: `"Pemasangan 1 m Pipa PVC, DN. 2-1/2\" (65 mm) Jumlah"` → **m**.
  - `9.6.1.1`: `"Pemasangan 1 m Pipa Beton, DN. 8\" (200 mm)"` → **m**.
  - `10.3.1`: `"Pekerjaan Perakitan Panel dan Alat Sambung Modul T36 RISHA"`
    → TIDAK jelas dari nama saja, butuh cek PDF asli.
  - `1.1.3.10`: `"Gali dan cabut 1 tunggul pohon..."` → kemungkinan
    **buah**/**pohon**, TIDAK 100% pasti dari nama saja, cek PDF.

---

## 1. FASE O (WAJIB) — Tutup gap 188 item `unit` kosong

### 1.1 Sumber & metode (urutan prioritas kepercayaan)

1. **Prioritas 1 — PDF resmi**: ekstrak teks 16 PDF di `G:\AHSP\` (pakai
   PyMuPDF `fitz`, sudah jadi dependency di repo lewat document-intelligence
   — install `PyMuPDF` di venv core-engine kalau belum ada, itu wajar utk
   tugas ini). **JANGAN pakai `G:\AHSP\extract_text.py` mentah-mentah** —
   script itu cuma dump teks polos tanpa jaga batas kode/tabel, akan susah
   dicari; tulis ekstraksi Anda sendiri yang MENYIMPAN teks per-halaman +
   urutan asli, supaya bisa mencari teks "kode X ... Satuan: Y" di sekitar
   posisi kemunculan kode. Untuk tiap 188 kode bermasalah, cari kemunculan
   kode itu di teks hasil ekstraksi, ambil ±500 karakter konteks di sekitarnya,
   cari pola satuan resmi (kata "Satuan" diikuti nilai, atau tabel dgn kolom
   Satuan). Kalau ketemu dgn yakin → catat kode, satuan yang ditemukan, DAN
   kutipan konteks mentah sbg bukti (jangan cuma klaim, tunjukkan buktinya).
2. **Prioritas 2 — pola nama item** (kalau PDF tidak memberi kepastian):
   cari frasa satuan yang tersirat literal di `name`, contoh pola yang SAH
   dipakai (bukan tebakan bebas): `"Seluas 1 <X>"` → X; `"Pemasangan 1 <X>
   Pipa"` → X; `"per <X>"`; angka+satuan yang diulang di beberapa item
   sejenis (mis. semua "Pemasangan 1 m Pipa ..." di grup 9.x.1.x kemungkinan
   besar `unit="m"` atau sesuaikan dgn satuan lain di grup sejenis yang
   SUDAH ada unit-nya — cek apakah ada item SEJENIS di kode berdekatan yang
   sudah py unit terisi, jadikan referensi silang).
3. **Prioritas 3 — tidak terselesaikan**: kalau prioritas 1 & 2 sama-sama
   tidak memberi kepastian wajar → tandai eksplisit "TIDAK TERSELESAIKAN,
   butuh keputusan Claude/owner", JANGAN dipaksakan isi asal.

### 1.2 Output — usulan, BUKAN penerapan langsung

Tulis laporan `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md` berisi,
untuk SETIAP 188 kode, satu baris:
`kode | nama (dipotong) | satuan_diusulkan | sumber (PDF halaman N / pola-nama / tidak-ketemu) | bukti/kutipan singkat`

Kelompokkan di akhir laporan jadi 3 bagian ringkas: (a) ditemukan pasti di
PDF resmi (jumlah), (b) diinfer dari pola nama (jumlah), (c) tidak
terselesaikan (jumlah + daftar kode). **JANGAN ubah `data/ahsp/cipta-karya-
2026.json` di prompt ini** — itu keputusan penerapan yang saya (Claude)
lakukan setelah membaca laporan Anda, sama seperti Fase N. Tugas Anda
berhenti di USULAN + bukti, bukan komit nilai final.

### 1.3 Test

Tambahkan 1 test yang memverifikasi laporan (a) benar-benar dihasilkan
(mis. file ada, jumlah baris = 188) dan (b) tidak ada kode yang tercecer
(semua 188 kode dari `AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md` muncul persis
sekali di laporan baru). Plus 1 test untuk temuan duplikasi resource (lihat
§0) yang membuktikan `compute_hsp` menjumlahkan duplikat dengan benar.

---

## 2. FASE P (WAJIB) — Lanjutkan pemetaan harga Semarang (68 baris belum cocok)

### 2.1 Konteks nyata yang saya temukan

Ada pekerjaan SEBELUMNYA (Fase A-2, sebelum sesi-sesi ini) yang MEMPROSES
sumber harga nyata `G:\AHSP\Daftar harga bahan dan upah.xlsx` (96 baris,
sheet "Lembar1", kolom termasuk "HARGA") menjadi pemetaan ke katalog resource.
Manifest hasilnya ada di `G:\paax-data\_audit\harga_semarang.json`:
- `matched_rows: 26` (`unique_matched_resources: 23`) — SUDAH masuk
  `data/harga-satuan/semarang_overrides.json` (2 override manual) dan
  entah di mana sisa 21 lainnya (**cek dulu**: apakah `semarang.json` di
  `G:\paax-data\harga-satuan\` — 23 resource — adalah hasil gabungan yang
  sudah lengkap dari 26 matched rows itu; **JANGAN duplikasi kerja**, cukup
  konfirmasi file mana yang jadi sumber kebenaran saat ini).
- `unmatched_rows: 68` — **BELUM PERNAH DIPETAKAN**, ini pekerjaan yang
  harus Anda lanjutkan.
- `ambiguous_rows: 2` — kandidat ganda, perlu keputusan domain.
- `review_path`: `G:\paax-data\_audit\harga_semarang_review.csv` — cek isi
  file ini dulu, kemungkinan besar SUDAH berisi daftar baris unmatched siap
  pakai (jangan regenerasi dari nol kalau sudah ada).

### 2.2 Tugas Anda

1. Baca `harga_semarang_review.csv` (atau regenerasi via
   `G:\AHSP\Daftar harga bahan dan upah.xlsx` + `_resources_catalog.json`
   kalau file review ternyata sudah usang/tidak sesuai 68 baris yang
   disebut manifest — CEK DULU, jangan asumsi).
2. Untuk 68 baris unmatched: coba cocokkan ke `_resources_catalog.json`
   (2.456 kode) pakai pendekatan yang SAMA seperti yang sudah dipakai
   sebelumnya (`policy` di manifest: kategori+unit, nama ternormalisasi,
   token-subset/Jaccard). **Reuse pendekatan yang sudah terbukti dipakai**,
   jangan reinvent algoritma matching dari nol.
3. Untuk match yang YAKIN (skor tinggi, tidak ambigu) → usulkan
   `{source_name, code, catalog_name, harga_dari_excel}` — JANGAN langsung
   tulis ke `data/harga-satuan/semarang.json`, taruh di laporan usulan dulu.
4. Untuk yang TETAP tidak ketemu/ambigu → tetap di daftar "belum
   terselesaikan", JANGAN dipaksakan.
5. **PENTING — batasan yang sudah ditulis di `semarang_overrides.json`**:
   ada catatan "jangan isi item yang butuh judgment domain seperti mutu
   beton, watt lampu, atau varian keramik yang belum jelas" dan contoh kasus
   granit 60x60 (2 varian harga, sengaja cuma 1 dipetakan supaya tidak
   collision) — **ikuti prinsip yang sama**: kalau 1 nama sumber bisa
   cocok ke >1 kode katalog dgn arti berbeda (varian/kualitas beda), JANGAN
   pilih sepihak, masukkan ke daftar ambigu utk saya putuskan.
6. Tulis laporan `report/HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md`
   dgn format: baris matched-diusulkan (source_name, kode, catalog_name,
   harga, skor kecocokan), baris ambigu (nama sumber + daftar kandidat kode
   + alasan ambigu), baris tidak ketemu.

### 2.3 Test

Test yang memverifikasi laporan dihasilkan lengkap (68 baris dari sumber
tercatat semua, tidak ada yang hilang), dan test bahwa pendekatan matching
Anda (kalau ditulis sbg fungsi baru, bukan cuma skrip sekali-pakai) punya
unit test dgn 3-5 kasus jelas (1 match pasti, 1 ambigu, 1 tidak ketemu).

---

## 3. Batasan tegas (kedua fase)

- **JANGAN** menerapkan/menulis nilai akhir (unit AHSP atau harga Semarang)
  langsung ke file yang dipakai produksi (`data/ahsp/cipta-karya-2026.json`,
  `data/harga-satuan/semarang.json`) — SEMUA lewat laporan usulan dulu,
  saya (Claude) yang menerapkan setelah review, PERSIS pola Fase N.
- **JANGAN** menebak satuan/harga tanpa bukti tertulis (kutipan PDF, atau
  pola nama yang konsisten lintas item sejenis, atau baris Excel asli) —
  kalau tidak yakin, masuk daftar "tidak terselesaikan", itu jawaban SAH.
- **JANGAN** sentuh Fase M/M-2 (`validate.py`) atau Fase N (isi katalog AHSP
  yang sudah benar) — di luar cakupan.
- **TIDAK ADA LLM** di proses pencarian/pencocokan — regex/token-matching/
  pembacaan PDF teks biasa, semua deterministik & bisa diaudit ulang.
- Boleh jalan Fase O lalu Fase P berurutan tanpa berhenti minta izin,
  KECUALI menemukan file yang disebut (`harga_semarang_review.csv`, dll.)
  ternyata tidak ada/tidak bisa diakses — itu alasan sah berhenti & lapor.

---

## 4. Verifikasi WAJIB

```powershell
cd services/core-engine
python -m pytest -q
# harapan: semua lolos, naik dari 251 karena test baru Fase O/P.

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: tidak berubah (46 passed) -- fase ini tidak menyentuh frontend.

cd ../services/document-intelligence
python -m pytest -q
# harapan: tidak berubah (126 passed + 5 skipped).
```

---

## 5. GERBANG REVIEW

Cek dulu apakah PR #29/#30/#31/#32 sudah merge (`git log origin/main -5`).
Branch dari base paling mutakhir yang tersedia. Branch baru (mis.
`feat/ahsp-unit-gap-semarang-price-batch2`), PR ke `main`, **JANGAN merge
sendiri**.

---

## 6. Setelah selesai — laporkan ke owner

1. Branch + PR link + base yang dipakai.
2. Fase O: ringkasan 3 kelompok (pasti-dari-PDF / infer-dari-nama / tidak
   terselesaikan) dgn jumlah tiap kelompok, link laporan lengkap.
3. Fase P: ringkasan matched-diusulkan / ambigu / tidak ketemu dari 68
   baris, link laporan lengkap, konfirmasi file `semarang.json` mana yang
   jadi acuan (hindari duplikasi kerja Fase A-2 lama).
4. Hasil test lengkap tiap service (angka pasti).
5. Konfirmasi eksplisit: tidak ada nilai unit/harga final yang ditulis
   langsung ke file produksi — semua lewat laporan usulan untuk saya review.
