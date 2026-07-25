# PAAX AI - Paket Lokal PLHUT

Paket ini hanya membawa source runtime PAAX, fixture Drawing Intelligence PLHUT
yang sudah diproses (88 JSON halaman), dan data AHSP demonstrasi. Ia tidak
membawa source PDF asli, cache/build, `node_modules`, virtual environment,
laporan, Graphify, atau konfigurasi/credential mesin asal.

## Jalankan di laptop lain

1. Instal Node.js 20+, aktifkan Corepack/pnpm, dan instal Python 3.11+.
2. Salin `.env.local.example` menjadi `.env.local`, lalu isi API key Anda sendiri.
   Skrip setup akan menyalin konfigurasi itu ke `apps/web/.env.local` bila belum ada.
3. Jalankan `powershell -ExecutionPolicy Bypass -File .\\scripts\\portable\\Setup-PLHUT-Local.ps1`.
4. Jalankan `powershell -ExecutionPolicy Bypass -File .\\scripts\\portable\\Start-PLHUT-Local.ps1`.
5. Buka `http://127.0.0.1:3000`.

Mode ini menampilkan satu proyek saja: **PLHUT Surakarta**. Data DEM 88 halaman
langsung di-seed dari JSON fixture, sehingga tidak menganalisis ulang PDF dan
tidak memanggil provider vision saat start.

Command Room berjalan dengan pembatas konektor: Drawing Intelligence, RAB, dan
Schedule hanya memberi konteks/tool ketika pengguna mengaktifkannya. Model
eksternal Command Room memerlukan API key Anda pada `.env.local`; key asli tidak
pernah didistribusikan dalam paket.
