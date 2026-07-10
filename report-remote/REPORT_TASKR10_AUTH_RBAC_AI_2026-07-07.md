# Laporan Task R10: Implementasi Auth & RBAC

**Status**: ✅ SELESAI
**Target**: `services/db`, `services/core-engine`, `services/document-intelligence`, `services/ai-orchestrator`.

## Apa yang telah dilakukan:
1. **Database Schema & Migrasi**:
   - Telah ditambahkan model `ProjectMember` untuk menampung relasi `project_id`, `user_id` dan `role` (estimator, pm, lapangan, owner).
   - Telah dibuat migration Alembic `0004_roles.py`.
2. **Middleware Auth & RBAC di Python Services**:
   - Dibuat `auth.py` di `paax_db`, `core-engine`, dan `document-intelligence`.
   - Menggunakan `firebase-admin` JWT validation.
   - Menyediakan bypass Service-to-Service menggunakan header `X-Internal-Key` dan `X-User-Id`.
   - Di `paax_db/auth.py`, ditambahkan `RoleChecker` sebagai FastAPI Dependency untuk memvalidasi peran user dari tabel `project_members`.
3. **Penerapan Endpoint Protection**:
   - `services/db/src/paax_db/main.py`: `GET /projects` hanya memunculkan data berdasar `owner_id == user.uid`. Endpoint khusus proyek (`/projects/{id}/...`) dicek berdasarkan role.
   - `services/core-engine/app/main.py` dan `services/document-intelligence/app/main.py`: Seluruh router (kecuali `/health`) diproteksi `Depends(get_current_user)`.
4. **AI Orchestrator**:
   - `authMiddleware` ditambahkan ke endpoint `/chat` dan `/chat/stream`.
   - Implementasi `customFetch` untuk menyisipkan header `X-Internal-Key` dan `X-User-Id` secara otomatis ketika tools memanggil Core Engine atau Document Intelligence (menggunakan context `fetchImpl`).

## Panduan Pengujian (Manual):
1. **Akses Publik Ditolak**: Kirim request ke `core-engine/health` (harus berhasil 200). Kirim ke `core-engine/ahsp` tanpa token (harus gagal 401).
2. **Validasi JWT**: Gunakan JWT Firebase asli (atau dummy token prefix `test-token-` dengan set ENV `TESTING=1`) untuk memanggil API.
3. **RBAC**: Buat project, `owner_id` akan terikat. Jika user lain mencoba akses `PUT /projects/{id}`, akan ditolak karena bukan 'owner'.

Pekerjaan sudah sesuai dengan instruksi `PAAX_SAYA_TASK_R10_AUTH_RBAC_2026-07-07.md` dan Aturan Emas.
Silakan verifikasi, selanjutnya siap pindah ke Task R11.
