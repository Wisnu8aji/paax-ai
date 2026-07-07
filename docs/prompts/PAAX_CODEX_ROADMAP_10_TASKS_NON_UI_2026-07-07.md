# PAAX — ROADMAP 10+ TASK NON-UI JANGKA JAUH (2026-07-07)

> **Status: RINGKASAN + 13 PROMPT DETAIL SUDAH DITULIS (2026-07-07).**
> Task 1 (Task 05 lama), Task 2 (R2), Task 3 (R3), Task 4 (R4) **SUDAH
> DIEKSEKUSI & TER-COMMIT oleh Codex** (dikonfirmasi via `git reflog`:
> commit `0f91a95`/`932b138`/`4569035`/`c73ceb9`, branch `feat/x2-bridging-
> non-struktur-dinding-atap-kusen-mep` → `feat/cache-analisa-dokumen` →
> `feat/golden-eval-harness`). Task 5-14 **BELUM DIJALANKAN**. Prompt
> induk untuk rangkaian kerja backend/data/infra SETELAH rombak desain
> 2026-07-07 selesai. Disusun Claude atas instruksi owner: "pekerjaan
> selanjutnya yang tidak berhubungan dengan UI, minimal 10 task jauh ke
> depan, tiap task kompleks." Owner sudah mengkonfirmasi **Postgres
> (Cloud SQL)** untuk Task 6 (bukan Firestore) — semua prompt turunannya
> (7,8,10,11,12,14) sudah ditulis dengan asumsi itu.
>
> **CATATAN OPERASIONAL PENTING (2026-07-07, ditemukan pasca-insiden)**:
> file prompt di `docs/prompts/` ini TIDAK di-commit (sesuai aturan Claude
> tidak commit) — kalau Codex melakukan `git checkout`/`git clean` antar
> task, file YANG BELUM DIBACA/DIKERJAKAN bisa TERHAPUS dari working tree
> sebelum sempat dipakai. **Mitigasi**: sebelum mulai Task N, PASTIKAN
> working tree bersih dari branch lain dulu (`git status` di `main`), dan
> SEGERA commit file prompt yang relevan (`docs: add taskN prompt`) di
> AWAL branch task itu sendiri sebelum menulis kode — supaya prompt-nya
> ikut aman ter-commit bersama task, tidak lagi rawan hilang.
>
> **File prompt lengkap per task** (baca file terkait, BUKAN ringkasan di
> bawah, saat benar-benar menjalankan Codex):
> - Task 1 → `PAAX_CODEX_TASK_05_BRIDGING_ARSITEKTUR_PONDASI_LANTAI_ATAP_MIRING_AANSTAMPING_2026-07-05.md` (✅ SELESAI, commit `0f91a95`)
> - Task 2 → `PAAX_CODEX_TASK_R2_JOB_STORE_PERSISTEN_2026-07-07.md` (✅ SELESAI, commit `932b138`)
> - Task 3 → `PAAX_CODEX_TASK_R3_CACHE_ANALISA_DOKUMEN_2026-07-07.md` (✅ SELESAI, commit `4569035`)
> - Task 4 → `PAAX_CODEX_TASK_R4_GOLDEN_ANCHOR_EVAL_HARNESS_2026-07-07.md` (✅ SELESAI, commit `c73ceb9`, branch `feat/golden-eval-harness`)
> - Task 5 → `PAAX_CODEX_TASK_R5_DETEKSI_GEOMETRI_NONSTRUKTUR_LANJUTAN_2026-07-07.md` (belum dijalankan)
> - Task 6 → `PAAX_CODEX_TASK_R6_DATABASE_SERVER_SIDE_POSTGRES_2026-07-07.md` (5 sub-PR, belum dijalankan)
> - Task 7 → `PAAX_CODEX_TASK_R7_AI_ORCHESTRATOR_TAHAP2_2026-07-07.md` (belum dijalankan)
> - Task 8 → `PAAX_CODEX_TASK_R8_RAG_VECTOR_STORE_AHSP_2026-07-07.md` (belum dijalankan)
> - Task 9 → `PAAX_CODEX_TASK_R9_DEPLOY_CICD_CLOUD_RUN_2026-07-07.md` (belum dijalankan)
> - Task 10 → `PAAX_CODEX_TASK_R10_AUTH_RBAC_2026-07-07.md` (belum dijalankan)
> - Task 11 → `PAAX_CODEX_TASK_R11_METERING_OBSERVABILITAS_2026-07-07.md` (belum dijalankan)
> - Task 12 → `PAAX_CODEX_TASK_R12_LAPORAN_PAGI_OTOMATIS_2026-07-07.md` (belum dijalankan)
> - Task 13 → `PAAX_CODEX_TASK_R13_HARGA_MULTI_WILAYAH_VERSIONING_2026-07-07.md` (belum dijalankan)
> - Task 14 → `PAAX_CODEX_TASK_R14_SITE_AGENT_SCAFFOLD_2026-07-07.md` (belum dijalankan)
>
> **Cara pakai**: SATU task (atau SATU sub-langkah untuk Task 6) = SATU
> sesi Codex = SATU branch baru → PR draft → tunggu review owner + Claude.
> JANGAN kerjakan dua task dalam satu branch. Task berurutan berdasarkan
> dependency (lihat §URUTAN & DEPENDENCY di bawah) — jangan lompat kecuali
> diminta owner.

