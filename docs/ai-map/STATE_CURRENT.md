# 📍 PAAX — STATE_CURRENT (status aktif, ringkas)

> Update terakhir: **2026-07-19**. Riwayat lengkap sebelum 2026-07-14 ada di
> `docs/history/STATE_ARCHIVE_2026-06_2026-07.md`. File ini HANYA status
> aktif — jangan tambah narasi panjang di sini, tulis laporan detail ke
> `report/` lalu ringkas 1-2 baris di sini.

## Mandat strategis Drawing Intelligence (2026-07-19, Fase 0, 1 & 2 SELESAI)
- Master Plan diratifikasi + Amendemen 1 + PAAX_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_REVISED.md.
- Fase 0 (Baseline, Feature Flags, upload security, logic leakage block, review queue API confirmation, mock fallback block) SELESAI di branch `feat/drawing-intelligence-truth-rebuild`. Detail: `docs/plans/drawing intelligence/Versi 1.1/PHASE_0_COMPLETION_REPORT.md`.
- Fase 1 (Documentation and Active-State Reconciliation) SELESAI. Detail: `docs/plans/drawing intelligence/Versi 1.1/PHASE_1_COMPLETION_REPORT.md`.
- Fase 2 (Evidence Truth Layer) SELESAI. Immutability guard, synthesis rewrite, composite foreign keys, dan citation package v2 telah diimplementasikan penuh di backend (`services/db`, `services/document-intelligence`) dan AI Orchestrator (`services/ai-orchestrator`). Detail: `docs/plans/drawing intelligence/Versi 1.1/PHASE_2_COMPLETION_REPORT.md`.
- **Phase 09E & Phase 10 (Feedback 1 Audit, E2E & Controlled Benchmark):**
  - Phase 09E: Truthful real-stack integration (Web, Core Engine, DB API, Doc Intel) and 88-page PLHUT dataset seeded into SQLite project graph (3,407 nodes, 3,768 edges). Playwright E2E browser test passed (2/2).
  - Phase 10A: Fail-closed Feedback 1 audit matrix (`feedback1_matrix.json`) covering P2-P62 losslessly with offline quality runner.
  - Phase 10B: Real-stack 4-service E2E browser gate (`feedback1-real-stack.spec.ts`) passed on 53-page Gedung A source PDF & PLHUT dataset without route interception. Visual checklist recorded in `apps/web/e2e/feedback1-visual-checklist.md`.
  - Phase 10C: Non-secret controlled benchmark ledger (`FEEDBACK1_AI_BENCHMARK_2026-07-26.json`) and full audit report (`FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md`) generated. DeepSeek 401 provider error logged honestly as BLOCKED (0 calls) with rule-based fallback active. All 61 matrix entries verified.
- Semua test otomatis hijau lintas paket: Python Backend `services/db` (88 tests passed), `services/document-intelligence` (offline contract & report tests passed), Core Engine (303 tests passed), `apps/web` (Vitest & Playwright E2E passed).

## Branch & PR aktif
- Branch kerja mandat: `feat/drawing-intelligence-truth-rebuild` (aktif dikerjakan, Phase 0, 1, dan 2 selesai).
- PR draft lama (#42-#47 stacked review/pckm-*) ditandai legacy.
- PR historis #29-#40 sudah merge ke `main`.

## Yang sudah nyata jalan di `main` (terverifikasi lewat kode + git log, bukan laporan)
- **Command Room** — chat AI utama baru (`apps/web/src/app/(dashboard)/command-room/`),
  terpisah dari chat lama per-proyek (`proyek/[projectId]/chat/`, masih ada,
  belum dihapus). Model routing 3 model: **Lucent**=DeepSeek V4 Pro,
  **Arete**=Qwen3.7-Plus (DashScope), **Noir**=Claude Sonnet 5 (Anthropic) via
  `lib/paax-models.ts`. `projectId` sudah opsional di request chat
  (`app/api/command-room/chat/route.ts:42-49`, "Fase 10 PLAN.md §9"), belum
  dipakai untuk retrieval terstruktur. Masih churn aktif — belum dianggap stabil.
- **Drawing Intelligence** — pakai NVIDIA + Gemini untuk OCR/reasoning gambar
  kerja: `app/perception/ocr/nvidia_vision_extractor.py` +
  `app/perception/ai_assist/client.py` (`GeminiAiAssistClient`,
  `NvidiaAiAssistClient`, `NullAiAssistClient` — belum ada varian
  Qwen/Anthropic vision). `is_raster_sheet()` gate
  (`app/perception/ingest/raster_detector.py`) masih memblokir vision untuk
  PDF vector-native — DEM extraction pipeline (Phase 2+ rencana ini) akan
  melepas gerbang itu.
- **DEM/PCKM plan** — `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`
  disetujui sebagai arsitektur target (2026-07-14). Implementation plan Phase
  0+1 (dokumen ini) di `docs/superpowers/plans/`.

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
