# PAAX Drawing Intelligence PCKM v3 — Panduan Merge dan Testing Lokal

**Tujuan:** menggabungkan ZIP final ke repository utama tanpa kehilangan pekerjaan lokal, menjalankan seluruh test, dan memeriksa hasil Drawing Intelligence dari upload hingga Command Room.

---

## 1. Jangan langsung menimpa repository utama

Contoh lokasi repository Anda:

```text
D:\paax-ai-main
```

Buat backup dan branch terlebih dahulu:

```powershell
cd D:\paax-ai-main
git status
git switch -c test/pckm-v3-final
git add -A
git commit -m "chore: checkpoint before pckm v3 merge"
```

Jika belum ingin commit, salin seluruh folder repository ke lokasi backup terlebih dahulu.

---

## 2. Ekstrak ZIP ke folder terpisah

Ekstrak ZIP final ke:

```text
D:\paax-ai-main-pckm-v3-final
```

Jangan ekstrak langsung di atas repository utama sebelum membandingkan file.

---

## 3. Bandingkan dan gabungkan

### Opsi aman dengan Robocopy

Dari PowerShell:

```powershell
robocopy "D:\paax-ai-main-pckm-v3-final\paax-ai-main" "D:\paax-ai-main" /E `
  /XD .git node_modules .next dist build .turbo coverage .cache __pycache__ .pytest_cache .venv venv graphify-out `
  /XF .env .env.local *.pyc *.log *.tsbuildinfo
```

Robocopy exit code 0–7 masih dapat berarti sukses. Setelah itu:

```powershell
cd D:\paax-ai-main
git status --short
git diff --stat
```

Pastikan `.env.local` Anda tidak tertimpa. ZIP final tidak membawa credential.

---

## 4. Install dependency

### Node

```powershell
corepack enable
pnpm install --frozen-lockfile
```

### Python shared schema

```powershell
python -m pip install -e .\packages\schemas\python
```

### Service Python

```powershell
python -m pip install -e .\services\core-engine
python -m pip install -e .\services\document-intelligence
python -m pip install -e .\services\db
```

Gunakan virtual environment bila tersedia.

---

## 5. Pemeriksaan paket

```powershell
python .\scripts\verify_package.py
python .\scripts\verify_drawing_intelligence_phase20.py
```

Hasil yang diharapkan:

```text
PACKAGE VERIFICATION PASSED
PHASE 1-20: 20/20 PASS
```

---

## 6. Benchmark 88 halaman

```powershell
python .\scripts\run_drawing_intelligence_benchmark.py
python .\scripts\verify_arete_command_room_offline.py
python .\scripts\verify_drawing_intelligence_phase20.py
```

Hasil utama yang harus muncul:

```text
Pages analyzed              : 88/88
Technical benchmark         : 20/20 PASS
Human benchmark             : 10/10 PASS
Arete offline QA            : 16/16 PASS
Phase gate                  : 20/20 PASS
AI provider calls           : 0
```

Artefak hasil berada di:

```text
report\report_drawing_intelligence\pckm_v3_final_2026-07-21\
```

---

## 7. Test Python

### Core Engine

```powershell
cd D:\paax-ai-main\services\core-engine
pytest -q
```

Expected reference:

```text
296 passed
```

### Document Intelligence

```powershell
cd D:\paax-ai-main\services\document-intelligence
pytest -q
```

Suite mengandung benchmark berat. Reference coverage dari paket final:

```text
656 passed, 6 skipped secara efektif
```

### Database

Pastikan dependency test tersedia, lalu:

```powershell
cd D:\paax-ai-main\services\db
$env:PYTHONPATH="src;..\..\packages\schemas\python"
pytest -q
```

Expected reference:

```text
156 passed, 1 skipped
```

Satu skip memerlukan PostgreSQL nyata pada environment yang mendukung integration test tersebut.

---

## 8. Test Node dan typecheck

Dari root:

