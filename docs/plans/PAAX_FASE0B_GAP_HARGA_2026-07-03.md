# PAAX — GERBANG-0b: Harga Surakarta (2026-07-03)

> Status: **sisi HARGA untuk lingkup PLHUT/Surakarta SUDAH diisi data NYATA**
> (owner-authorized). Sisa pekerjaan 0b = pemetaan ke katalog AHSP RESMI penuh —
> butuh keputusan/konfirmasi owner per item, bukan lagi soal "data belum ada".

## ✅ Selesai & terverifikasi (2026-07-03)

Owner menegaskan: harga di `ALFA.xlsx` (sheet **HARGA BAHAN**, **DKH**, **HSP**)
adalah harga ASLI Surakarta 2024 — dipakai langsung sebagai HSD sistem.

- **`data/harga-satuan/surakarta.json`** dibangun dari HARGA BAHAN (112 resource:
  upah+bahan+alat) + 3 resource tambahan dari AHS yang belum ada di HARGA BAHAN.
  Ini **price book UMUM regional** (dipakai proyek Surakarta mana pun) — sah
  sebagai grounding sistem per prinsip §0.1 (harga = pengecualian regional yang
  legal; yang dilarang jadi template = koefisien/answer-key PLHUT, itu tetap di
  `tests/fixtures/`). Regenerator: `data/harga-satuan/_generate_surakarta_from_alfa.py`.
- **Terverifikasi** (`test_plhut_surakarta_pricebook.py`, 3 test):
  - Semua 44 resource yang dipakai 32 analisa PLHUT **ada harganya** (coverage 100%
    untuk lingkup ini — bukan lagi 0,7%/3,2% seperti gap lama).
  - Engine UMUM (`compute_hsp`/`compute_rab`), memakai price book Surakarta NYATA
    (bukan harga inline fixture), mereproduksi RAB PLHUT: **Rp 1.885.558.837 vs
    Rp 1.860.078.608 = +1,37%** — jauh di dalam toleransi ±10%.
  - **5 inkonsistensi harga internal ALFA** ditemukan & dicatat di
    `alfa_price_conflicts` (mis. Portland cement ditulis Rp 1.100 di HARGA BAHAN
    tapi dipakai Rp 1.300 di satu analisa) — **inilah sumber SELURUH deviasi
    +1,37%**, bukan kesalahan engine. Auditable, sesuai RULE-HRG-02 (daftar harga
    = otoritas saat sumber konflik).
- Full suite core-engine: **238 passed** (235 + 3 baru), tanpa regresi.

**Kesimpulan:** untuk RAB berbasis analisa gaya-ALFA/kontraktor di wilayah
Surakarta, harga BUKAN lagi penghalang — sudah bisa dihitung penuh sekarang.

> ⚠️ **Ditemukan saat verifikasi**: ada file SERUPA di luar repo
> (`G:\paax-data\harga-satuan\surakarta.json`, 109 resource, sumber sama —
> dibangun sesi sebelumnya, per memori "PLHUT review session") yang dipakai
> engine HANYA bila env `PAAX_DATA_DIR` diset. Kode `SKA.*` di file itu
> ASSIGNED BEDA dari file baru ini (mis. `SKA.L.001` = "Pekerja" di file lama,
> = "1/3 GALIAN" di file baru) — 104/107 harga bernama-sama IDENTIK (sumber
> sama), tapi tidak ada 1 skema kode yang konsisten antara keduanya. Tidak
> aktif bug (tak pernah dimuat bersamaan — loader pilih satu tergantung env),
> tapi butuh direkonsiliasi sebelum produksi (di luar repo git, tak bisa
> di-commit lewat PR ini). **Pelajaran**: sebelum membangun price book baru,
> cek dulu `G:\paax-data` (external, via `PAAX_DATA_DIR`) supaya tak duplikasi.

## ⚠️ Sisa gap — pemetaan ke katalog AHSP RESMI (2.542 item, `G:\paax-data`)

Katalog resmi memakai kode resource sendiri (`L.01`, `M.GEN.0007`, dst — beda
dari kode yang saya buat `SKA.*`). Saya cek pencocokan **nama persis**:

| Cek | Hasil |
|---|---|
| Resource Surakarta (112) yang namanya PERSIS sama dgn entri resmi | **21/112** |
| ...dari situ, kategori **upah** (tukang/pekerja/mandor) | valid & masuk akal — kode resmi memang generik (mis. `L.02` = "Tukang" menaungi Tukang Kayu/Batu/Besi/Cat/dll sekaligus, sesuai konvensi AHSP nasional) |
| ...tapi ada varian **satuan ganda** per kode (mis. `L.02` muncul sbg OH DAN OJ; "Air" sbg liter DAN m3) | perlu pilih varian yang benar per konteks item — **tidak aman dipilih otomatis** |
| Resource **bahan** (semen, besi, agregat, dll) | mayoritas TIDAK match persis (nama resmi lebih rinci/berbeda gaya penulisan) — butuh pencocokan semantik (SK-19), bukan string persis |

**Kenapa saya TIDAK mengotomatisasi pengikatan ke kode resmi:** brain
RULE-AHSP-01/02 mewajibkan pemetaan AHSP↔harga dikonfirmasi manusia ketika ada
ambiguitas (di sini: pilihan satuan, potensi beda spek/mutu). Mengikat otomatis
tanpa cek = risiko "Aturan Emas versi halus" (angka benar secara matematis tapi
dari pasangan yang salah). Ini pekerjaan SK-19/SK-20 (pencarian semantik + price
binding) — terpisah dari "pakai harga yang sudah ada", butuh Claude ajukan +
owner konfirmasi kasus ambigu.

## Kriteria GERBANG-0b penuh (katalog resmi, saat pemetaan siap)
RAB PLHUT dari katalog AHSP RESMI + price book Surakarta → **0 harga kosong**
pada item yang dipetakan; total dalam toleransi **±10%** vs `ALFA.xlsx`; setiap
pemetaan ambigu terkonfirmasi manusia; **BOE terbit** (mencatat semua keputusan
pemetaan sebagai Assumption, brain RULE-BOE-01).

## Rekomendasi urutan berikutnya
1. **Sekarang**: jalankan prompt Codex Fase 0a+0b-parsial (commit semua bukti).
2. **Opsional (SK-19/20)**: Claude bangun pencocokan semantik 112 resource
   Surakarta → kode resmi (fuzzy/embedding + skor), ajukan tabel usulan ke owner
   untuk kasus yang tidak 100% yakin (terutama kategori bahan) — baru dikunci.
3. **Terpisah**: peta 224 item DKH → kode ITEM AHSP resmi (bukan resource) untuk
   GERBANG-0b penuh gaya-resmi — perlu owner karena analisa custom kontraktor
   vs analisa resmi bisa beda struktur (brain RULE-AHSP-01).

> Fase 1 (workspace) & Fase 2 (persepsi gambar) tidak terhalang oleh sisa gap
> ini — bisa jalan paralel (brain TXT03 §7).
