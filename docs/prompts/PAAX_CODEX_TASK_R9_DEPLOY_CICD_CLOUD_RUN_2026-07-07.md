# PROMPT CODEX — Task R9: Deploy & CI/CD — Cloud Run + Secret Manager + Staging

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 9).
> **Mandiri** — bisa dikerjakan kapan saja setelah Task R2 (opsional, tidak
> hard-dependency). Sesuai ADR-0003 (`docs/adr/0003-google-first-cloud.md`,
> amandemen 2026-07-05): Cloud Run + Secret Manager, BUKAN Firebase Genkit/
> Vertex (itu sudah direvisi, jangan diikuti bagian AI-nya, cukup bagian
> infra Cloud Run/Secret Manager yang tetap berlaku).
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> di AWAL branch task SEBELUM menulis kode — insiden 2026-07-07
> membuktikan file prompt tak-ter-commit bisa hilang saat checkout/
> cleanup branch berikutnya.

---

## 0. Konteks — temuan nyata (verifikasi ulang sebelum mulai, bisa berubah)

- `services/document-intelligence/Dockerfile` **SUDAH ADA tapi RUSAK/USANG**:
  `poetry install --no-dev` (flag lama, Poetry modern pakai
  `--without dev` atau `--only main`), host `"0.0.0"` (typo, harusnya
  `"0.0.0.0"`), port `8002` (tidak cocok port asli service `8083` yang
  dipakai `.claude/launch.json`/dokumentasi lain), TIDAK menginstall
  `paax-schemas` (dependency wajib sejak Fase X1B — service ini akan GAGAL
  boot tanpa itu, lihat `pyproject.toml` service ini).
- `services/core-engine` dan `services/ai-orchestrator` **TIDAK PUNYA
  Dockerfile SAMA SEKALI**.
- `.github/workflows/ci.yml` (baca penuh, 50 baris) build web + test
  core-engine + test document-intelligence — **TIDAK menjalankan test
  `services/ai-orchestrator`** (30 test terlewat dari CI!) dan **TIDAK
  menjalankan `pnpm --dir apps/web test`** (47 test vitest juga terlewat —
  CI hanya `pnpm build`, bukan test). Ini gap nyata yang harus ditutup di
  task ini SEBELUM menambah CI job deploy baru.
- CORS di core-engine/document-intelligence "terbuka" (CEK
  `app/main.py` masing-masing utk `CORSMiddleware` — kemungkinan
  `allow_origins=["*"]`) — HARUS dikencangkan untuk staging/produksi.

---

## 1. Scope task ini

1. **Perbaiki** `services/document-intelligence/Dockerfile` (bukan tulis
   ulang total kalau strukturnya sudah oke — perbaiki bug konkret di atas).
2. **Buat baru** `services/core-engine/Dockerfile` dan
   `services/ai-orchestrator/Dockerfile` (Node, `node:22-slim` sesuai versi
   di `ci.yml`).
3. Tiap Dockerfile: multi-stage build (builder + runtime slim), non-root
   user, `HEALTHCHECK` memanggil `/health` (endpoint yang SUDAH ADA di
   ketiga service — VERIFIKASI path & port persis per service:
   core-engine `8081`, document-intelligence `8083`, ai-orchestrator
   `8082` — cocokkan ke `.claude/launch.json` & README masing-masing).
4. **Perluas `ci.yml`**: tambah step test `services/ai-orchestrator`
   (`pnpm install` di situ dulu — README mencatat ini WAJIB sebelum test
   jalan — lalu `pnpm --filter ai-orchestrator test` + `tsc --noEmit`) dan
   `pnpm --dir apps/web test` (vitest, 47 test) sebagai job/step BARU,
   bukan cuma build. Semua 5 area (core-engine, document-intelligence,
   ai-orchestrator, apps/web test, packages/schemas) WAJIB hijau sebelum
   PR bisa merge — jadikan branch protection requirement (dokumentasikan
   di report, tidak bisa diaktifkan dari kode, itu setting GitHub manual
   oleh owner).
5. **Job build image baru** (`docker/build-push` di `ci.yml` ATAU workflow
   terpisah `.github/workflows/deploy.yml`) — build 3 image (core-engine,
   document-intelligence, ai-orchestrator), push ke **Artifact Registry**
   (bukan Docker Hub — konsisten Google-first ADR-0003), tag dengan SHA
   commit.
6. **Deploy staging otomatis** ke Cloud Run saat push ke `main` (pasca-merge
   PR) — 3 service, env var `GEMINI_API_KEY`/`PAAX_DATA_DIR` dari **Secret
   Manager** (`gcloud run deploy --set-secrets`), BUKAN hardcode di
   workflow YAML. **Deploy produksi**: job terpisah dengan
   `environment: production` + `workflow_dispatch` manual trigger
   (approval gate) — JANGAN otomatis ke produksi.
