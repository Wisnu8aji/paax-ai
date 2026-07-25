# Panduan Portabel PAAX AI — PLHUT Surakarta

**Status:** paket pengembangan aktif untuk pengujian lokal. Bukan release produksi universal.

Paket portabel membawa source PAAX, PDF asli PLHUT Surakarta 88 halaman, DEM fixture, graph fixture, Civil Work Item terverifikasi, dan konfigurasi bootstrap. Saat aplikasi dijalankan, proyek `PLHUT-SURAKARTA` harus selalu tersedia tanpa menghapus proyek atau koreksi user yang sudah ada.

## Prinsip runtime

1. **Database persisten.** Data berada di `data/portable/paax-portable.db`; startup tidak boleh menghapus database.
2. **Bootstrap idempotent.** PLHUT dibuat bila belum ada dan hanya artefak yang hilang yang diperbaiki.
3. **Project binding tunggal.** Frontend, Command Room, worker, DB proxy, dan service internal memakai actor portable yang sama (`paax-web` secara default).
4. **PDF asli tampil di viewer.** Sheet fixture menunjuk renderer halaman PDF asli, bukan hanya geometri DEM sintetis.
5. **Quantity authority.** Quantity final berasal dari Civil Work Item/Measurement Fact terverifikasi dan Core Engine; raw graph occurrence atau LLM tidak menjadi authority.
6. **Secret tidak dibundel.** Internal service key dibuat lokal di `.local-runtime`; API key model eksternal harus diisi sendiri bila Command Room live model ingin digunakan.

## Persyaratan

- Windows 10/11 dan PowerShell 5.1 atau PowerShell 7.
- Node.js 20 atau lebih baru.
- pnpm 9.15.x melalui Corepack.
- Python 3.11–3.13.
- Ruang kosong yang cukup untuk `node_modules`, `.venv`, database lokal, dan cache viewer.

## Setup pertama

Dari root repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1
```

Setup melakukan:

- instalasi dependency Node menggunakan lockfile;
- pembuatan `.venv`;
- instalasi paket Python PAAX;
- pembuatan `.env.local` dari template bila belum ada;
- pemeriksaan checksum PDF, 88 halaman, 88 fixture, dan integritas Civil Work Item.

`.env.local` hanya diperlukan untuk API key atau opsi lokal tambahan. Internal service key **tidak** perlu ditulis manual karena dibuat saat startup.

## Menjalankan seluruh service

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1
```

Untuk hanya service wajib tanpa optional AI orchestrator/site agent:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -SkipOptionalServices
```

Startup bersifat idempotent: menjalankan perintah kembali tidak menghapus data dan tidak membuat duplikat PLHUT.

Buka:

```text
http://127.0.0.1:3000
```

## Hasil yang wajib terlihat

### Dashboard dan project selection

- `PLHUT Surakarta` terdaftar.
- Jika active project lokal kosong atau tidak valid, PLHUT menjadi default.
- Project lain tetap boleh dibuat dan tidak boleh terhapus saat restart.

### Drawing Intelligence

- Navigator memuat 88 sheet.
- Ketika sheet dipilih, canvas menampilkan halaman PDF asli.
- Halaman manusia 43 harus menampilkan **DENAH KOLOM LANTAI 2**.
- Quantity table menampilkan kolom user-facing: item, lokasi/lantai, jenis, satuan, ukuran, jumlah, formula, volume/hasil, status, dan sumber.
- Tombol sumber membuka sheet terkait.
- Tombol Excel mengunduh worksheet `Perhitungan Backup`.

### Command Room

- Chat baru mewarisi project yang sedang dibuka.
- Project binding tidak hilang hanya karena connector dimatikan.
- Pertanyaan `Berapa volume kolom K2 lantai 2?` mengambil Civil Work Item project-bound dan menghasilkan konteks:
  - jumlah `4`;
  - ukuran `0,250 × 0,600 × 3,900 m`;
  - formula `0,250 × 0,600 × 3,900 × 4`;
  - hasil `2,340 m³`;
  - sumber halaman 43, 50, dan 54.
- Bila model eksternal belum dikonfigurasi, retrieval/backend masih dapat diuji, tetapi jawaban generatif live tidak boleh diklaim aktif.


## Verifikasi teknis setelah startup

Dengan service wajib sudah aktif, jalankan:

```powershell
python .\scripts\portable\verify_phase30_runtime.py
python .\scripts\portable\verify_phase30_source_contracts.py
```

Untuk membuka workspace acceptance yang memakai data service hidup:

```powershell
python .\scripts\portable\acceptance_ui_server.py --port 8099
```

Kemudian buka `http://127.0.0.1:8099`. Workspace diagnostik ini memeriksa project binding, halaman PDF asli, quantity user-facing, Command Room context, dan ekspor Excel secara terpisah dari UI Next.js utama.

## Port dan service

| Service | Port |
|---|---:|
| Web | 3000 |
| DB/fixture | 8001 |
| Core Engine | 8081 |
| Document Intelligence | 8083 |
| AI Orchestrator (opsional) | 8082/default dev configuration |
| Site Agent (opsional) | 8085 |

## Data persisten dan reset yang aman

Database lokal:

```text
data/portable/paax-portable.db
```

Jangan menghapusnya untuk sekadar restart. Untuk reset manual yang disengaja:

1. hentikan seluruh service;
2. backup database;
3. hapus database hanya bila benar-benar ingin menghilangkan seluruh data lokal;
4. jalankan startup untuk bootstrap baru.

## Menghentikan service

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1
```

## Membuat ZIP bersih

```powershell
python .\scripts\portable\make_zip.py --output "..\PAAX-AI-Main-PLHUT-Agentic-Phase-30.zip"
```

ZIP release harus mengecualikan:

- `.env.local`;
- `.local-runtime` dan internal key;
- database lokal;
- `node_modules`, `.venv`, cache dan build output;
- log dan credential.

## Troubleshooting

### PLHUT tidak muncul

- Periksa `.local-runtime/db-plhut.err.log`.
- Jalankan `python scripts/portable/preflight.py --allow-running`.
- Pastikan manifest, PDF, dan fixture tidak berubah checksum.

### Command Room memilih project tetapi jawaban tidak project-bound

- Pastikan semua service memakai `PAAX_PORTABLE_ACTOR_ID=paax-web`.
- Pastikan request chat mengirim `projectId=PLHUT-SURAKARTA`.
- Periksa endpoint `/projects/PLHUT-SURAKARTA/project-graph/engineering-context`.

### Sheet terpilih tetapi gambar tidak tampil

- Periksa endpoint `/projects/PLHUT-SURAKARTA/source-document/pages/42/image`.
- Pastikan proxy `/api/drawing-intelligence` meneruskan header internal dan actor.
- Pastikan canvas memprioritaskan `realImageUrl` ketika tersedia.

### Quantity tidak sesuai

Jangan memperbaiki raw graph count untuk memaksa hasil. Audit terhadap PDF asli, kemudian perbarui Measurement Facts/Civil Work Items dan jalankan Core Engine. Raw DEM/PCKM adalah evidence/proposal, bukan sumber final tunggal.
