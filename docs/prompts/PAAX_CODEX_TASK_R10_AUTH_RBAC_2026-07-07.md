# PROMPT CODEX — Task R10: Auth & RBAC (estimator/PM/lapangan/owner)

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 10).
> **WAJIB setelah** Task R6 (kolom `owner_id` di tabel `projects` sudah
> ada tapi belum di-enforce — task ini yang menegakkannya).
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> di AWAL branch task SEBELUM menulis kode — insiden 2026-07-07
> membuktikan file prompt tak-ter-commit bisa hilang saat checkout/
> cleanup branch berikutnya.

---

## 0. Konteks

`docs/security/data-governance.md` (setelah audit dokumentasi 2026-07-05)
mencatat RBAC 4 peran (estimator/PM/lapangan/owner) sebagai PRINSIP yang
BELUM diimplementasikan — detail Firestore/org di dokumen itu sudah
ditandai usang, tapi PRINSIP peran & isolasi datanya tetap valid & jadi
dasar task ini. Sekarang **TIDAK ADA otentikasi sama sekali** di ketiga
service Python/Node — semua endpoint terbuka.

---

## 1. Scope task ini

### 1.1 Firebase Auth — verifikasi token di 3 service

Tambahkan middleware verifikasi JWT Firebase (`firebase-admin` Python SDK
utk core-engine/document-intelligence/db-api, sudah tersedia sbg
dependency — VERIFIKASI apakah sudah ada di `pyproject.toml` manapun; kalau
belum, ini SATU dependency baru yang diizinkan per service Python.
Untuk ai-orchestrator [Node], `firebase-admin` npm package):
- Middleware baca header `Authorization: Bearer <token>`, verifikasi via
  Firebase Admin SDK, attach `req.user = {uid, email}` (atau setara
  FastAPI dependency `get_current_user`).
- Endpoint TANPA token valid → `401` dgn pesan jelas.
- **Endpoint publik yang DIKECUALIKAN** (tidak butuh auth): `/health`
  semua service (dipakai healthcheck Cloud Run Task R9 — JANGAN
  proteksi ini, akan merusak deploy).

### 1.2 Peran & matriks izin

Tabel baru (migrasi Alembic `services/db/`, `0004_roles.py`):
```sql
CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,           -- Firebase UID
    role TEXT NOT NULL,              -- 'estimator' | 'pm' | 'lapangan' | 'owner'
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
```

Matriks izin (diterapkan sbg dependency/decorator FastAPI &
middleware Express, BUKAN dicek manual berulang di tiap endpoint —
buat SATU fungsi `require_role(project_id, user, allowed_roles)` reusable):

| Aksi | estimator | pm | lapangan | owner |
|---|---|---|---|---|
| Baca RAB/TKG/jadwal proyek | ✅ | ✅ | ✅ | ✅ |
| Ubah RAB/TKG (rab-draft PUT) | ✅ | ✅ | ❌ | ✅ |
| Lapor progres (Task R14 nanti) | ❌ | ✅ | ✅ | ✅ |
| Tambah/hapus anggota tim | ❌ | ❌ | ❌ | ✅ |
| Hapus proyek | ❌ | ❌ | ❌ | ✅ |
| Lihat billing/metering (Task R11) | ❌ | ❌ | ❌ | ✅ |

(Tabel ini DRAFT masuk akal berdasar deskripsi peran di
`data-governance.md` — kalau kamu menemukan endpoint yang tidak jelas
masuk kategori mana, JANGAN menebak, tulis di laporan sebagai
"perlu klarifikasi owner", beri default paling KETAT (`owner`-only)
sampai diklarifikasi.)

### 1.3 Scoping data per user/project (isolasi lintas-tenant)

`GET /projects` (db-api, Task R6) — SEKARANG (sebelum task ini) menerima
`owner_id` sbg query param bebas (tidak divalidasi = siapa saja bisa lihat
proyek siapa saja dgn ganti param). **PERBAIKI**: `owner_id`/scoping
HARUS diambil dari `req.user.uid` (token terverifikasi), BUKAN dari query
param yang dikontrol client. Test eksplisit: user A tidak bisa
`GET /projects/{id milik user B}` → `403`.

### 1.4 Service-to-service auth terpisah dari user auth

`ai-orchestrator` memanggil `db-api`/`core-engine` sebagai SERVICE
(bukan atas nama user login langsung) — pakai **API key service-level**
terpisah (env `INTERNAL_SERVICE_KEY`, header `X-Internal-Key`, dicek
SELAIN/SEBELUM cek Firebase Auth utk request yang datang dari
service lain) — jangan campur dengan token user. Endpoint yang dipanggil
service lain (mis. `POST /audit/tool-call` dari Task R7) pakai jalur ini,
BUKAN token user (ai-orchestrator sering tidak punya token user asli saat
memanggil balik, tergantung alur — VERIFIKASI alur nyata request masuk
ai-orchestrator dulu: apakah `POST /chat` menerima token user yang
diteruskan, atau tidak sama sekali sekarang — kalau tidak ada,
task ini yang MENAMBAHKAN penerimaan token itu di `POST /chat`).

---

## 2. Test WAJIB

- Endpoint tanpa token → `401` (semua 3 service, sample endpoint tiap
  service, BUKAN cuma satu).
- Token valid tapi user bukan member proyek → `403` saat akses proyek itu.
- Token valid + role `lapangan` mencoba PUT rab-draft → `403` (matriks
  §1.2 ditegakkan, bukan cuma didokumentasikan).
- `owner` bisa melakukan SEMUA aksi di tabel §1.2.
- Service-to-service call dengan `INTERNAL_SERVICE_KEY` benar → lolos
  tanpa token user; key salah/tidak ada → `401`.
- `/health` TETAP bisa diakses tanpa token (regresi — JANGAN sampai
  healthcheck Cloud Run gagal karena auth).

Jalankan test SEMUA service (core-engine, document-intelligence,
ai-orchestrator, services/db-api) — laporkan before/after per service.

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR10_AUTH_RBAC_CODEX_<tanggal>.md`.
Isi wajib: (1) matriks izin FINAL yang diimplementasikan (dgn catatan
kalau ada yang didefaultkan ketat krn ambigu), (2) daftar endpoint yang
dikecualikan dari auth (`/health` dst — HARUS pendek, kalau daftar ini
panjang berarti ada masalah), (3) hasil test isolasi lintas-tenant, (4)
commit + PR per service (bisa beberapa PR kalau 3 service disentuh
terpisah — putuskan & laporkan), (5) konfirmasi TIDAK ADA kredensial
Firebase Admin SDK (service account JSON) masuk repo.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R6): `feat/auth-rbac`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft (boleh beberapa PR per service), JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN commit service account key/kredensial Firebase Admin.
- JANGAN proteksi `/health` — akan merusak Task R9 (Cloud Run healthcheck).