7. **CORS dikencangkan**: `app/main.py` core-engine & document-intelligence
   — `allow_origins` dari env var (`ALLOWED_ORIGINS`, comma-separated),
   default ke origin Vercel/staging web yang sebenarnya dipakai (BUKAN
   `["*"]`) untuk deploy — tapi tetap `["*"]` sebagai DEFAULT LOKAL/DEV
   supaya `pnpm run dev:core` developer lokal tidak rusak (baca env,
   fallback `*` HANYA kalau env kosong DAN `ENV=development`).
8. **Runbook** baru `docs/RUNBOOK_DEPLOY.md` — langkah manual: setup GCP
   project pertama kali, buat secret di Secret Manager, cara trigger
   deploy manual produksi, cara rollback (`gcloud run services
   update-traffic --to-revisions`).

**JANGAN**: menyentuh `apps/web/**` KECUALI `.github/workflows/ci.yml` step
test-nya (itu bukan kode aplikasi, boleh); commit secret/API key APA PUN ke
repo (termasuk di file YAML contoh — pakai placeholder `${{ secrets.XXX
}}`); deploy otomatis ke produksi.

---

## 2. Verifikasi SEBELUM implementasi (WAJIB, port/endpoint bisa beda dari
   kutipan di atas kalau file sudah berubah sejak prompt ditulis)

- `services/core-engine/app/main.py` — cari `CORSMiddleware`, port default
  di README/`uvicorn` command (`8081`).
- `services/document-intelligence/app/main.py` — sama, port `8083`,
  `pyproject.toml` untuk daftar dependency lengkap (termasuk
  `paax-schemas`, opsional `paddleocr`/`paddlepaddle` — Dockerfile TIDAK
  perlu install extras OCR kecuali diputuskan perlu, opsional & besar,
  laporkan keputusanmu).
- `services/ai-orchestrator/package.json` — script `build`/`start` yang
  ada (kalau belum ada script produksi `node dist/index.js` atau setara,
  tambahkan + `tsconfig` build output — VERIFIKASI dulu struktur build
  TypeScript service ini, jangan asumsi).
- `.github/workflows/ci.yml` penuh (50 baris, sudah dikutip §0) — pastikan
  perubahanmu additive (tidak menghapus step yang sudah bekerja).

---

## 3. Test & validasi WAJIB (bukan pytest — infra, validasi manual + dryrun)

- `docker build` ketiga service SUKSES lokal (`docker build -t paax-core
  services/core-engine` dst.) — tempel output build di report.
- `docker run` ketiganya lokal, `curl localhost:<port>/health` mengembalikan
  200 — bukti image benar-benar jalan, bukan cuma build sukses.
- CI job baru (test ai-orchestrator + web vitest) — tunjukkan run CI HIJAU
  di PR (screenshot/link Actions run, bukan cuma klaim).
- Workflow deploy: **JANGAN benar-benar deploy ke GCP project asli** dalam
  task ini kecuali owner sudah menyediakan project ID via secret repo —
  KALAU secret GCP belum ada (`GCP_PROJECT_ID`/`GCP_SA_KEY` dsb belum
  dikonfigurasi di repo), tulis workflow-nya LENGKAP & BENAR tapi tandai
  jelas di report "belum bisa di-dry-run tanpa kredensial GCP — perlu
  owner setup project + secret dulu". JANGAN mengarang bahwa deploy sudah
  diverifikasi kalau kenyataannya belum bisa dites end-to-end.

---

## 4. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR9_DEPLOY_CICD_CODEX_<tanggal>.md`.
Isi wajib: (1) diff Dockerfile document-intelligence (bug apa yang
diperbaiki), (2) isi Dockerfile core-engine & ai-orchestrator baru, (3)
bukti `docker build`+`docker run`+`curl /health` sukses ketiganya (output
mentah), (4) diff `ci.yml` (step baru ai-orchestrator+web test), (5) isi
workflow deploy baru + **status jujur** apakah sudah bisa di-dry-run atau
menunggu setup GCP owner, (6) isi `docs/RUNBOOK_DEPLOY.md`, (7) commit +
PR, (8) konfirmasi TIDAK ADA secret/kredensial nyata masuk repo (grep
manual sebelum commit).

---

## 5. Pembagian kerja & larangan

- Branch baru dari `main`: `feat/deploy-cicd-cloud-run`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**` selain `.github/workflows/ci.yml`.
- JANGAN commit secret/kredensial GCP apa pun.
- JANGAN deploy otomatis ke produksi — staging saja yang otomatis.
