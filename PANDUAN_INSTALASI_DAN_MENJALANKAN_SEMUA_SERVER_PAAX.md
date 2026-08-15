# Panduan Resmi Instalasi dan Menjalankan Semua Server PAAX

Panduan ini adalah satu-satunya alur portable yang boleh digunakan untuk menjalankan PAAX PLHUT pada komputer ini. Panduan berlaku bagi pengguna maupun AI executor.

**Revisi panduan:** integrasi PDF binary worker, canonical artifact PLHUT, thumbnail nyata Review/Analyze/Sheets, acceptance manual compositor GPU viewer Gambar Kerja, **perbaikan blur resolusi (Tier 1: surface buffer 8192 + tile density 8 + detail pass proaktif 80 ms + thumbnail 800 px + DPI 300 + normalisasi width 800 di frontend)**, **engine klasifikasi quantities (K0–K4 + bridge balok/kolom + P1–P5: sinkronisasi AI-validator, sheet-context override, joiner MEP/profil, trigger AI = konfirmasi, dedup lintas konteks)**, **AI-assist live melalui endpoint opencode-go** (bukan api.deepseek.com), dan **stabilisasi drawing index (Fase 0: terjemahan error 404/403/503, aktor `local-desktop-user`, single-flight retry index, tidak ada lagi HTTP 500)**.

> **Versi terpasang saat ini (2026-08-04):** commit `642898ff` (puncak P1–P5) — verifikasi: 6/6 health, DB PLHUT 88 halaman revision `0039_calculation_receipts`, PDF canonical 25,8 MB, thumbnail 800px, Quantities engine baru (106 work items; M1/M5 PASS; M4 78,7%; M8 50,9% — target bertahap §9.2). Untuk menampilkan hasil engine terbaru pada tab Quantities, jalankan **Analyze** ulang pada proyek PLHUT (data persisted di DB berasal dari analisis 30-Jul sebelum engine P1–P5; kode engine sudah terpasang dan siap dipakai).

Status `COMPLETED` pada file feedback bukan pengganti release gate. Versi remediasi hanya boleh dijalankan untuk audit setelah seluruh perubahannya sudah di-commit, build production dibuat dari commit tersebut, dan worktree kembali bersih.

## 1. Lokasi yang benar

Repository produk terbaru:

```text
D:\paax-ai-main
```

Data persisten:

```text
D:\paax-data
```

Data root kanonik ditandai oleh `D:\paax-data\data-root.json` (schema `1.0`, berisi layout `db`, `objects`, `uploads`, `jobs`, `cache`, `models`, `runtime`, `backups`, `migration`, `bootstrap`). Semua script portable (`Resolve-PaaxDataRoot`) memakai penanda ini untuk memastikan `-DataRoot` menunjuk ke root yang sama; jangan membuat `data-root.json` kedua di lokasi lain.

Jangan menjalankan produk dari `D:\paax-ai-main` atau `G:\paax-ai-feedback1-remediation`. `D:\paax-ai-main` hanya menyimpan instruksi/koordinasi; menjalankan server dari sana akan membuka versi lama.

## 2. Aturan wajib untuk AI executor

Sebelum instalasi atau startup, AI wajib:

1. membaca panduan ini sampai selesai;
2. memakai workdir absolut `D:\paax-ai-main` pada setiap perintah;
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
Set-Location -LiteralPath "D:\paax-ai-main"

$expectedRepo = (Resolve-Path ".").Path
$expectedCommit = (git rev-parse HEAD).Trim()
$branch = (git branch --show-current).Trim()
$dirty = git status --porcelain

Write-Host "Repository : $expectedRepo"
Write-Host "Branch     : $branch"
Write-Host "Commit     : $expectedCommit"

if ($expectedRepo -ne "D:\paax-ai-main") { throw "Folder repository salah." }
if ($dirty) { throw "Worktree memiliki perubahan belum di-commit. Jangan menjalankan build audit." }
```

Jangan memakai nomor commit lama yang ditulis pada panduan atau laporan sebagai patokan tunggal. Patokan runtime adalah `HEAD` lokal yang sudah direview dan di-commit. Remediasi PDF terbaru wajib mempunyai seluruh file berikut pada commit yang sama:

```text
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-binary-cache.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-webgl.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-canvas2d.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.ts
apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts
services/db/src/paax_db/reference_bootstrap.py
services/document-intelligence/tests/test_phase_c_thumbnails.py
```

Jika `git status --porcelain` masih menghasilkan output, jangan melakukan audit final. Selesaikan review/commit pada branch remediasi terlebih dahulu; jangan menyalin sebagian file ke branch lain.

## 5. Hentikan runtime lama

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
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
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```

