# Panduan Instalasi dan Menjalankan Semua Server PAAX

Panduan ini digunakan untuk versi PAAX terbaru pada:

```text
G:\paax-ai-contextual-integration
```

Paket portable akan memasang dan mendaftarkan proyek acuan
`PLHUT-SURAKARTA` secara otomatis, termasuk sumber gambar kerja asli sebanyak
88 halaman. Bootstrap bersifat idempotent: menjalankan ulang PAAX tidak membuat
proyek PLHUT duplikat dan tidak menghapus data pengguna.

## 1. Persyaratan

Pastikan komputer menggunakan Windows dan sudah memiliki:

- Node.js versi 20 atau lebih baru;
- Python versi 3.11 sampai 3.13;
- Windows PowerShell;
- koneksi internet untuk instalasi dependency pertama;
- ruang penyimpanan data di luar direktori instalasi PAAX.

Contoh lokasi data yang disarankan:

```text
G:\PAAX-Data
```

Jangan menempatkan data root di dalam
`G:\paax-ai-contextual-integration`. Pemisahan ini memastikan database, hasil
proses, dan file proyek tetap aman ketika aplikasi diperbarui.

## 2. Buka PowerShell

Buka PowerShell, kemudian masuk ke direktori PAAX:

```powershell
cd G:\paax-ai-contextual-integration
```

PowerShell biasa umumnya cukup. Jalankan sebagai Administrator hanya jika
aktivasi Corepack/pnpm ditolak oleh Windows.

## 3. Instalasi pertama

Jalankan:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Setup-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"
```

Proses setup akan:

1. memeriksa versi Node.js, Python, dan pnpm;
2. memasang dependency Node secara reproducible;
3. membuat virtual environment Python di `.venv`;
4. memasang Core Engine, Document Intelligence, DB Service, dan Site Agent;
5. membuat struktur data persisten;
6. memeriksa integritas PDF PLHUT 88 halaman;
7. memeriksa manifest proyek `PLHUT-SURAKARTA`;
8. membuat `.env.local` dari contoh jika file tersebut belum tersedia.

### Konfigurasi API AI

Jika ingin menggunakan Command Room dan fitur AI, isi variabel API key yang
tersedia di `.env.local`. Jangan menaruh API key langsung di source code,
commit, screenshot, atau laporan.

Jika `.env.local` sebelumnya sudah tersedia, script setup tidak akan
menimpanya.

## 4. Menjalankan seluruh server

Jalankan perintah berikut dari root PAAX:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Start-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"
```

Jangan menambahkan `-SkipOptionalServices` jika ingin seluruh layanan,
AI Orchestrator, dan Site Agent ikut aktif.

Script akan membuat internal service key secara lokal, melakukan preflight,
mendaftarkan PLHUT secara idempotent, menjalankan layanan di background, dan
menunggu health check masing-masing layanan.

## 5. Daftar server

| Layanan | Alamat |
|---|---|
| PAAX Web | `http://127.0.0.1:3000` |
| Database API | `http://127.0.0.1:8001` |
| Core Engine | `http://127.0.0.1:8081` |
| AI Orchestrator | `http://127.0.0.1:8082` |
| Document Intelligence | `http://127.0.0.1:8083` |
| Site Agent | `http://127.0.0.1:8085` |

Buka aplikasi melalui:

```text
http://127.0.0.1:3000
```

## 6. Memastikan server aktif

Jalankan pemeriksaan HTTP 200 dan verifikasi `runtime_identity`:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8081/health
Invoke-RestMethod http://127.0.0.1:8082/health
Invoke-RestMethod http://127.0.0.1:8083/health
Invoke-RestMethod http://127.0.0.1:8085/health
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Seluruh endpoint WAJIB mengembalikan status HTTP 200 dengan `status: "ok"` dan `runtime_identity.repo_root` yang menunjuk tepat ke `G:\paax-ai-contextual-integration`. Jangan menerima kriteria "HTTP di bawah 500". Script startup tidak akan menyatakan READY sebelum seluruh 6 service membuktikan identitas build dan readiness yang sama.

## 7. Proyek PLHUT

Setelah server aktif:

1. buka `http://127.0.0.1:3000`;
2. masuk ke daftar proyek;
3. pilih `PLHUT-SURAKARTA`;
4. buka Drawing Intelligence untuk melihat paket gambar kerja 88 halaman;
5. gunakan Command Room, Review, Quantities, Mission, dan Handoff sesuai hak
   akses.

Semua angka final BoQ/RAB, quantity, jadwal, dan skenario tetap berasal dari
Core Engine. AI hanya membantu ekstraksi, klasifikasi, binding, proposal, dan
penjelasan.

## 8. Menghentikan seluruh server

Gunakan data root yang sama:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Stop-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"
```

Perintah ini menghentikan proses PAAX yang tercatat tanpa menghapus database
atau data proyek.

## 9. Menjalankan ulang

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Stop-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"

powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Start-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"
```

Setup tidak perlu dijalankan setiap kali. Jalankan setup kembali hanya ketika
dependency berubah atau setelah pembaruan versi besar.

## 10. Pemeriksaan awal manual

Preflight dapat dijalankan tanpa mengaktifkan server:

```powershell
cd G:\paax-ai-contextual-integration
python .\scripts\portable\preflight.py
```

Hasil yang diharapkan:

- project manifest: tersedia;
- project ID: `PLHUT-SURAKARTA`;
- PDF: 88 halaman;
- fixture DEM: 88 halaman;
- data sipil: valid;
- port layanan: tersedia sebelum startup.

## 11. Pemecahan masalah

### Setup gagal menemukan Node atau Python

Pastikan:

```powershell
node --version
python --version
```

Node harus versi 20+ dan Python harus berada pada rentang 3.11–3.13.

### pnpm belum tersedia

Jalankan:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

Kemudian ulangi setup.

### Port sudah digunakan

Hentikan PAAX terlebih dahulu:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\portable\Stop-PLHUT-Local.ps1 `
  -DataRoot "G:\PAAX-Data"
```

Setelah itu jalankan kembali startup.

### Server tidak sehat

Periksa log runtime pada:

```text
G:\PAAX-Data\runtime
```

File penting biasanya memiliki akhiran:

```text
*.out.log
*.err.log
*.pid
```

### UI terlihat versi lama / Service berjalan dari folder salah

Jika tampilan UI tidak mencerminkan versi terbaru atau fitur baru tidak muncul:

1. Hentikan seluruh service PAAX secara aman:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
   ```
2. Periksa apakah ada proses PAAX lama yang masih menggantung:
   ```powershell
   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*paax*" -or $_.CommandLine -like "*uvicorn*" } | Select-Object ProcessId, ExecutablePath, CommandLine
   ```
3. Pastikan terminal aktif berada pada folder yang benar:
   ```powershell
   cd G:\paax-ai-contextual-integration
   git status
   ```
4. Jalankan ulang server dan periksa `runtime_identity`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
   Invoke-RestMethod http://127.0.0.1:3000/api/health
   ```

### Command Room tidak dapat memanggil AI

Periksa konfigurasi API key pada `.env.local`, kemudian hentikan dan jalankan
ulang seluruh server. Jangan menampilkan isi API key di terminal atau laporan.

## 12. Perintah ringkas

```powershell
cd G:\paax-ai-contextual-integration

# Instalasi pertama
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"

# Menjalankan semua layanan
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"

# Menghentikan semua layanan
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```
