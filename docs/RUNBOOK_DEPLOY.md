# PAAX AI - Runbook Deploy ke Google Cloud Run

Dokumen ini berisi panduan manual untuk menyiapkan infrastruktur dan deployment PAAX AI (v0.9+) ke Google Cloud Platform, khususnya menggunakan Cloud Run dan Secret Manager.

## 1. Persiapan Awal (Satu Kali)

### 1.1 Buat Project GCP
1. Buat project baru di konsol GCP atau gunakan project yang ada.
2. Catat `PROJECT_ID`.
3. Aktifkan API berikut:
   - Cloud Run API (`run.googleapis.com`)
   - Secret Manager API (`secretmanager.googleapis.com`)
   - Artifact Registry API (`artifactregistry.googleapis.com`)
   - Compute Engine API (jika menggunakan Cloud SQL, opsional)

### 1.2 Buat Service Account (SA) untuk GitHub Actions
1. Masuk ke menu IAM & Admin -> Service Accounts.
2. Buat SA baru (misal: `github-actions-deployer`).
3. Berikan role (peran) berikut:
   - `Cloud Run Admin` (untuk deploy service)
   - `Artifact Registry Writer` (untuk push image Docker)
   - `Secret Manager Secret Accessor` (untuk baca secret saat deploy)
   - `Service Account User` (agar Cloud Run bisa berjalan menggunakan default SA)
4. Buat dan unduh JSON Key untuk SA ini.

### 1.3 Setup GitHub Repository Secrets
Di menu Settings -> Secrets and variables -> Actions di GitHub repo:
1. `GCP_PROJECT_ID`: Isi dengan ID Project GCP.
2. `GCP_SA_KEY`: Isi dengan isi file JSON dari SA yang baru dibuat.

### 1.4 Setup Artifact Registry
1. Buat repository di Artifact Registry.
   - Name: `paax-repo`
   - Format: `Docker`
   - Region: `asia-southeast2` (Jakarta)

### 1.5 Setup Secret Manager
Cloud Run butuh environment variables. Buat secrets berikut di Secret Manager GCP:
1. `GEMINI_API_KEY`: API key Gemini.
2. `DB_API_URL`: URL internal atau eksternal untuk layanan Database.

## 2. Proses Deployment

### 2.1 Staging (Otomatis)
- Push atau merge ke branch `main` akan otomatis mentrigger workflow CI/CD `.github/workflows/deploy.yml`.
- Target environment adalah `staging`.
- Semua image akan di-build, di-push, dan di-deploy.

### 2.2 Production (Manual)
1. Buka tab **Actions** di GitHub.
2. Pilih workflow **Deploy to Cloud Run**.
3. Klik **Run workflow**.
4. Pilih environment `production`.
5. Klik tombol **Run workflow** untuk menjalankan deploy.

## 3. Rollback (Darurat)

Jika terjadi insiden atau deployment ke Cloud Run rusak, segera alihkan trafik kembali ke revisi sebelumnya.

**Menggunakan gcloud CLI:**
```bash
# Lihat daftar revisi dan status traffic
gcloud run services describe <nama-service> --region asia-southeast2

# Rollback trafik ke revisi sebelumnya
gcloud run services update-traffic <nama-service> \
    --to-revisions=<revisi-sebelumnya>=100 \
    --region asia-southeast2
```

Catatan `<nama-service>`:
- `core-engine`
- `document-intelligence`
- `ai-orchestrator`
