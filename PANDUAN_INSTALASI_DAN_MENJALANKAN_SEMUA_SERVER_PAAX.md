# Panduan Resmi Instalasi dan Menjalankan Semua Server PAAX

Panduan ini adalah satu-satunya alur portable yang boleh digunakan untuk menjalankan PAAX PLHUT pada komputer ini. Panduan berlaku bagi pengguna maupun AI executor.

## 1. Lokasi yang benar

Repository produk terbaru:

```text
G:\paax-ai-contextual-integration
```

Data persisten:

```text
G:\PAAX-Data
```

Jangan menjalankan produk dari `G:\paax-ai-main` atau `G:\paax-ai-feedback1-remediation`. `G:\paax-ai-main` hanya menyimpan instruksi/koordinasi; menjalankan server dari sana akan membuka versi lama.

## 2. Aturan wajib untuk AI executor

Sebelum instalasi atau startup, AI wajib:

1. membaca panduan ini sampai selesai;
2. memakai workdir absolut `G:\paax-ai-contextual-integration` pada setiap perintah;
3. tidak membuka worktree/repository lain;
4. tidak menjalankan service satu per satu dengan perintah buatan sendiri;
5. tidak memakai `next dev`, `uvicorn`, atau script live-test sebagai pengganti startup resmi;
6. tidak memakai `-SkipOptionalServices` ketika diminta menjalankan semua server;
7. tidak membuat internal service key secara manual;
8. tidak menampilkan `.env.local`, credential, registry key, atau API key;
9. tidak menghapus database/artifact/data pengguna untuk memperbaiki startup;
10. tidak menyatakan READY hanya karena port terbuka.

AI hanya boleh menyatakan PAAX siap setelah enam health endpoint mengembalikan HTTP 200, `status: ok`, repository yang benar, commit yang sama, dan `dirty: false`.

## 3. Persyaratan komputer

- Windows 10/11;
- Node.js 20+;
- Python 3.11–3.13;
- pnpm 9.x melalui Corepack;
- Windows PowerShell;
- koneksi internet untuk instalasi dependency pertama.

Periksa:

```powershell
node --version
python --version
pnpm --version
```

Jika pnpm belum tersedia:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

## 4. Verifikasi repository

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"

$expectedRepo = (Resolve-Path ".").Path
$expectedCommit = (git rev-parse HEAD).Trim()
$branch = (git branch --show-current).Trim()
$dirty = git status --porcelain

Write-Host "Repository : $expectedRepo"
Write-Host "Branch     : $branch"
Write-Host "Commit     : $expectedCommit"

if ($expectedRepo -ne "G:\paax-ai-contextual-integration") { throw "Folder repository salah." }
if ($dirty) { throw "Worktree memiliki perubahan belum di-commit. Jangan menjalankan build audit." }
```

Baseline fungsi terakhir yang wajib sudah tercakup adalah `f1f44d2d`. HEAD boleh lebih baru karena pembaruan dokumentasi atau koreksi lanjutan, tetapi harus disengaja, worktree bersih, dan seluruh server kemudian melaporkan HEAD baru yang sama.

## 5. Hentikan runtime lama

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Pastikan enam port bersih:

```powershell
$ports = 3000,8001,8081,8082,8083,8085
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in $ports }
if ($listeners) {
  $listeners | Select-Object LocalPort,OwningProcess
  throw "Masih ada port PAAX aktif. Jangan membunuh semua node/python secara massal."
}
```

## 6. Instalasi pertama atau dependency berubah

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Setup memasang dependency Node/Python, membuat `.venv`, menyiapkan struktur data, memeriksa PLHUT 88 halaman, dan membuat `.env.local` jika belum ada. Setup tidak menimpa `.env.local` yang sudah ada.

### Build web production — wajib

Portable startup memakai build production, bukan `next dev`. Setelah setup atau perubahan frontend:

```powershell
pnpm --dir apps/web build
```

Jangan lanjut jika build gagal atau file berikut tidak ada:

```text
G:\paax-ai-contextual-integration\apps\web\.next\BUILD_ID
```

## 7. API key AI

Engine dan viewer dasar tidak boleh bergantung pada AI. Untuk Command Room/AI fallback, isi variabel yang diperlukan pada `.env.local` tanpa menampilkan nilainya.

- Jangan taruh key di source, prompt, log, screenshot, laporan, atau `.env.example`.
- Setelah environment berubah, stop dan start seluruh stack.
- AI hanya membantu klasifikasi/proposal/penjelasan; angka tetap berasal dari Core Engine.

## 8. Backup dan migration database

Jika database sudah ada, lakukan backup dan migration sebelum menjalankan versi baru:

```powershell
if (Test-Path "G:\PAAX-Data\db\portable.sqlite") {
  powershell -ExecutionPolicy Bypass -File `
    .\scripts\portable\Backup-PAAX-Portable.ps1 `
    -OutputPath "G:\PAAX-Data\backups\PAAX-before-update-$(Get-Date -Format yyyyMMdd-HHmmss).zip"

  .\.venv\Scripts\python.exe `
    .\scripts\portable\migrate_portable_schema.py `
    --database "G:\PAAX-Data\db\portable.sqlite"
}
```

Revision terbaru pada versi ini:

```text
0039_calculation_receipts
```

Jika migration gagal, jangan menjalankan server dan jangan menghapus database. Jika database belum ada, lewati migration manual; DB service akan membuat schema dan bootstrap PLHUT secara idempotent pada startup pertama.

## 9. Menjalankan semua server

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Jangan menambahkan `-SkipOptionalServices`.

Startup resmi akan memeriksa port/runtime lama, membuat credential berbeda per service, menyimpan raw credential pada file ber-ACL user-only, membuat registry hash-only, memasukkan credential melalui environment memory, menjalankan migration/bootstrap, menjalankan enam service, menunggu health HTTP 200, dan menulis runtime manifest tanpa secret.

Jangan membuat `internal-service.key`, `live-test-key`, atau `.launch.bat`. Mekanisme lama tersebut tidak digunakan.

## 10. Enam server

| Service | URL |
|---|---|
| PAAX Web | `http://127.0.0.1:3000` |
| Database API | `http://127.0.0.1:8001` |
| Core Engine | `http://127.0.0.1:8081` |
| AI Orchestrator | `http://127.0.0.1:8082` |
| Document Intelligence | `http://127.0.0.1:8083` |
| Site Agent | `http://127.0.0.1:8085` |

