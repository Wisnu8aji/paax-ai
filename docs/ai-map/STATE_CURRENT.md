# 📍 PAAX — STATE_CURRENT (status aktif, ringkas)

> Update terakhir: **2026-07-10**. Riwayat lengkap sebelum tanggal ini ada di
> `docs/history/STATE_ARCHIVE_2026-06_2026-07.md`. File ini HANYA status
> aktif — jangan tambah narasi panjang di sini, tulis laporan detail ke
> `report/` lalu ringkas 1-2 baris di sini.

## Branch & PR aktif
- Branch kerja: `feat/command-room-updates` (belum di-PR/merge).
- PR historis #29-#40 semua sudah merge ke `main` (bridging non-struktur,
  X1/X1B/X2 AI-assist, packaging schemas).

## Yang sudah nyata jalan di `main` (terverifikasi lewat kode + git log, bukan laporan)
- **Command Room** — chat AI utama baru (`apps/web/src/app/(dashboard)/command-room/`),
  terpisah dari chat lama per-proyek (`proyek/[projectId]/chat/`, masih ada,
  belum dihapus). Model routing Lucent (NVIDIA Kimi/DeepSeek-chat) & Solace
  (NVIDIA DeepSeek-reasoner) via `lib/paax-models.ts` + `lib/ai/orchestrator.ts`.
  **Masih churn aktif** (3 rewrite besar dalam 4 hari) — belum dianggap stabil.
- **Drawing Intelligence** — sekarang pakai NVIDIA (bukan cuma Gemini) untuk
  OCR/reasoning gambar kerja: `nvidia_vision_extractor.py` + `ai_assist/client.py`.
  Diuji nyata ke PLHUT 88 halaman: 42 work item (33 perlu review, 9 belum
  didukung rumus) — AI membantu ringkasan, tidak pernah mengarang volume RAB.
- **R2-R14 (backend non-UI, semua sudah merge)**: job store persisten +
  cache analisis (R2/R3), golden-anchor test harness (R4), deteksi geometri
  dinding/simbol (R5), service `services/db` (Alembic + CRUD + RAG/pgvector,
  R6/R8), `services/ai-orchestrator` tool-calling + SSE + audit log (R7),
  Auth/RBAC lintas service (R10), metering + laporan pagi (R11/R12), price
  book versioning per region (R13), `services/site-agent` scaffold (R14).
- **Audit independen R2-R14** (`report/remote/AUDIT_MASTER_R2_R14_ANTIGRAVITY_2026-07-07.md`)
  menemukan & memperbaiki bug nyata (bukan cuma verifikasi bersih): ai-orchestrator
  sempat gagal build (CommonJS vs ESM), test DB awalnya butuh Postgres lokal
  (sekarang ada fallback SQLite utk test), site-agent awalnya linear-fallback-only
  (diupgrade manggil db-api RAB + core-engine `/schedule/s-curve` nyata).

## Blocker / catatan jujur yang masih berlaku
- **Deploy Cloud Run (R9) belum pernah dry-run** — Dockerfile & workflow ada,
  tapi tidak ada kredensial GCP yang dikonfigurasi. Belum diverifikasi jalan.
- **Dua implementasi NVIDIA/DeepSeek paralel** (`lib/ai/orchestrator.ts` vs
  `app/api/command-room/chat/route.ts`) — logika mirip (payload, retry,
  timeout) belum disatukan. Berisiko drift kalau salah satu diubah sendirian.
- **`services/db` RAG/pgvector belum diuji ke Postgres nyata** — hanya
  fallback SQLite untuk test lokal; katalog AHSP asli juga belum di-index
  (indexer baca `G:/paax-data/ahsp.json` eksternal, belum bagian repo).
- **`services/site-agent`** masih scaffold modest (main.py 243 baris, store
  in-memory sebagian) — bukan integrasi penuh ke DB produksi.

## Pekerjaan sesi ini (2026-07-10, Claude + owner)
- Graphify (v0.9.11, dipatok) dipasang penuh: skill Claude Code, PreToolUse
  hook, git hook (post-commit/post-checkout), `.graphifyignore`/`.claudeignore`.
  Graph pertama: 4.263 node/8.829 edge (akan direbuild setelah restrukturisasi
  dokumentasi ini — lihat §Berikutnya).
- Cleanup disk: ~103MB cache/build artifact regenerable dihapus; 14 file
  `.AI-*.log` (ternyata ter-track git tanpa sengaja) di-untrack + di-gitignore,
  diarsipkan ke `G:\paax-cleanup-archive\2026-07-10\` (di luar repo).
- **Insiden ditemukan & diperbaiki**: commit lain (`f67e3fa`, di luar sesi
  Claude) mem-blind-replace "Claude"/"Codex" jadi "Saya" di banyak file,
  termasuk merename `CLAUDE.md`→`AI.md` dan merusak §9 AGENTS.md jadi "SAYA
  vs SAYA". Sudah diperbaiki untuk file aktif (`CLAUDE.md`, `AGENTS.md`,
  `.claude/CLAUDE.md`) — riwayat lengkap di git log commit `2e34101`/`a2e01c8`/`65909e7`.
  ~50 file historis (`docs/prompts/PAAX_AI_*`, `report-remote/*_AI_*.md`)
  sengaja TIDAK direvert (bukan file aktif, di luar scope).
- `CLAUDE.md`/`AGENTS.md` diringkas 237→109 baris (aturan permanen saja).
  `START_HERE.md` & `MAP.md` diarsipkan ke `docs/history/`, digantikan
  `docs/INDEX.md` (indeks on-demand) + Graphify. `STATE.md` dipecah jadi
  file ini + `docs/history/STATE_ARCHIVE_2026-06_2026-07.md`.
- `graphify-out/` (347 file, ~10MB) berhenti di-track git (sempat ter-commit
  tanpa sengaja) — sekarang di `.gitignore`, tetap ada lokal & bisa di-query.

## Keputusan owner (sesi ini)
- Graphify jadi sistem utama navigasi kode — Glob/Grep manual hanya fallback.
- Command Room & seluruh file terkait (model routing, chat state, provider
  config) **dilindungi eksplisit** dari cleanup — lihat `CLAUDE.md` §6.
- Restrukturisasi dokumentasi dilakukan bertahap per kelompok perubahan,
  commit terpisah, diff ditampilkan sebelum commit — bukan satu commit besar.

## Berikutnya
1. Perbarui README/dokumentasi service (endpoint, provider, versi) agar
   sesuai kondisi kode aktual — hapus klaim usang (v0.6 aktif, Gemini
   provider utama Command Room, service "belum dibangun" yang sudah ada).
2. Rebuild Graphify penuh (source sudah banyak berubah sejak graph pertama),
   jalankan query nyata per service sbg bukti, jalankan test/lint/typecheck,
   cek link dokumentasi, laporkan ukuran/token sebelum-sesudah.
3. Pertimbangkan konsolidasi 2 implementasi NVIDIA/DeepSeek yang paralel
   (bukan pekerjaan sesi ini, dicatat sbg gap jujur).
4. Dry-run deploy Cloud Run begitu kredensial GCP tersedia (belum dijadwalkan).
