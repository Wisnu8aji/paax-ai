# Panduan Lengkap Instalasi, Update, Penggabungan, Verifikasi, dan Rollback PAAX + PLHUT

**Paket:** `PAAX-AI-Main-PLHUT-Agentic-Development-Complete-2026-07-25.zip`  
**Model distribusi:** full-source release, bukan kumpulan file patch.  
**Proyek bawaan:** `PLHUT-SURAKARTA`, PDF asli 88 halaman, dibuat atau diperbaiki secara idempotent saat DB portable dimulai.

## 1. Prinsip yang wajib dipahami

1. Source terkelola dari release lama diganti oleh source release baru.
2. Data lokal tidak boleh ditimpa: seluruh `data/portable`, `.env.local`, `apps/web/.env.local`, `.local-runtime`, `.git`, `node_modules`, `.venv`, `.next`, dan `.turbo` dipertahankan.
3. Update membuat backup timestamp sebelum menulis source baru.
4. PLHUT tidak dihapus dan tidak di-seed ulang secara destruktif. Bootstrap hanya membuat proyek bila belum ada dan memperbaiki artefak yang hilang.
5. Project lain, chat, review, calculation, takeoff, entity links, agent runs, dan event journal tetap berada di `data/portable`.
6. Jangan drag-and-drop isi ZIP ke project utama tanpa script update. Cara itu dapat menyisakan source lama atau menimpa data lokal.

## 2. Persyaratan Windows

- Windows 10/11 64-bit.
- Node.js 20 atau 22.
- Corepack/pnpm 9.15.0.
- Python 3.11–3.13.
- PowerShell 5.1 atau PowerShell 7.
- Ruang kosong minimal 3 GB untuk dependency dan runtime.

Verifikasi:

```powershell
node --version
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version
python --version
```

## 3. Instalasi baru

1. Ekstrak ZIP ke folder final, misalnya:

```text
D:\paax-ai-main
```

2. Buka PowerShell di folder tersebut.
3. Jalankan setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1
```

4. Jalankan sistem:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1
```

5. Buka:

```text
http://127.0.0.1:3000
```

Startup membuat runtime identity lokal, menjalankan migration/database, memastikan PLHUT tersedia, lalu menyalakan Core Engine, Document Intelligence, AI Orchestrator, Site Agent, dan web.

## 4. Verifikasi instalasi baru

Jalankan dari root project:

```powershell
python .\scripts\portable\preflight.py --allow-running
python .\scripts\portable\verify_phase30_runtime.py
python .\scripts\portable\verify_phase62_completion.py
python .\scripts\portable\verify_phase62_concurrency.py
python .\scripts\portable\benchmark_phase62.py
python .\scripts\portable\security_audit.py
```

Verifikasi manual pada web:

- Dashboard menampilkan `PLHUT Surakarta`.
- PLHUT dapat dipilih dan menjadi project aktif.
- Drawing Intelligence menampilkan 88 sheet.
- Halaman manusia 43 menampilkan `DENAH KOLOM LANTAI 2` dari PDF asli.
- Quantity menampilkan item, lokasi, jenis, satuan, ukuran, jumlah, formula, hasil, status, dan sumber; bukan hash internal.
- K2 Lantai 2 menunjukkan 4 unit, 0,250 × 0,600 × 3,900 m, dan 2,340 m³.
- Command Room menjawab dalam scope PLHUT dan menampilkan sumber halaman 43, 50, dan 54.
- Query K9 harus abstain, bukan mengarang nilai.
- Tab Takeoff dan Mission Control dapat dibuka.

## 5. Update folder `paax-ai-main` yang sudah ada

Contoh:

- Release baru diekstrak ke `D:\Download\PAAX-NEW`.
- Project utama lama berada di `D:\paax-ai-main`.

### 5.1 Wajib sebelum update

