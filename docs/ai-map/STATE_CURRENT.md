# 📍 PAAX — STATE_CURRENT (status aktif, ringkas)

> Update terakhir: **2026-07-17**. Riwayat lengkap sebelum 2026-07-14 ada di
> `docs/history/STATE_ARCHIVE_2026-06_2026-07.md`. File ini HANYA status
> aktif — jangan tambah narasi panjang di sini, tulis laporan detail ke
> `report/` lalu ringkas 1-2 baris di sini.

## Mandat strategis Drawing Intelligence (2026-07-17, SELESAI — siap uji terbatas)
- Master Plan diratifikasi + Amendemen 1:
  `docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md`
  (arsitektur L0-L4, Decision Register D1-D13, roadmap Gelombang A/B/C + spec eksekusi).
- Semua 3 akar masalah FIXED & diverifikasi: gerbang occurrence (A2), pseudo-level (A3),
  intent/serving absen (B4-B6) + integritas DEM (A4). Detail lengkap + status per-item:
  `report/report_drawing_intelligence/FINAL_READINESS_REPORT_2026-07-17.md`.
- Benchmark ground-truth: baseline 1/8 → **14/14 PASS (skor akhir)**, termasuk fix terakhir
  entity matching tokenized ("balok lintel" query). `BENCHMARK_SCORECARD_2026-07-17.md`.
- **Pengujian live Command Room (Lucent + Arete) via chat sungguhan berhasil** — 5 skenario
  golden-path (lokasi elemen, filter lintas lantai, penolakan kalkulasi/Aturan Emas, deteksi
  konflik, kejujuran level tak dikenal) semua benar & bersitasi. 2 bug produksi ditemukan &
  diperbaiki selama pengujian ini (RBAC identity mismatch Command Room↔services/db;
  status-field top-level "calculation_required" disalahbaca sbg kegagalan) — lihat §5
  laporan akhir untuk root cause lengkap.
- 656 test otomatis hijau lintas paket (doc-intel 441, db 64, ai-orchestrator 50, web 71,
  schemas 30) + tsc bersih. Belum di-PR ke main — menunggu keputusan pemilik (gerbang §5
  CLAUDE.md).

## Branch & PR aktif
- Branch kerja mandat: `feat/pckm-phase3-synthesis` (garis terlengkap, 36+ commit di
  depan main; banyak pekerjaan wave A/B masih uncommitted di working tree).
- PR draft #42-#47 (stacked review/pckm-*) = kemasan lama, tertinggal dari HEAD —
  keputusan D1: supersede dengan satu PR segar (menunggu keputusan owner).
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