Setup memasang dependency Node/Python, membuat `.venv`, menyiapkan struktur data, memeriksa PLHUT 88 halaman, dan membuat `.env.local` jika belum ada. Setup tidak menimpa `.env.local` yang sudah ada.

### Build web production — wajib

Portable startup memakai build production, bukan `next dev`. Setelah setup atau perubahan frontend:

```powershell
pnpm --dir apps/web build
```

Jangan lanjut jika build gagal atau file berikut tidak ada:

```text
D:\paax-ai-main\apps\web\.next\BUILD_ID
```

Build ulang ini wajib setelah perubahan viewer PDF walaupun dependency tidak berubah. Jalur binary worker berada di bundle browser; menjalankan bundle lama akan tetap menghasilkan error viewer lama meskipun backend sudah diperbaiki.

## 7. API key AI

Engine dan viewer dasar tidak boleh bergantung pada AI. Untuk Command Room/AI fallback, isi variabel yang diperlukan pada `.env.local` tanpa menampilkan nilainya.

- Jangan taruh key di source, prompt, log, screenshot, laporan, atau `.env.example`.
- Setelah environment berubah, stop dan start seluruh stack.
- AI hanya membantu klasifikasi/proposal/penjelasan; angka tetap berasal dari Core Engine.
- **AI-assist quantities** memakai `PAAX_TEST_API_KEY` (key opencode-go) dengan endpoint `https://opencode.ai/zen/go/v1/chat/completions` dan User-Agent `curl/8.5.0` (tanpa UA ini, Cloudflare mengembalikan HTTP 403 browser_signature_banned; endpoint `api.deepseek.com` lama tidak cocok dengan key ini). Model AI yang diizinkan: `deepseek-v4-flash` saja.

## 8. Backup dan migration database

Jika database sudah ada, lakukan backup dan migration sebelum menjalankan versi baru:

```powershell
if (Test-Path "D:\paax-data\db\portable.sqlite") {
  powershell -ExecutionPolicy Bypass -File `
    .\scripts\portable\Backup-PAAX-Portable.ps1 `
    -OutputPath "D:\paax-data\backups\PAAX-before-update-$(Get-Date -Format yyyyMMdd-HHmmss).zip"

  .\.venv\Scripts\python.exe `
    .\scripts\portable\migrate_portable_schema.py `
    --database "D:\paax-data\db\portable.sqlite"
}
```

Revision terbaru pada versi ini:

```text
0039_calculation_receipts
```

Jika migration gagal, jangan menjalankan server dan jangan menghapus database. Jika database belum ada, lewati migration manual; DB service akan membuat schema dan bootstrap PLHUT secara idempotent pada startup pertama.