Buka aplikasi hanya melalui `http://127.0.0.1:3000`.

## 11. Verifikasi identitas — wajib

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
$expectedRepo = (Resolve-Path ".").Path
$expectedCommit = (git rev-parse HEAD).Trim()
$healthUrls = @(
  "http://127.0.0.1:3000/api/health",
  "http://127.0.0.1:8001/health",
  "http://127.0.0.1:8081/health",
  "http://127.0.0.1:8082/health",
  "http://127.0.0.1:8083/health",
  "http://127.0.0.1:8085/health"
)

foreach ($url in $healthUrls) {
  $health = Invoke-RestMethod -Uri $url -TimeoutSec 10
  $identity = $health.runtime_identity
  if ($health.status -ne "ok") { throw "Health gagal: $url" }
  if ((Resolve-Path $identity.repo_root).Path -ne $expectedRepo) { throw "Repository salah: $url" }
  if ($identity.commit -ne $expectedCommit) { throw "Commit berbeda: $url" }
  if ([string]$identity.dirty -ne "False") { throw "Runtime dirty: $url" }
  Write-Host "OK $url — $($identity.commit)"
}
```

Semua service wajib melaporkan repository/commit sama. Variasi huruf besar-kecil `G:\PAAX-Data` tidak mengubah identitas path Windows.

## 12. Verifikasi database PLHUT

```powershell
@'
import sqlite3
from pathlib import Path

database = Path(r"G:\PAAX-Data\db\portable.sqlite")
if not database.is_file():
    raise SystemExit("portable.sqlite tidak ditemukan")

with sqlite3.connect(database) as connection:
    project = connection.execute("SELECT COUNT(*) FROM projects WHERE id='PLHUT-SURAKARTA'").fetchone()[0]
    pages = connection.execute("SELECT COUNT(*) FROM dem_pages").fetchone()[0]
    revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]

print({"project": project, "dem_pages": pages, "revision": revision})
if project != 1 or pages != 88 or revision != "0039_calculation_receipts":
    raise SystemExit("Database PLHUT atau revision tidak sesuai")
'@ | .\.venv\Scripts\python.exe -
```

Jumlah receipt engine dapat tetap `0` bila evidence/fact PLHUT belum cukup. Nilai `0` lebih benar daripada quantity palsu.

## 13. Pemeriksaan UI awal

1. buka `http://127.0.0.1:3000`;
2. pilih `PLHUT-SURAKARTA`;
3. buka Drawing Intelligence;
4. periksa Files, Sheets, Review, Quantities, Mission, dan Handoff;
5. catat error console/network tanpa menampilkan secret.

Jangan mengganti empty, blocked, needs-review, atau missing-evidence dengan data dummy.

## 14. Menghentikan semua server

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Database, PDF, artifact, registry, dan data proyek tidak dihapus.

## 15. Menjalankan ulang setelah update source

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
pnpm --dir apps/web build

if (Test-Path "G:\PAAX-Data\db\portable.sqlite") {
  .\.venv\Scripts\python.exe .\scripts\portable\migrate_portable_schema.py --database "G:\PAAX-Data\db\portable.sqlite"
}

powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Ulangi verifikasi enam health endpoint.

## 16. Pemecahan masalah

### UI versi lama

- pastikan URL `127.0.0.1:3000`;
- periksa `runtime_identity.repo_root` dan commit;
- stop runtime lama;
- build ulang web production;
- start melalui script resmi;
- jangan menjalankan `pnpm dev`.

### Build web tidak tersedia

```powershell
pnpm --dir apps/web build
```

### Port masih digunakan

Gunakan stop resmi. Jika port tetap aktif, periksa command line dan pastikan benar-benar proses PAAX sebelum menghentikannya. Jangan membunuh semua Python/Node.

### Migration gagal

- jangan hapus `portable.sqlite`;
- jangan jalankan `create_all` atau ubah `alembic_version` manual;
- periksa backup di `G:\PAAX-Data\backups` dan file `.pre-cr2a.bak`;
- simpan pesan error untuk audit.

### Server tidak sehat

Periksa:

```text
G:\PAAX-Data\runtime\*.out.log
G:\PAAX-Data\runtime\*.err.log
G:\PAAX-Data\runtime\runtime-manifest.json
```

Manifest/health tidak boleh memuat raw credential.

### AI tidak berjalan

Periksa hanya nama variabel yang diperlukan pada `.env.local`, jangan nilainya. Setelah memperbaiki environment, stop/start seluruh stack.

## 17. Perintah ringkas

Jika dependency, build, dan migration sudah siap:

```powershell
Set-Location -LiteralPath "G:\paax-ai-contextual-integration"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "G:\PAAX-Data"
```

Tetap verifikasi enam health endpoint setelah startup.
