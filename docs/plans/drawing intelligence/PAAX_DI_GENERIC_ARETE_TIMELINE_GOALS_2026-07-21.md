# PAAX Drawing Intelligence + Arete — Goal Gate Generalisasi dan Activity Timeline

**Tanggal:** 21 Juli 2026  
**Basis:** paket `paax-ai-main-drawing-intelligence-user-ready-continuation-2026-07-21.zip`

## Tujuan gelombang

1. Menghilangkan asumsi bahwa proyek selalu PLHUT atau gedung dua lantai.
2. Membuat Command Room memprioritaskan hasil Drawing Intelligence yang sudah ramah manusia.
3. Mengganti status template dan summarizer model murah dengan activity timeline dari kejadian sistem nyata.
4. Menampilkan proses bertumpuk ke bawah dengan ikon kontekstual, durasi nyata, dan riwayat yang dapat dibuka kembali.
5. Menjaga reasoning privat model tidak diekspos pada Arete/Lucent.
6. Memastikan angka drawing tidak berubah menjadi kuantitas fisik tanpa authority.

## Goal dan status

| No. | Goal | Status | Gate |
|---:|---|---|---|
| 1 | Level generik: arbitrary floor, basement, ground, mezzanine, atap, fondasi, site | **PASS** | Test L12, B3, unknown level |
| 2 | Infrastruktur non-gedung: superstruktur, substruktur, trase/alignment | **PASS** | Bridge dan road tests |
| 3 | Unknown drawing tidak dipaksa menjadi Floor Plan atau Floor 2 | **PASS** | Vendor reference test |
| 4 | Metadata backend lebih kuat daripada tebakan judul | **PASS** | `level=foundation` tetap Fondasi/Substruktur |
| 5 | Command Room memakai human-delivery projection sebelum raw PCKM | **PASS** | Orchestrator retrieval tests |
| 6 | Sitasi memakai judul lembar + halaman, bukan ID internal saja | **PASS** | Arete offline QA |
| 7 | Timeline bertumpuk berdasarkan activity/tool event nyata | **PASS** | Timeline contract tests |
| 8 | Ikon berbeda menurut aktivitas dan tool | **PASS** | UI contract + component implementation |
| 9 | Panel selesai menjadi “Memproses selama …”, terlipat halus, dapat dibuka kembali | **PASS** | Activity history tests |
| 10 | Arete/Lucent tidak menampilkan raw chain-of-thought | **PASS** | Reasoning visibility tests |
| 11 | Summarizer model murah untuk status dihapus | **PASS** | File dihapus dan static contract |
| 12 | Compound dimension 250 × 600 mm memverifikasi kedua angka | **PASS** | Claim pipeline regression |
| 13 | Drawing symbol count tidak mengesahkan physical count | **PASS** | Adversarial claim tests |
| 14 | Klausa physical inference dihapus utuh, bukan hanya angkanya | **PASS** | Adversarial sentence test |
| 15 | Jawaban kolom Lantai 2 menggunakan 88-page human delivery | **PASS** | Offline QA 16/16 |
| 16 | Tidak ada provider/API AI live selama QA | **PASS** | Offline script contract |
| 17 | Full schemas/orchestrator/web tests | **PASS** | 32 + 54 + 140 tests |
| 18 | Schemas, orchestrator, dan web typecheck | **PASS** | `tsc --noEmit` |
| 19 | Core Engine dan PCKM benchmark | **PASS** | 295 tests + 14/14 benchmark |
| 20 | Next.js production build sampai static page generation | **CONDITIONAL** | Compile dan type validation lolos; worker tertahan saat page-data collection pada environment ini |

## Kontrak tampilan Arete

Saat proses berlangsung:

```text
Memeriksa pertanyaan dan ruang lingkup proyek
Memuat hasil Drawing Intelligence terbaru
Menelusuri item dan evidence lintas lembar
Menjalankan tool yang relevan
Menganalisis fakta serta ketidakpastian
Memeriksa authority angka dan sitasi
Menyusun jawaban
```

Setiap langkah ditambahkan sebagai baris baru dan tidak mengganti baris sebelumnya. Ikon berasal dari jenis aktivitas aktual (`inspect`, `context`, `search`, `graph`, `tool`, `reason`, `verify`, `compose`, `save`).

Setelah selesai:

```text
Memproses selama 12,4 detik  >
```

Panel tertutup otomatis setelah transisi singkat dan dapat dibuka untuk melihat seluruh riwayat.

## Batas reasoning

Activity timeline menjelaskan **apa yang sedang dikerjakan sistem**, bukan token reasoning privat atau chain-of-thought mentah. Arete dan Lucent hanya menerima timeline aman. Mode Noir mempertahankan panel reasoning eksplisit yang sudah ada.

## Release decision

**Siap untuk dipindahkan ke lokal dan diuji sebagai source utama: YES.**  
**Universal production-ready: NO**, sampai production build menyelesaikan page-data collection, PostgreSQL/pgvector CI berjalan, staging model diuji dengan key non-produksi, dan minimal satu proyek nyata non-PLHUT memiliki ground truth manual.