1. Hentikan pekerjaan aktif.
2. Commit atau stash perubahan Git lokal.
3. Salin `.env.local` secara terpisah bila Anda ingin cadangan tambahan.
4. Lakukan dry-run:

```powershell
cd D:\Download\PAAX-NEW
python .\scripts\portable\update_paax_main.py `
  --source . `
  --target "D:\paax-ai-main" `
  --mode replace-managed `
  --dry-run
```

### 5.2 Update otomatis yang direkomendasikan

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Update-PAAX-Main.ps1 `
  -TargetPath "D:\paax-ai-main" `
  -Mode replace-managed
```

Urutan script:

1. menghentikan runtime lama;
2. memvalidasi source release;
3. membuat backup `paax-ai-main-backup-YYYYMMDD-HHMMSS`;
4. menghapus file terkelola lama yang tidak lagi ada dalam manifest baru;
5. menyalin source baru secara atomic;
6. mempertahankan semua runtime state dan Git lokal;
7. menjalankan setup/migration;
8. menyalakan runtime baru;
9. bootstrap PLHUT sebelum web digunakan.

Laporan update tersimpan di:

```text
D:\paax-ai-main\report\PAAX_LAST_UPDATE_REPORT.json
```

### 5.3 Update tanpa langsung menyalakan server

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Update-PAAX-Main.ps1 `
  -TargetPath "D:\paax-ai-main" `
  -Mode replace-managed `
  -SkipStart
```

Gunakan ini bila Anda ingin audit Git diff terlebih dahulu.

## 6. Penggabungan dengan repository Git lokal

```powershell
cd D:\paax-ai-main
git status
git add -A
git commit -m "checkpoint sebelum update agentic PAAX"
git switch -c update/paax-agentic-development-complete
```

Kemudian jalankan update dengan `-SkipStart`. Setelah selesai:

```powershell
git status
git diff --stat
git diff
```

Periksa terutama:

- `services/document-intelligence`;
- `services/ai-orchestrator`;
- `apps/web/src/components/drawing-intelligence`;
- `scripts/portable`;
- `.env.example` dan `.env.local.example`.

Jangan commit `.env.local`, database, runtime key, atau `data/portable`.

## 7. Data yang dipertahankan saat update

Seluruh folder berikut dianggap runtime state dan tidak berasal dari release:

```text
data/portable/
  paax-portable.db
  agent-runs.json
  agent-events.jsonl
  agent-dead-letter.jsonl
  takeoff-workspace.json
  entity-links.json
  backups/
```

Juga dipertahankan:

```text
.env.local
apps/web/.env.local
.local-runtime/
.git/
node_modules/
.venv/
.next/
.turbo/
```

## 8. Backup dan restore manual

### Backup

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Backup-PAAX-Portable.ps1
```

atau:

```powershell
python .\scripts\portable\backup_restore.py backup `
  --output ".\data\portable\backups\paax-backup.zip"
```

### Restore

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Restore-PAAX-Portable.ps1 `
  -BackupPath ".\data\portable\backups\paax-backup.zip"
```

Checksum setiap file dalam backup diverifikasi sebelum restore.

## 9. Rollback update source

Gunakan path backup yang tercatat pada update report:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Rollback-PAAX-Update.ps1 `
  -TargetPath "D:\paax-ai-main" `
  -BackupPath "D:\paax-ai-main-backup-20260725-120000"
```

Rollback source tidak boleh menghapus runtime state terbaru. Untuk mengembalikan database/runtime state ke waktu sebelumnya, gunakan backup portable secara terpisah.

## 10. Cara memastikan PLHUT benar-benar terpasang

1. Periksa DB service:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

2. Periksa project dengan internal runtime melalui verification script:

```powershell
python .\scripts\portable\verify_phase30_runtime.py
```

3. Periksa file wajib:

```text
fixtures/plhut/project-manifest.json
fixtures/plhut/dem-pages/page-0000.json ... page-0087.json
fixtures/plhut/civil-work-items.json
GAMBAR KERJA PLHUT SURAKARTA (1).pdf
```

