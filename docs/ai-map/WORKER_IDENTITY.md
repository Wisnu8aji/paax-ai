# PAAX Command Room Worker — Identitas Artefak

Dokumen ini adalah kontrak identitas dan batas audit untuk artefak
`paax-command-room-worker`. Ia meniru pola audit Hermes: provenance yang dapat
ditelusuri, scope file yang eksplisit, hitungan byte, SHA-256 byte-mentah, dan
status graph yang dapat diverifikasi ulang.

## Bidang identitas

| Bidang | Nilai / sumber kebenaran |
| --- | --- |
| Nama artefak | `paax-command-room-worker` (full AI agent) |
| Workspace | `D:\\paax-ai-command-room-worker` |
| Provenance anchor | Baseline git commit `1013955`; manifest juga mencatat `git rev-parse HEAD` saat generate |
| Versi artefak worker | `0.1.0`, dari `services/ai-orchestrator/package.json` |
| Versi manifest/skema | `WORKER_MANIFEST_SCHEMA = 1` |
| Versi root | `0.6.0`, dari root `package.json` |
| Versi surface web | `0.6.0`, dari `apps/web/package.json` |
| Versi runtime | `0.1.0`, dari `services/ai-orchestrator/package.json` |
| Batas audit | File runtime Command Room yang tercantum pada scope di bawah; build output dan data mutable dikecualikan |
| Metode verifikasi | `node scripts/worker-identity.mjs verify`; membandingkan count, byte, SHA-256, `missing`, `unexpected`, dan `mismatch` |
| Format path manifest | Forward slash, relatif terhadap root repository |
| Manifest mesin | `data/portable/worker-manifest.json` |
| Test identitas | `node --test scripts/worker-identity.test.mjs` |
| Graphify | Graph code-only per modul; baseline dicatat di tabel Graphify dan diperbarui setelah scaffold |

## Scope audit

Scope ini mewakili jalur runtime Command Room, kontrak bersama, serta peta
arsitektur worker. Pola dicocokkan relatif terhadap root repository dan semua
path yang masuk manifest dinormalisasi ke forward slash.

```text
services/ai-orchestrator/src/**/*.ts
services/ai-orchestrator/package.json
services/ai-orchestrator/tsconfig.json
services/ai-orchestrator/vitest.config.ts
apps/web/src/app/(dashboard)/command-room/**
apps/web/src/components/command-room/**
apps/web/src/app/api/command-room/**
apps/web/src/lib/command-room/**
apps/web/src/lib/chat/**
apps/web/src/lib/ai/**
apps/web/src/lib/paax-models.ts
packages/schemas/src/**
docs/ai-map/WORKER_IDENTITY.md
docs/ai-map/ARCHITECTURE_LAYERS.md
docs/ai-map/DIRECTORY_MAP.md
scripts/worker-identity.mjs
```

`services/ai-orchestrator/src/**/*.ts` mencakup file TypeScript yang sudah ada
dan stub Phase 1 yang akan ditambahkan di bawah runtime home kanonik. Scope ini
tidak memberi otoritas untuk mengubah file existing; ia hanya menetapkan file
yang diaudit.

## Exclude eksplisit

Path berikut tidak boleh masuk manifest, walaupun berada di bawah pola scope:

```text
node_modules
.next
.git
graphify-out
dist
build
.local-runtime
.local-test-logs
data/**
*.log
.env*
pnpm-lock.yaml
data/portable/worker-manifest.json
agent-runs.json
```

File biner (PDF, gambar, audio, video, dan arsip) juga tidak masuk scope
runtime. Manifest tidak boleh meng-hash dirinya sendiri; oleh karena itu
`data/portable/worker-manifest.json` selalu dikecualikan secara eksplisit.

## Verifikasi mekanis

Perintah berikut adalah antarmuka audit resmi:

```powershell
node scripts/worker-identity.mjs generate
node scripts/worker-identity.mjs verify
node --test scripts/worker-identity.test.mjs
```

`generate` berjalan dari root repository, membaca byte mentah, menghitung
`counts.totalFiles` dan `counts.totalBytes`, menghitung SHA-256 tiap file, lalu
menulis `data/portable/worker-manifest.json` dengan `provenance.gitCommit` dan
`provenance.generatedAt`. `verify` mengulang walk yang sama dan exit `0` hanya
jika `missing=[]`, `unexpected=[]`, dan `mismatch=[]`; selain itu exit `1`.

Hash bersifat deterministik terhadap byte yang ada di disk. Reproduksi lintas
mesin tetap memerlukan checkout/line-ending yang konsisten; perbedaan CRLF dan
LF akan terlihat sebagai mismatch, bukan disamarkan oleh normalisasi string.

## Graphify baseline sebelum scaffold

Graph dibangun pada baseline `1013955` dengan Graphify package `0.9.43`.
Runtime menampilkan warning bahwa instruksi skill berasal dari `0.9.26`; versi
terpasang `0.9.43` dipertahankan dan dicatat, tanpa menjalankan install global.

| Modul | Command aktual | Nodes | Edges (`links` di graph.json) | Status query |
| --- | --- | ---: | ---: | --- |
| `services/ai-orchestrator` | `graphify update services/ai-orchestrator` | 479 | 934 | `AIAgent`: tidak ada node literal; query `agentic` dan `runtime`: berhasil |
| `apps/web` | `graphify update apps/web` | 2.751 | 5.670 | graph terbentuk; tidak menjadi query utama Langkah 0 |

Rencana meminta `graphify update <path> --code-only --no-viz`, tetapi Graphify
`0.9.43` menolak opsi tersebut pada subcommand `update` (`unknown update option:
--code-only`). Fallback resmi yang tersedia, `graphify update <path>` (yang
memang menjelaskan dirinya sebagai code-only dan memperbarui graph), berhasil
dijalankan untuk kedua modul. Query literal `AIAgent` tidak menjadi BLOCKER
graph-file karena graph tersedia, tetapi hasil kosong dicatat sebagai
keterbatasan baseline: simbol target `src/agent/runtime.ts` belum ada pada
Phase 1 awal.

## Graphify setelah scaffold Phase 1

| Modul | Command aktual | Nodes | Edges (`links` di graph.json) | Query verifikasi |
| --- | --- | ---: | ---: | --- |
| `services/ai-orchestrator` | `graphify update services/ai-orchestrator` | 546 | 945 | `runtime.ts` dan `session-db.ts`: berhasil |
| `apps/web` | `graphify update apps/web` | 2.751 | 5.670 | topology tidak berubah; graph tersedia |

Nilai post-scaffold ini juga tersalin ke `graphify` pada
`data/portable/worker-manifest.json`. Graphify tetap memberi catatan bahwa
graph memakai pre-#1504 node-ID scheme; hal itu adalah warning tool, bukan
perubahan source worker.

## Batas perubahan Phase 1

Phase 1 hanya menambah identitas, script audit, peta arsitektur, receipt, dan
scaffolding terisolasi di runtime home. Tidak ada loop model, provider
transport, SessionDB, sandbox backend, cron, delegation, plugin, MCP, atau
konsolidasi `gemini/`/web loop yang diimplementasikan di phase ini.