```powershell
pnpm --filter @paax/schemas test
pnpm --filter @paax/ai-orchestrator test
pnpm --filter @paax/web test

pnpm --filter @paax/schemas typecheck
pnpm --filter @paax/ai-orchestrator typecheck
pnpm --filter @paax/web exec tsc --noEmit
```

Expected reference:

```text
Schemas               : 32 passed
AI Orchestrator       : 54 passed
Web                   : 140 passed
All typecheck         : PASS
```

### Build

```powershell
pnpm build
```

Pada paket final, schemas/types/orchestrator dan web compile/type validation lulus. Environment sebelumnya tertahan di Next.js `Collecting page data`. Pada komputer Anda, hasil ini harus diperiksa kembali sampai proses build keluar dengan exit code 0.

---

## 9. Menjalankan service lokal

Gunakan terminal terpisah.

### Database service — port 8084

```powershell
cd D:\paax-ai-main\services\db
$env:PYTHONPATH="src;..\..\packages\schemas\python"
uvicorn paax_db.main:app --host 127.0.0.1 --port 8084 --reload
```

### Core Engine — port 8081

```powershell
cd D:\paax-ai-main\services\core-engine
uvicorn app.main:app --host 127.0.0.1 --port 8081 --reload
```

### Document Intelligence — port 8083

```powershell
cd D:\paax-ai-main\services\document-intelligence
uvicorn app.main:app --host 127.0.0.1 --port 8083 --reload
```

### Frontend

```powershell
cd D:\paax-ai-main
pnpm --filter @paax/web dev
```

Gunakan konfigurasi `.env.local` milik Anda. Jangan menyalin key ke file laporan atau commit.

---

## 10. Skenario pengujian UI — PLHUT

### A. Upload dan pemrosesan

1. Buka Drawing Intelligence.
2. Upload PDF PLHUT 88 halaman.
3. Pastikan progress berjalan per halaman.
4. Pastikan hasil bukan JSON mentah.
5. Pastikan navigator kiri mengelompokkan:
   - Area Tapak;
   - Fondasi/Substruktur;
   - Lantai 1;
   - Lantai 2;
   - Atap;
   - disiplin Struktur/Arsitektur/MEP.

### B. Sheet identity

Periksa halaman-halaman kunci:

- halaman 43: **DENAH KOLOM LANTAI 2**;
- halaman 50: **TABEL KOLOM**;
- halaman potongan yang menjadi sumber elevasi/tinggi.

Judul, disiplin, drawing type, dan level harus benar.

### C. Item pekerjaan Lantai 2

Hasil referensi:

```text
Kolom K1A : 8 unit, 400 × 400 mm
Kolom K2  : 4 unit, 250 × 600 mm, tinggi 3,9 m
Kolom K3  : 5 unit, 250 × 400 mm
```

K2 harus menunjukkan sumber denah, tabel kolom, dan potongan.

### D. Hitung volume K2

1. Buka Kolom K2 Lantai 2.
2. Pastikan readiness menyatakan siap dihitung.
3. Klik **Hitung volume**.
4. Hasil yang diharapkan:

```text
0,250 × 0,600 × 3,900 × 4 = 2,340 m³
```

5. Refresh halaman.
6. Hasil 2,340 m³ harus tetap tampil dan tidak stale.

---

## 11. Skenario konflik antarlembar

Gunakan fixture mutation test atau salinan proyek uji—jangan ubah drawing produksi.

Contoh:

```text
K1 pada schedule utama     : 200 × 200 mm
K1 pada satu detail lain   : 200 × 300 mm
```

Expected UI:

1. item K1 berubah menjadi **Data rancu**;
2. navigator memberi badge pada seluruh lembar sumber;
3. panel menampilkan kedua nilai dan halaman;
4. tombol **Buka lembar** menuju halaman sumber;
5. user dapat:
   - memilih sumber yang benar;
   - mengetik koreksi;
   - approve;
   - request reupload;
6. setelah keputusan, item memakai value yang disetujui;
7. evidence lama masih dapat diaudit;
8. membuka konflik lain pada item yang sama tidak menghapus keputusan pertama.