## 9. Menjalankan semua server

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```

Jangan menambahkan `-SkipOptionalServices`.

Startup resmi akan memeriksa port/runtime lama, membuat credential berbeda per service, menyimpan raw credential pada file ber-ACL user-only, membuat registry hash-only, memasukkan credential melalui environment memory, menjalankan migration/bootstrap, menjalankan enam service, menunggu health HTTP 200, dan menulis runtime manifest tanpa secret.

Pada versi remediasi PDF, bootstrap PLHUT juga harus merekonsiliasi `artifact_key` lama menjadi `original-pdf/runs/{run_id}`, memvalidasi PDF sumber 88 halaman, serta menyiapkan artifact PDF canonical sebelum viewer dipakai. Proses pertama dapat lebih lama karena PDF asli sekitar 26 MB divalidasi dan disalin. Jangan menghentikan startup selama proses tersebut masih berjalan.

Sesudah startup, periksa log DB. Startup belum boleh dianggap berhasil bila log berisi `Bootstrap failed`, `artifact reconciliation failed`, checksum mismatch, page-count mismatch, atau source PDF missing. Pesan health HTTP 200 saja tidak cukup untuk melewati gate artifact.

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

### 10.1 Host resmi: 127.0.0.1 (bukan localhost)

- **Host resmi = `http://127.0.0.1:3000`.** Server PAAX hanya bind `127.0.0.1`, dan browser memperlakukan `localhost` sebagai origin terpisah dengan cache/service-worker sendiri.
- **PENTING — `NEXT_PUBLIC_USE_DB=true` WAJIB ada di `apps/web/.env.local`.** Tanpa variabel ini frontend memakai backend `localStorage` (data browser lokal kosong/lama) sehingga proyek PLHUT hilang atau tampil versi lama tanpa update. Dengan `true`, frontend memakai DB API (`/api/db-projects`) yang berisi PLHUT + klasifikasi terbaru. Setelah mengubah env ini, wajib `pnpm --dir apps/web build` ulang lalu restart stack.
- **`DOCUMENT_INTELLIGENCE_URL=http://127.0.0.1:8083`** (bukan 8002) di `apps/web/.env.local` — port 8002 sudah tidak dipakai; jika salah, modul Review/Quantities tidak mendapat data.
- **Identitas aktor web = `local-desktop-user`.** Proxy Next.js (`apps/web/src/app/api/document-intelligence/[...path]/route.ts`) mengirim header `X-User-Id` dari `PAAX_PORTABLE_ACTOR_ID` (default `local-desktop-user`) dan `X-Internal-Key` dari `INTERNAL_SERVICE_KEY`. `Start-PLHUT-Local.ps1` menetapkan `PAAX_PORTABLE_ACTOR_ID=local-desktop-user` untuk service web, dan bootstrap DB menjadikan `local-desktop-user` anggota project PLHUT. Jangan mengganti aktor ini di klien; aktor lain yang bukan anggota project akan ditolak 403 → aplikasi menampilkan pesan akses, bukan 500.
- Bila sebelumnya membuka `localhost:3000` dan melihat versi lama: lakukan hard refresh (Ctrl+Shift+R) atau buka `127.0.0.1:3000` setelah restart. Cache browser per-origin dapat menyajikan bundle lama.

## 11. Verifikasi identitas — wajib

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
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

Semua service wajib melaporkan repository/commit sama. Variasi huruf besar-kecil `D:\paax-data` tidak mengubah identitas path Windows.

## 12. Verifikasi database PLHUT

```powershell
@'
import sqlite3
from pathlib import Path

database = Path(r"D:\paax-data\db\portable.sqlite")
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

## 13. Verifikasi PDF canonical dan thumbnail nyata

Jalankan setelah enam health endpoint lulus. Pemeriksaan ini tidak memakai API key AI dan tidak melakukan analisis ulang 88 halaman.

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"

$runId = "514fb7f2-26fd-5816-9f22-a4a2412688bf"
$base = "http://127.0.0.1:3000/api/document-intelligence/drawings/dem/$runId"

$issued = Invoke-RestMethod -Method Post -Uri "$base/artifact-url" -TimeoutSec 30
if (-not $issued.token) { throw "Token artifact PDF tidak diterbitkan." }
if ([string]$issued.artifact_key -like "reference://*") {
  throw "Artifact key legacy masih aktif: $($issued.artifact_key)"
}

Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
try {
  $artifactUrl = "$base/artifact?token=$([uri]::EscapeDataString([string]$issued.token))"
  $pdfResponse = $client.GetAsync($artifactUrl).GetAwaiter().GetResult()
  if (-not $pdfResponse.IsSuccessStatusCode) {
    throw "Artifact PDF gagal: HTTP $([int]$pdfResponse.StatusCode)"
  }
  $pdfBytes = $pdfResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
  $magic = [Text.Encoding]::ASCII.GetString($pdfBytes, 0, [Math]::Min(5, $pdfBytes.Length))
  if ($pdfResponse.Content.Headers.ContentType.MediaType -ne "application/pdf" -or $magic -ne "%PDF-") {
    throw "Respons artifact bukan PDF asli yang valid."
  }

  foreach ($page in 0,6,38,56,87) {
    $thumbnailResponse = $client.GetAsync("$base/pages/$page/thumbnail?width=320").GetAwaiter().GetResult()
    if (-not $thumbnailResponse.IsSuccessStatusCode) {
      throw "Thumbnail halaman $page gagal: HTTP $([int]$thumbnailResponse.StatusCode)"
    }
    $thumbnailBytes = $thumbnailResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    if ($thumbnailResponse.Content.Headers.ContentType.MediaType -ne "image/png" -or $thumbnailBytes.Length -eq 0) {
      throw "Thumbnail halaman $page bukan PNG nyata."
    }
    Write-Host "OK thumbnail halaman $page - $($thumbnailBytes.Length) bytes"
  }

  Write-Host "OK PDF canonical - $($pdfBytes.Length) bytes, header %PDF-"
}
finally {
  $client.Dispose()
}
```