---

## ATURAN WAJIB SEMUA TASK (tidak bisa ditawar)

1. **ATURAN EMAS** (`CLAUDE.md` §1): AI/LLM/TypeScript TIDAK PERNAH menghitung
   angka final. Semua volume/HSP/RAB/durasi dari `services/core-engine`.
   AI-assist hanya usulan tervalidasi berstatus `perlu_review` (§1.1).
2. **DILARANG menyentuh `apps/web/**`** — seluruh UI domain Claude.
3. **Branch baru → push → PR draft → BERHENTI.** Tidak self-merge, tidak
   commit/push ke `main`.
4. Commit **tanpa trailer apa pun** (`Co-Authored-By`/`Generated with` dilarang).
5. Tiap fungsi kalkulasi baru wajib test dengan **nilai acuan dihitung manual**.
6. Test penuh service yang disentuh HARUS hijau sebelum commit. Baseline saat
   ini: document-intelligence 272 passed/5 skipped, core-engine 280 passed,
   schemas 14 passed, ai-orchestrator 30 passed, web 47 passed (baseline
   pra-Task 1/R2/R3/R4 — angka aktual sudah naik setelah keempatnya
   ter-commit, cek `git log`/report masing-masing untuk angka terbaru).
7. Selesai task: tulis report baru di `report-remote/` (jangan timpa), update
   `docs/ai-map/STATE.md`.
8. Kalau menemui keputusan arsitektur ambigu → **STOP, tanya owner** — jangan
   asumsi diam-diam.

---

## TASK 1 — Bridging 4 Sub-Domain Arsitektur Sisa — ✅ SELESAI

Commit `0f91a95`. Lihat `PAAX_CODEX_TASK_05_BRIDGING_ARSITEKTUR_PONDASI_
LANTAI_ATAP_MIRING_AANSTAMPING_2026-07-05.md` untuk detail asli.

## TASK 2 — Job Store Persisten + Antrian Analisa Document-Intelligence — ✅ SELESAI

Commit `932b138`. Lihat `PAAX_CODEX_TASK_R2_JOB_STORE_PERSISTEN_2026-07-07.md`.

## TASK 3 — Cache Hasil Analisa per Dokumen (Biaya & Latency AI) — ✅ SELESAI

Commit `4569035`. Lihat `PAAX_CODEX_TASK_R3_CACHE_ANALISA_DOKUMEN_2026-07-07.md`.

## TASK 4 — Golden-Anchor Test Harness PLHUT + Eval per-Skill AI-Assist — ✅ SELESAI

Commit `c73ceb9`, branch `feat/golden-eval-harness`. Lihat
`PAAX_CODEX_TASK_R4_GOLDEN_ANCHOR_EVAL_HARNESS_2026-07-07.md`.

## TASK 5 — Deteksi Geometri Non-Struktur Lanjutan (gap jujur Fase X2)

Belum dijalankan. Prompt detail: `PAAX_CODEX_TASK_R5_DETEKSI_GEOMETRI_
NONSTRUKTUR_LANJUTAN_2026-07-07.md`. Tutup 3 gap deteksi geometri jujur
(garis dinding dari polygon, `qty_counted` kusen dari simbol, titik MEP
dari simbol) — deteksi DETERMINISTIK, bukan AI baru; hasil hanya kandidat
`perlu_review`/pembanding, tidak pernah auto-`dihitung`.

## TASK 6 — Database Proyek Server-Side (persistensi RAB/TKG/jadwal)

**✅ KEPUTUSAN OWNER (2026-07-07): Postgres (Cloud SQL).** Prompt detail
lengkap: `PAAX_CODEX_TASK_R6_DATABASE_SERVER_SIDE_POSTGRES_2026-07-07.md`
(5 sub-PR berurutan). Bangun service/lapisan data server-side untuk proyek,
draft RAB (input terstruktur), TKG tersimpan, dan riwayat chat — menggantikan
localStorage browser sebagai satu-satunya penyimpanan. Ini PRASYARAT
Engineering Chat lintas-proyek nyata (temuan audit B0: `query_rab` orchestrator
hanya bisa baca `context` kiriman client karena tidak ada DB server-side),
kolaborasi multi-user, dan monitoring v2.0.