---

## 12. Skenario Command Room/Arete

Gunakan connector Gambar Kerja dan pilih proyek PLHUT.

### Pertanyaan 1

```text
Kolom Lantai 2 ada apa saja, jumlah berapa, dan ukurannya berapa?
```

Jawaban harus menyebut K1A, K2, K3 menggunakan **unit fisik**, bukan “label/simbol”, disertai sumber lembar.

### Pertanyaan 2

```text
Berapa volume Kolom K2 Lantai 2?
```

Jika calculation sudah dijalankan, jawaban harus memakai 2,340 m³ dan menyebut formula/sumber. Bila calculation belum dijalankan, Arete harus menyatakan item siap dihitung dan memanggil jalur Core Engine—bukan menghitung sendiri.

### Pertanyaan 3

```text
Apakah ada data kolom yang rancu atau berbeda antarlembar?
```

Pada PLHUT asli, hasil konflik gambar saat benchmark adalah nol. Jika memakai fixture mutation, Arete harus menjelaskan nilai yang berbeda dan seluruh halaman sumber.

### Reasoning timeline

Timeline harus:

- bertambah ke bawah berdasarkan event aktual;
- kontekstual terhadap query/tool;
- terlipat menjadi `Memproses selama ...` setelah selesai;
- dapat dibuka kembali;
- tidak menampilkan private chain-of-thought mentah.

---

## 13. Pengujian proyek non-PLHUT

PLHUT tidak boleh menjadi template keras. Uji minimal satu proyek lain dengan:

- penamaan lantai berbeda, misalnya Ground Floor/Level 12/Basement;
- layout title block berbeda;
- kode kolom/pintu berbeda;
- schedule dan detail pada halaman berbeda;
- gambar jembatan atau jalan bila tersedia.

Periksa bahwa sistem tidak membuat `Lantai 2` secara default. Unknown scope harus tampil sebagai belum diketahui, bukan ditebak.

---

## 14. Acceptance checklist

### Data dan graph

- [ ] Semua halaman diproses.
- [ ] Denah, schedule, detail, legend, notasi, dan potongan terhubung.
- [ ] Source sheets dan evidence dapat dibuka.
- [ ] Tidak ada edge menggantung pada graph v3.
- [ ] Fakta terkonfirmasi mempunyai provenance.

### Jumlah dan ukuran

- [ ] Jumlah berasal dari count-source yang benar.
- [ ] Legend/detail tidak ikut dihitung.
- [ ] DEM dan native PDF tidak dijumlahkan secara buta.
- [ ] Dimensi berasal dari definition/schedule/detail yang tepat.
- [ ] Konflik membatalkan auto-confirm.

### User review

- [ ] Hanya konflik nyata masuk review user.
- [ ] Technical enrichment tidak membanjiri user.
- [ ] User dapat edit, approve, reject, reopen, atau reupload.
- [ ] Keputusan reviewer tidak hilang setelah refresh.

### Calculation

- [ ] Hanya Measurement Facts terotorisasi masuk Core Engine.
- [ ] Drawing Intelligence/AI tidak menghitung sendiri.
- [ ] Formula, input, result, engine version, dan evidence tersimpan.
- [ ] Hasil stale bila input berubah.

### Frontend dan Command Room

- [ ] UI lama tidak rusak.
- [ ] Data memakai bahasa teknik sipil.
- [ ] Volume muncul setelah calculation.
- [ ] Arete memakai context terarah dan sitasi lembar.
- [ ] Timeline kontekstual, smooth, collapsible, dan aman.

---

## 15. Kapan paket dapat disebut production-ready?

Paket ini siap untuk merge dan pilot lokal. Universal production membutuhkan:

1. `pnpm build` selesai exit code 0 pada deployment environment;
2. PostgreSQL + pgvector migration/integration test nyata;
3. ground truth object-level PLHUT;
4. benchmark proyek kedua independen;
5. precision/recall per kelas dan threshold auto-confirm;
6. multi-reviewer concurrency/locking pada database produksi.