Artifact dan thumbnail lokal merupakan data turunan yang direkonsiliasi dari PDF fixture resmi. Lokasi adapter lokal saat ini adalah:

```text
D:\paax-ai-main\services\document-intelligence\.artifacts
```

Folder tersebut bukan database pengguna dan tidak perlu disalin manual. Namun jangan menghapusnya ketika server sedang berjalan. Startup resmi harus mampu menyemai ulang PDF canonical bila artifact hilang atau tidak cocok.

## 14. Pemeriksaan UI awal

1. buka `http://127.0.0.1:3000`;
2. pilih `PLHUT-SURAKARTA`;
3. buka Drawing Intelligence;
4. periksa Files, Sheets, Review, Quantities, Mission, dan Handoff;
5. catat error console/network tanpa menampilkan secret.
6. pada Review dan Analyze, pindah beberapa halaman dan pastikan tidak muncul `Retry PDF` atau `Invalid PDF url data`;
7. pada Sheets, pastikan gambar halaman nyata muncul, bukan placeholder, dan tombol retry tidak tampil pada kondisi normal;
8. buka Developer Tools hanya bila diperlukan dan pastikan tidak ada HTTP 4xx/5xx untuk `artifact-url`, `artifact`, atau `thumbnail`.

Jangan mengganti empty, blocked, needs-review, atau missing-evidence dengan data dummy.

### 14.1 Acceptance manual viewer Gambar Kerja setelah perubahan frontend

Setelah perubahan pada `drawing-canvas`, `pdf-page-layer`, compositor, coverage, tile pool, atau worker, pemeriksaan UI awal di atas belum cukup. Jalankan seluruh instruksi manual rinci berikut:

```text
D:\paax-ai-main\docs\plans\2026-08-02-manual-acceptance-gambar-kerja-viewer-flicker-right-crop.md
```

Minimum gate manual:

1. fit awal dan sisi kanan halaman utuh;
2. 12 gerakan pan kiri/kanan tanpa blank atau kedipan;
3. zoom in/out dan fit tanpa crop kanan;
4. navigasi A→B→A tanpa aspect atau frame dokumen lama;
5. resize dan DPR 2 bila tersedia;
6. WebGL context loss memperlihatkan fallback lalu restore atau failover dengan aman;
7. Console/Network bebas error viewer dan HTTP 4xx/5xx relevan.

Pada kondisi stabil, elemen `[data-testid="pdf-page-layer"]` wajib melaporkan `data-coverage-ready="true"`, `data-coverage-ratio` minimal `0.99`, `data-materialized-tile-count` tidak kurang dari `data-committed-tile-count`, committed tile lebih dari nol, dan `data-context-lost="false"`. Renderer normal di browser yang mendukungnya adalah `webgl2`; `canvas2d` merupakan fallback yang sah.

Jika `data-coverage-ready="true"` sementara tile belum seluruhnya termaterialisasi, viewport menjadi putih, sisi kanan hilang, atau satu kedipan dapat diulang, hasilnya **FAIL**. Jangan menutupi kegagalan dengan thumbnail dummy, delay tambahan, atau menghapus data/cache pengguna.

Validasi terhadap working tree yang belum di-commit hanya boleh disebut **manual pre-commit validation**. Runtime tersebut tidak boleh dinyatakan release-ready karena `runtime_identity.dirty` masih `true`. Simpan branch, HEAD, `git status --short`, screenshot, diagnostik, dan hasil pada folder bukti yang ditentukan oleh instruksi rinci.

## 15. Menghentikan semua server

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```

Database, PDF, artifact, registry, dan data proyek tidak dihapus.

## 16. Menjalankan ulang setelah update source

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
pnpm --dir apps/web build

if (Test-Path "D:\paax-data\db\portable.sqlite") {
  .\.venv\Scripts\python.exe .\scripts\portable\migrate_portable_schema.py --database "D:\paax-data\db\portable.sqlite"
}

powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```

