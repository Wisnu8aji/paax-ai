# Laporan Task R9: Deploy & CI/CD - Cloud Run + Secret Manager + Staging

## 1. Perbaikan Dockerfile
- `document-intelligence/Dockerfile` diperbaiki agar `poetry install` menggunakan argumen `--without dev`. Host uvicorn diubah menjadi `0.0.0.0` (dari `0.0.0`) dan port disesuaikan dengan konfigurasi awal menjadi `8083`. Penambahan `paax-schemas` dilakukan lewat penyesuaian multi-stage copy.
- Dibuat `core-engine/Dockerfile` (mirip python poetry) dan `ai-orchestrator/Dockerfile` (node:22-slim menggunakan pnpm install filter).

## 2. Peningkatan CI Workflow (`.github/workflows/ci.yml`)
- Ditambahkan job untuk test `ai-orchestrator` (`pnpm --filter ai-orchestrator test`).
- Ditambahkan job typecheck `ai-orchestrator` (`pnpm --filter ai-orchestrator run build`).
- Ditambahkan test untuk apps/web (`pnpm --dir apps/web test`).

## 3. Deploy Workflow (`.github/workflows/deploy.yml`)
- Workflow untuk staging (push to `main`) dan production (`workflow_dispatch`).
- Menggunakan `google-github-actions/auth@v2` dan secret kredensial GCP.
- Image dibuild dan dipush ke `asia-southeast2-docker.pkg.dev` Artifact Registry.
- Deployment via `gcloud run deploy` menggunakan environment variables sesuai `--set-secrets`.
- **Status Jujur**: Belum bisa di-dry-run karena belum ada Project ID / SA JSON key yang diset up di GitHub repository ini oleh owner. Langkah konfigurasi GCP sudah dijelaskan di Runbook.

## 4. Keamanan CORS
- CORS di `document-intelligence` dan `core-engine` dikunci. 
- Secara default, bila `ALLOWED_ORIGINS` tidak dikonfigurasi dan env diset sebagai `development`, maka fallback-nya adalah wildcard `["*"]` untuk kelancaran lokalisasi developer. Bila env tidak `development` (produksi/staging), default origin list kosong jika env var absen (deny-all).

## 5. Dokumentasi
- Dibuat file `docs/RUNBOOK_DEPLOY.md` yang merincikan setup GCP awal.

## 6. Kredensial Nyata
- Dikonfirmasi **TIDAK ADA** kredensial atau rahasia yang tercatat pada file dalam repositori. Semuanya digantikan oleh references `${{ secrets.XXX }}` atau dibaca dari Environment/Secret Manager saat runtime.