## TASK 7 — AI-Orchestrator Tahap 2: Context Server-Side, Streaming, Audit Log

Prompt detail: `PAAX_CODEX_TASK_R7_AI_ORCHESTRATOR_TAHAP2_2026-07-07.md`.
Lanjutan Task 6: `query_rab`/`query_schedule` baca DB server-side (fallback
`context` client tetap ada), `POST /chat/stream` SSE baru (tanpa mengubah
`POST /chat` lama), audit log persisten tiap tool-call, rate-limit.

## TASK 8 — RAG Grounding: Vector Store AHSP + Dokumen Proyek

Prompt detail: `PAAX_CODEX_TASK_R8_RAG_VECTOR_STORE_AHSP_2026-07-07.md`.
`pgvector` di atas Postgres Task 6, indexer katalog AHSP CK 2026 (data
TIDAK di-commit), tool baru `search_knowledge` — jawaban wajib bisa
ditelusuri, bukan mengarang.

## TASK 9 — Deploy & CI/CD: Cloud Run + Secret Manager + Staging

Prompt detail: `PAAX_CODEX_TASK_R9_DEPLOY_CICD_CLOUD_RUN_2026-07-07.md`.
Perbaiki Dockerfile document-intelligence yang rusak (port/host salah),
buat Dockerfile core-engine & ai-orchestrator baru, perluas CI (test
ai-orchestrator + web vitest yang sekarang TERLEWAT dari CI), deploy
staging otomatis, produksi manual-approve, CORS dikencangkan.

## TASK 10 — Auth & RBAC (estimator / PM / lapangan / owner)

Prompt detail: `PAAX_CODEX_TASK_R10_AUTH_RBAC_2026-07-07.md`. Firebase Auth
JWT di 3 service, matriks izin 4 peran, isolasi data lintas-tenant, API
key service-to-service terpisah dari token user.

## TASK 11 — Metering & Observabilitas Biaya AI

Prompt detail: `PAAX_CODEX_TASK_R11_METERING_OBSERVABILITAS_2026-07-07.md`.
Catat tiap panggilan AI (document-intelligence + ai-orchestrator), endpoint
agregasi pemakaian, kuota per paket dengan **fallback rule-based** (bukan
pipeline berhenti) saat kuota habis, alarm anomali sederhana.

## TASK 12 — Laporan Pagi Otomatis (AI Proaktif v1.5 Tahap 1)

Prompt detail: `PAAX_CODEX_TASK_R12_LAPORAN_PAGI_OTOMATIS_2026-07-07.md`.
Narasi otomatis di atas angka yang SUDAH ADA (progres/warning/deviasi
dari engine) — LLM hanya menyalin & menarasikan, anti-halusinasi diuji
eksplisit (tiap angka di narasi harus match `metrics_snapshot`).

## TASK 13 — Ekspansi Harga Regional Multi-Wilayah + Versioning Price Book

Prompt detail: `PAAX_CODEX_TASK_R13_HARGA_MULTI_WILAYAH_VERSIONING_2026-07-07.md`.
**Temuan konkret**: `effective_date` sudah ditulis extractor tapi loader
core-engine mengabaikannya total (versi baru menimpa versi lama by
`region_code` saja) — task ini menambah versioning "as-of-date" sungguhan.

## TASK 14 — Scaffold Site Agent v2.0 (API progres lapangan)

Prompt detail: `PAAX_CODEX_TASK_R14_SITE_AGENT_SCAFFOLD_2026-07-07.md`.
`services/site-agent/` **belum ada sama sekali** — scaffold API laporan
harian + perbandingan rencana-vs-realisasi via engine. **Vision-LLM/analisa
foto DILARANG KERAS** di task ini (tetap ditunda).

---

## URUTAN & DEPENDENCY (ringkas)

```
1 ✅ → 2 ✅ → 3 ✅ → 4 ✅ (SELESAI, berurutan di branch yang sama beberapa kali)
5 (deteksi geometri lanjutan) → mandiri, jalan kapan saja
6 (DB server-side, Postgres — DIKONFIRMASI) → 7 (orchestrator tahap 2) → 8 (RAG)
                                       → 10 (auth) → 11 (metering) → 12 (laporan pagi)
9 (deploy/CI) → bisa paralel setelah 4; wajib sebelum 12 produksi
13 (harga multi-wilayah) → mandiri, jalan kapan saja
14 (site agent) → butuh 6 & 10
```

Titik STOP wajib tanya owner: **Task 6** — ✅ SUDAH DIJAWAB (Postgres) —
dan **Task 5** (kalau di tengah jalan butuh skema data baru yang belum
diantisipasi prompt, lihat §5 file Task R5). Selain itu, tiap task berdiri
sendiri sebagai satu sesi + satu PR.