Ulangi verifikasi enam health endpoint.

## 17. Pemecahan masalah

### UI versi lama

- pastikan URL `127.0.0.1:3000`;
- periksa `runtime_identity.repo_root` dan commit;
- stop runtime lama;
- build ulang web production;
- start melalui script resmi;
- jangan menjalankan `pnpm dev`.

### Review/Analyze menampilkan `Invalid PDF url data`

- pastikan file `pdf-binary-cache.ts` sudah tercakup pada commit aktif;
- hentikan seluruh server melalui script resmi;
- jalankan ulang `pnpm --dir apps/web build`;
- start kembali melalui script resmi dan lakukan hard refresh browser;
- jangan meneruskan URL artifact langsung ke `pdfjs.getDocument` di worker.

### Thumbnail Sheets HTTP 500 atau gambar tidak muncul

- jalankan kembali verifikasi pada Bagian 12 dan Bagian 13;
- pastikan database memakai artifact key `original-pdf/runs/514fb7f2-26fd-5816-9f22-a4a2412688bf`;
- periksa `db-plhut.err.log` dan `document-intelligence.err.log`;
- pastikan artifact PDF canonical lolos header `%PDF-`, checksum, dan 88 halaman;
- jangan menghapus database, menambah thumbnail dummy, atau menjalankan script live-test sebagai pengganti startup resmi.

### Drawing index HTTP 500 atau status tidak jelas (diagnostik curl chain web → DI → DB)

Drawing index (`GET /api/document-intelligence/drawings/dem/{run_id}/index` di web, diteruskan ke Document Intelligence `:8083`) **tidak boleh pernah mengembalikan 500**. Status yang sah:

| Kondisi run | Status | Detail JSON |
|---|---|---|
| Run tidak ada (UUID tidak dikenal) | `404` | `{"detail":"DEM run not found"}` |
| Run ada + punya data (mis. `514fb7f2-26fd-5816-9f22-a4a2412688bf`, 88 halaman) | `200` | package index lengkap |
| Run ada + tanpa data (mis. `cce23809-5eee-45b2-ad1c-de7235ab03ba`, 0 halaman) | `404` | `{"detail":"package index is not available for this run"}` |
| Aktor bukan anggota project | `403` | `{"detail":"not a member of this project"}` |
| DB API tidak terjangkau / error upstream | `503` | `{"detail":"... service is unavailable"}` |

Curl chain diagnostik (jalankan dari `D:\paax-ai-main`):

```bash
# 1) Web proxy → Document Intelligence → DB (jalur lengkap yang dipakai browser)
curl -s -o /dev/null -w "web health:      HTTP %{http_code}\n" http://127.0.0.1:3000/api/health
curl -s -w "run tidak ada:   HTTP %{http_code}\n" http://127.0.0.1:3000/api/document-intelligence/drawings/dem/00000000-0000-0000-0000-000000000000/index
curl -s -w "run dengan data: HTTP %{http_code}\n" http://127.0.0.1:3000/api/document-intelligence/drawings/dem/514fb7f2-26fd-5816-9f22-a4a2412688bf/index
curl -s -w "run tanpa data:  HTTP %{http_code}\n" http://127.0.0.1:3000/api/document-intelligence/drawings/dem/cce23809-5eee-45b2-ad1c-de7235ab03ba/index

# 2) Hop langsung ke Document Intelligence dan Database API
curl -s -w "DI health: HTTP %{http_code}\n" http://127.0.0.1:8083/health
curl -s -w "DB health: HTTP %{http_code}\n" http://127.0.0.1:8001/health

# 3) Cek sqlite langsung (data canonical)
.\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect(r'D:\paax-data\db\portable.sqlite'); print('runs:', c.execute('SELECT COUNT(*) FROM dem_runs').fetchone()[0]); print('pages:', c.execute('SELECT COUNT(*) FROM dem_pages').fetchone()[0]); print('revision:', c.execute('SELECT version_num FROM alembic_version').fetchone()[0])"
```

Bila salah satu hop mengembalikan 500:

