# PROMPT CODEX — Fase S: Tutup Siklus Harga Semarang + Perbaikan Kecil Matcher

> Ditulis Claude, 2026-07-12. PR #34 (Fase Q/R) sudah saya verifikasi PENUH:
> saya jalankan ulang `resolve_unit_gap.py` DAN `kejaksaan_semarang_report.py`
> dari nol — **keduanya byte-per-byte identik** dengan hasil yang di-commit.
> 264 test core-engine, 46 web saya jalankan sendiri, cocok. `unit` kosong
> di katalog AHSP: **0 tersisa** (diverifikasi langsung ke file).
>
> **Koreksi penting atas ekspektasi saya sendiri**: saya kira KEJAKSAAN.xlsx
> akan menambah cakupan harga Semarang secara signifikan. Setelah saya cek
> manual (bandingkan 24 kode "matched aman" KEJAKSAAN vs 25 resource yang
> sudah ada di `data/harga-satuan/semarang.json`): **0 kode baru** — SEMUA
> 24 kode yang cocok ternyata SUDAH ada di price book. Nilainya cuma
> validasi silang (harga dari 2 proyek Semarang beda tahun sama-sama cocok,
> 0 selisih >15%) — itu tetap berguna (menaikkan keyakinan data), tapi BUKAN
> ekspansi cakupan seperti saya kira. Prompt ini hanya perbaikan kecil +
> penutupan status, BUKAN pekerjaan besar baru — pekerjaan besar berikutnya
> ada di prompt terpisah `PAAX_CODEX_PROMPT_FASE_T_AHSP_AUTO_SUGGEST_2026-07-12.md`.

---

## 0. WAJIB BACA DULU

1. `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`, `scripts/harga/
   kejaksaan_semarang_report.py` — khususnya fungsi `nearest_rejected_
   candidates` (baris ±131-155) dan `_safe_candidate` (baris ±72-95).
2. `report/REPORT_FASE_Q_R_TERAPKAN_HASIL_KEJAKSAAN_SEMARANG_CODEX_2026-07-11.md`.

**Temuan konkret saya (sudah diverifikasi, jangan diverifikasi ulang, cukup
perbaiki)**: baris 71 "Kloset jongkok porselen" (KEJAKSAAN) berakhir di
"Tidak Ketemu Aman" padahal katalog PUNYA `M.GEN.0450` bernama "Kloset
Jongkok" dengan harga PERSIS SAMA (350000, sudah ada duluan di
`semarang.json` dari override manual Fase A-2). Akar masalah: field `unit`
resource itu di `_resources_catalog.json` tertulis **"unit"** (label
generik), BUKAN "buah" — jadi `unit_score` untuk kandidat ini = 0, dan lima
kandidat LAIN yang unit-nya "buah" (tapi nama-nya lebih jauh, mis. "Porselen
11x11") menang di ranking top-5 `nearest_rejected_candidates`, menutupi
kandidat yang sebenarnya paling tepat.

---

## 1. FASE S.1 — Perbaiki ranking kandidat-dekat di kedua script matcher

`scripts/harga/kejaksaan_semarang_report.py` (`nearest_rejected_candidates`)
DAN `scripts/harga/semarang_batch2_report.py` (kalau ada logic serupa, cek
dulu) — tambahkan: **selalu sertakan kandidat dengan skor kemiripan NAMA
tertinggi (token overlap/similarity) minimal 1, TERLEPAS dari unit_score**,
selain top-5 hasil ranking gabungan yang sudah ada. Tujuannya: kandidat yang
namanya paling mirip TIDAK PERNAH hilang dari daftar hanya karena field unit
di master catalog kebetulan berbeda/generik — biar manusia (saya) tetap
lihat "kandidat nama-mirip #1" meski unit-nya tidak klop, dengan alasan
eksplisit spt "unit beda (unit vs buah) — cek apakah label unit di katalog
master salah/generik". **JANGAN mengubah keputusan match final (`matched`/
`ambigu`/`tidak_ketemu`)** — ini MURNI memperkaya apa yang ditampilkan di
kolom kandidat, bukan mengubah logic keputusan otomatis.

### Test wajib
Reproduksi kasus nyata di atas sbg test: baris "Kloset jongkok porselen"
(atau fixture sintetis setara) HARUS menampilkan `M.GEN.0450` di daftar
kandidat "tidak ketemu" setelah perbaikan (sebelumnya tidak muncul). Jalankan
ulang `python scripts/harga/kejaksaan_semarang_report.py` setelah perbaikan,
tempel potongan baris 71 yang baru di laporan akhir sbg bukti.

---

## 2. FASE S.2 — Tutup status resmi jalur harga Semarang di dokumentasi

Update `docs/ai-map/STATE.md` dan `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_
BIG_PLAN_2026-07-05.md` (atau file status harga yang relevan kalau sudah
dipisah) dengan catatan JUJUR:
- Region "semarang" sekarang punya 25 resource nyata (dari 2 sumber real
  project, tervalidasi silang, 0 sengketa harga).
- **Dua sumber lokal yang tersedia (`Daftar harga bahan dan upah.xlsx`,
  `KEJAKSAAN.xlsx`) sudah HABIS ditambang** — penambahan cakupan lebih
  lanjut butuh sumber harga BARU (bukan menambang ulang 2 file yang sama),
  itu bukan tugas otomatis, perlu sumber data baru dari owner.
- Coverage AHSP CK 2026 utk region manapun MASIH sangat kecil (25/2.441
  utk semarang, 109/2.441 utk surakarta) — ini keterbatasan data yang
  jujur, bukan kegagalan teknis pipeline.
- 8 item ambigu (4 dari Fase P: Wiremesh, Kran air, 2 varian Keramik; 4 dari
  Fase R: Tukang Cat, Paku, Portland cement, Paku sekrup) **tetap terbuka**,
  perlu keputusan proyek spesifik dari owner (bukan sesuatu yang bisa
  diputuskan otomatis) — catat sbg daftar terbuka di dokumen status, JANGAN
  dihapus/dilupakan.

---

## 3. Batasan

- JANGAN menerapkan/menebak harga apa pun untuk 8 item ambigu.
- JANGAN mengubah `_resources_catalog.json` (file eksternal, di luar repo,
  bukan kewenangan Codex mengubahnya di sesi ini).
- JANGAN mengubah keputusan match final (status matched/ambigu/tidak_ketemu)
  di kedua script — HANYA memperkaya tampilan kandidat.
- Ini fase KECIL — kalau ternyata perbaikan ranking butuh restrukturisasi
  besar, STOP dan laporkan, jangan dipaksakan jadi pekerjaan besar diam-diam.

---

## 4. Verifikasi & Gerbang Review

```powershell
cd services/core-engine && python -m pytest -q     # harapan: >=264 passed
cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit   # harapan: 46 passed, exit 0
cd ../services/document-intelligence && python -m pytest -q  # harapan: tidak berubah
```
Cek `git log origin/main` utk status merge PR #29-#34, branch dari base
paling mutakhir, PR baru, **jangan merge sendiri**.

## 5. Laporkan

Branch/PR, bukti kandidat `M.GEN.0450` sekarang muncul, konfirmasi status
dokumentasi diperbarui, hasil test.