4. Restart sistem dua kali. PLHUT harus tetap hanya satu record dan project lain tidak boleh hilang.

## 11. Troubleshooting

### PLHUT tidak muncul

- Baca `.local-runtime\db-plhut.err.log`.
- Jalankan `preflight.py`.
- Pastikan PDF hash tidak berubah.
- Pastikan `PAAX_PORTABLE_ACTOR_ID=paax-web` pada seluruh service.
- Jangan menghapus database untuk “memperbaiki” seed.

### Command Room tidak mengikuti project

- Conversation wajib mempunyai `boundProjectId`.
- Request wajib membawa `projectId`.
- Connector hanya memilih tool/domain, bukan memilih project.
- Actor web, proxy, DB, dan AI Orchestrator harus konsisten.

### Gambar kerja kosong

- Uji source manifest dan endpoint page image.
- Canvas harus memprioritaskan `realImageUrl`.
- Synthetic SVG hanya fallback diagnostics.

### Quantity masih menampilkan code internal

- Pastikan frontend memakai Civil Work Item Projection, bukan raw graph nodes.
- Internal ID hanya boleh tampil di technical inspector.
- Periksa readiness, formula, unit, dan source refs.

### Mission Control menampilkan 503

- Pastikan AI Orchestrator port 8082 sehat.
- Periksa `.local-runtime\ai-orchestrator.err.log`.
- Pastikan pnpm dependency terpasang dan `AI_ORCHESTRATOR_URL` benar.

### Update berhenti di dependency

- Jangan hapus backup.
- Periksa koneksi registry npm/pip.
- Jalankan setup ulang setelah koneksi tersedia.
- Source update dapat diaudit dengan `git diff` sebelum server dinyalakan.

## 12. Status release yang benar

Paket ini merupakan **development-complete integration release** untuk seluruh kontrak dan fondasi 62 fase. Ia telah diuji pada PLHUT, service runtime, calculation, persistence, security, concurrency, update, backup, dan regression suite. Sertifikasi professional-production universal tetap membutuhkan:

- benchmark beberapa proyek independen non-PLHUT;
- integrasi solver eksternal yang benar-benar tersedia;
- pilot/shadow operation bersama engineer Indonesia;
- review legal/professional liability organisasi pengguna.

Batas tersebut tidak mengurangi kelengkapan paket pengembangan, tetapi mencegah klaim produksi yang belum dibuktikan di lapangan.

---

## 15. Controller `paaxctl` dan audit rilis final

Perintah diagnosis lintas platform:

```powershell
python .\scripts\portable\paaxctl.py doctor
python .\scripts\portable\paaxctl.py status
python .\scripts\portable\paaxctl.py logs db-plhut --lines 100
```

Pada Windows, controller juga dapat memanggil script setup/start/stop:

```powershell
python .\scripts\portable\paaxctl.py setup
python .\scripts\portable\paaxctl.py start
python .\scripts\portable\paaxctl.py stop
```

Reset demo bersifat eksplisit dan menghapus state portable. Backup terlebih dahulu:

```powershell
python .\scripts\portable\paaxctl.py reset-demo --confirm RESET-PLHUT-DEMO
```

PLHUT akan dibuat kembali secara idempotent saat startup berikutnya. Reset tidak boleh digunakan untuk update biasa.

Artefak audit:

- `docs/PAAX_64_PHASE_IMPLEMENTATION_MATRIX_2026-07-25.md`
- `docs/PAAX_AGENTIC_PHASE_31_64_IMPLEMENTATION_AUDIT_2026-07-25.md`
- `release/PAAX_RELEASE_CERTIFICATE.json`
- `release/PAAX_SBOM.json`
- `release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json`

Status rilis yang benar adalah **development integration complete**. Validasi full Next.js pada device target, benchmark eksternal, penetration test, dan professional pilot tetap menjadi gate sebelum klaim production universal.