- periksa `D:\paax-data\runtime\document-intelligence.err.log` dan `db-plhut.err.log` untuk traceback;
- pastikan service web berjalan dengan `PAAX_PORTABLE_ACTOR_ID=local-desktop-user` (lihat §10.1) dan bootstrap DB menyertakan `local-desktop-user` sebagai anggota project;
- pastikan `INTERNAL_SERVICE_KEY` service web sama dengan key yang diterima `:8083` (proxy menolak 503 bila key tidak cocok);
- jangan mengganti error 500 menjadi data dummy — 404/403/503 dengan detail jelas adalah perilaku yang benar.

### Viewer Gambar Kerja berkedip atau sisi kanan terpotong

- pastikan build web dibuat ulang setelah perubahan viewer dan browser sudah hard refresh;
- pastikan runtime berasal dari `D:\paax-ai-main`, bukan worktree lama;
- jalankan acceptance manual Bagian 14.1 dan simpan diagnostik `coverage`, committed/materialized tile, renderer, upload failure, dan context loss;
- jika fallback hilang ketika `coverage-ready=false`, atau `coverage-ready=true` saat materialized tile kurang dari committed tile, hentikan acceptance dan laporkan sebagai kegagalan kritis;
- jangan memperbaiki gejala dengan timeout/delay arbitrer, menyembunyikan fallback lebih cepat, mengganti PDF dengan gambar dummy, atau mematikan jalur GPU secara permanen;
- jangan menyatakan masalah selesai hanya karena satu halaman tampak benar saat diam; pan, zoom, fit, resize, A→B→A, dan context loss wajib diperiksa.

### Build web tidak tersedia

```powershell
pnpm --dir apps/web build
```

### Port masih digunakan

Gunakan stop resmi. Jika port tetap aktif, periksa command line dan pastikan benar-benar proses PAAX sebelum menghentikannya. Jangan membunuh semua Python/Node.

### Migration gagal

- jangan hapus `portable.sqlite`;
- jangan jalankan `create_all` atau ubah `alembic_version` manual;
- periksa backup di `D:\paax-data\backups` dan file `.pre-cr2a.bak`;
- simpan pesan error untuk audit.

### Server tidak sehat

Periksa:

```text
D:\paax-data\runtime\*.out.log
D:\paax-data\runtime\*.err.log
D:\paax-data\runtime\runtime-manifest.json
```

Manifest/health tidak boleh memuat raw credential.

### AI tidak berjalan

Periksa hanya nama variabel yang diperlukan pada `.env.local`, jangan nilainya. Setelah memperbaiki environment, stop/start seluruh stack.

## 18. Perintah ringkas

Jika dependency, build, dan migration sudah siap:

```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```

Tetap verifikasi enam health endpoint setelah startup.


## 19. Catatan tambahan (2026-08-06) — PDF Viewer Native + instalasi PLHUT

### 19.1 Project tidak muncul di daftar (list projects kosong)
- Penyebab: `GET /projects` (service db) memfilter `owner_id == user.uid`. Aktor web = `local-desktop-user`, tapi project lama ber-owner `paax-web` → daftar kosong meski DB ada.
- Perbaikan: samakan `owner_id` project dengan aktor yang dipakai web:
  `UPDATE projects SET owner_id='local-desktop-user' WHERE id='PLHUT-SURAKARTA';`
  (bootstrap DB juga menambah `local-desktop-user` sebagai member owner — idempotent.)

### 19.2 Endpoint package-analysis 401
- Penyebab: identity `web-user-proxy` tidak punya scope `dem:read`; endpoint `package-analysis` memerlukan scope tersebut.
- Perbaikan: `Start-PLHUT-Local.ps1` definisi `web` scopes sekarang menyertakan `dem:read` (commit 96bfd4df). Setelah mengubah, stop/start stack agar registry identitas dibuat ulang.

### 19.3 DI multi-worker & cold-start lambat
- `document-intelligence` dijalankan dengan 2 uvicorn workers (commit 21eb4a0a) untuk menghindari serialisasi semua route di satu event loop.
- Konsekuensi: cold-start PDF 25MB bisa ~40 detik pada request pertama (parse dokumen); setelah cache hangat, index ≈2–4 detik, thumbnail ≈0,2 detik. Ini normal; jangan kill proses saat request pertama tampak lambat.

### 19.4 PDF Viewer Native (commit e82be93f…cf3abe1d)
- Renderer baru di `apps/web/src/components/drawing-intelligence/workspace/canvas/native/` (base-once + detail crop per settle + pinned pixels + coverage cache + memory budget + latest-wins scheduler).
- Feature flag: viewer default `legacy`; toggle `legacy`/`native` tersedia di halaman viewer (`di-viewer-mode-toggle`). Native belum jadi default sampai gate F5 (E2E/benchmark) selesai.


## 20. Quick Start — Instalasi / Pemulihan Project PLHUT (2026-08-06)

Langkah cepat agar PLHUT tampil dan semua modul bisa di-testing setelah instalasi bersih atau setelah stack di-restart:

### 20.1 Start stack (wajib DataRoot)
```powershell
Set-Location -LiteralPath "D:\paax-ai-main"
# 1) STOP semua (bila ada sisa):
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
# 2) START:
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot "D:\paax-data"
```
JANGAN start tanpa `-DataRoot "D:\paax-data"` — tanpa itu service membaca `%LOCALAPPDATA%\PAAX-AI\data` (kosong) → project hilang / index 500.
Wajib juga `PYTHONPATH=` dan `PYTHONHOME=` kosong saat menjalankan (polusi venv Hermes).

### 20.2 Verifikasi 6/6 health
```powershell
curl http://127.0.0.1:3000/api/health      # web
curl http://127.0.0.1:8001/health          # db-plhut
curl http://127.0.0.1:8081/health          # core-engine
curl http://127.0.0.1:8082/health          # ai-orchestrator
curl http://127.0.0.1:8083/health          # document-intelligence
curl http://127.0.0.1:8085/health          # site-agent
```
Semua harus `status: ok` + `commit` yang sama.

### 20.3 Pastikan project PLHUT terdaftar (owner_id)
Gejala: halaman proyek kosong / daftar project kosong padahal DB ada isinya.
Penyebab & perbaikan (lihat §19.1): aktor web = `local-desktop-user`, project lama ber-owner `paax-web`.
```powershell
# cek:
sqlite3 "D:\paax-data\db\portable.sqlite" "SELECT id, owner_id, status FROM projects;"
# perbaiki (sekali saja):
sqlite3 "D:\paax-data\db\portable.sqlite" "UPDATE projects SET owner_id='local-desktop-user' WHERE id='PLHUT-SURAKARTA';"
# cek anggota (local-desktop-user harus ada sebagai owner):
sqlite3 "D:\paax-data\db\portable.sqlite" "SELECT * FROM project_members WHERE project_id='PLHUT-SURAKARTA';"
```

### 20.4 Verifikasi API PLHUT (curl chain)
```powershell
# daftar project → harus memuat PLHUT-SURAKARTA
curl http://127.0.0.1:3000/api/db-projects/projects
# package-analysis (indeks drawing) → HTTP 200 (bukan 401/404)
curl "http://127.0.0.1:3000/api/db-projects/projects/PLHUT-SURAKARTA/drawing-intelligence/package-analysis?run_id=514fb7f2-26fd-5816-9f22-a4a2412688bf"
# intelligence summary → HTTP 200
curl "http://127.0.0.1:3000/api/document-intelligence/drawings/dem/514fb7f2-26fd-5816-9f22-a4a2412688bf/intelligence?view=summary"
# thumbnail → HTTP 200
curl -o thumb.jpg "http://127.0.0.1:3000/api/db-projects/projects/PLHUT-SURAKARTA/pages/10/thumbnail?width=400"
```
Catatan: request pertama setelah start bisa lambat (±40 dtk) karena DI memparse PDF 25 MB (cold start); request berikutnya cepat (2–4 dtk).

### 20.5 Auth & scope (jika 401 muncul)
- `package-analysis` butuh scope `dem:read` pada identity `web-user-proxy` — sudah ditambahkan di `Start-PLHUT-Local.ps1` (commit 96bfd4df). Jika 401 muncul, restart stack (registry identitas dibuat ulang saat start).
- Jangan ubah `INTERNAL_SERVICE_KEY` di `.env.local` web — service membaca credential dari registry `D:\paax-data
untime\service-credentials\web.key`.

### 20.6 Viewer PDF (legacy vs native)
- Toggle viewer tersedia di halaman sheet (`legacy`/`native`); native = render base-once + crop-settle + pinned pixels (tanpa blur/loading saat zoom).
- Setelah mengganti kode viewer: build ulang `pnpm --dir apps/web build` lalu **stop → start ulang** (jangan start ulang tanpa build baru — bisa memicu client-side exception karena chunk mismatch).
