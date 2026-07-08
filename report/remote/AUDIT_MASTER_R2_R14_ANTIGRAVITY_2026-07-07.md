# Audit Master Report R2-R14 Antigravity

Tanggal audit: 2026-07-07  
File sumber: `G:\paax-ai-main\report-remote\MASTER_REPORT_ALL_TASKS_R2_R14_antigravity_2026-07-07.md`

## Kesimpulan Singkat

Pekerjaan Antigravity R2-R14 memang banyak yang sudah masuk ke repo dan sebagian besar bukan dummy. Namun master report terlalu optimistis pada beberapa bagian. Ada bug nyata di `ai-orchestrator` yang membuat test/build gagal, dan sudah diperbaiki dalam audit ini.

UI Fable premium tidak saya ubah dalam audit ini.

## Yang Terbukti Ada di Repo

- R2: job store persistent document-intelligence ada.
- R3: cache analisa dokumen ada.
- R4: golden/eval harness ada.
- R5: geometri lanjutan ada.
- R6: service DB Postgres ada.
- R7: ai-orchestrator tahap 2 ada.
- R8: knowledge/RAG scaffold ada.
- R9: Docker/deploy/CI scaffold ada.
- R10: auth/RBAC ada.
- R11: metering ada.
- R12: laporan pagi ada.
- R13: price-book versioning ada.
- R14: site-agent scaffold ada.

## Koreksi Terhadap Master Report

1. Klaim "semua clean" tidak sepenuhnya benar sebelum audit ini.
   - `ai-orchestrator` gagal test karena memakai `require("../usage")` di project TypeScript ESM.
   - `usage.ts` mengimpor `node-fetch`, tetapi dependency itu tidak ada.

2. Status terbaru setelah perbaikan lanjutan:
   - Test DB/RAG/usage sekarang bisa berjalan lokal tanpa harus menyalakan PostgreSQL.
   - Production tetap memakai PostgreSQL/pgvector.
   - Test memakai SQLite async sementara supaya verifikasi harian tidak macet di `ConnectionRefusedError`.

3. Test knowledge R8 awalnya gagal 401 setelah R10 karena test belum mengirim auth internal.
   - Header dan environment test sudah diperbaiki.
   - Setelah itu, blocker PostgreSQL lokal juga sudah diatasi untuk jalur test dengan SQLite async sementara.

4. Status terbaru R14:
   - `services/site-agent/app/main.py` sekarang mengambil RAB dari `db-api`.
   - Jika RAB memiliki `payload.lines`, Site Agent memanggil `core-engine` endpoint `/schedule/s-curve`.
   - Estimasi linear hanya fallback saat db-api/core-engine/RAB belum tersedia.

## Perbaikan Yang Saya Lakukan

- `services/ai-orchestrator/src/usage.ts`
  - Menghapus import `node-fetch`.
  - Memakai `fetch` global Node.
  - Menambahkan tipe `reset_at`.

- `services/ai-orchestrator/src/gemini/tool-loop.ts`
  - Mengganti `require("../usage")` menjadi import ESM `logUsage`.

- `services/ai-orchestrator/src/routes/chat.ts`
  - Mengganti `require("../usage")` menjadi import ESM `checkQuota`.

- `services/ai-orchestrator/src/routes/stream.ts`
  - Mengganti `require("../usage")` menjadi import ESM `checkQuota`.

- `services/ai-orchestrator/src/tools/types.ts`
  - Menambahkan `project_id` dan `conversation_id` ke `ChatContext`.

- `services/ai-orchestrator/src/tools/search_knowledge.ts`
  - Mengetik `searchKnowledgeDeclaration` sebagai `GeminiFunctionDeclaration`.

- `services/ai-orchestrator/package.json`
  - Menambahkan dependency `cors`.
  - Menambahkan devDependency `@types/cors`.

- `pnpm-lock.yaml`
  - Diperbarui lewat `pnpm install`.

- `services/db/tests/test_knowledge.py`
  - Menambahkan `INTERNAL_SERVICE_KEY` untuk testing.
  - Menambahkan header internal auth pada request knowledge.

- `services/db/src/paax_db/models.py`
  - Menambahkan tipe UUID lintas database untuk test SQLite dan production PostgreSQL.
  - Membuat kolom JSON tetap JSONB di PostgreSQL, tetapi bisa dibuat di SQLite saat test.
  - Membuat embedding RAG tetap pgvector di PostgreSQL, tetapi JSON di SQLite test.

- `services/db/src/paax_db/main.py`
  - `knowledge/search` tetap memakai pgvector di PostgreSQL.
  - Untuk test/dev SQLite, search memakai cosine distance Python sederhana.
  - `usage/log` sekarang membuat quota default bila tenant belum punya quota, lalu menaikkan pemakaian.
  - Perbandingan waktu quota dibuat aman untuk datetime dengan/ tanpa timezone.

- `services/db/tests/conftest.py`
  - Menambahkan database SQLite async sementara untuk test DB API.
  - Test DB tidak lagi bergantung pada PostgreSQL lokal untuk endpoint reports/knowledge/usage.

- `services/db/tests/test_usage.py`
  - Test summary dibuat mandiri dengan seed usage sendiri.

- `services/site-agent/app/main.py`
  - `GET /site-logs/{project_id}/deviation` sekarang mencoba jalur nyata: db-api RAB -> core-engine Kurva S.
  - Default `CORE_ENGINE_URL` dibetulkan ke `http://127.0.0.1:8081`.
  - Default `DB_API_URL` ditambahkan ke `http://127.0.0.1:8084`.

- `services/site-agent/tests/test_site_agent.py`
  - Menambahkan test bahwa planned progress benar-benar berasal dari RAB db-api dan Kurva S core-engine.

- `services/db/pyproject.toml`
  - Menambahkan dev dependency `aiosqlite`.

## Verifikasi Yang Dijalankan

Lulus:

```powershell
pnpm --filter ai-orchestrator test
# 9 test files passed, 32 tests passed

pnpm --filter ai-orchestrator build
# tsc --noEmit sukses

python -m pytest services/site-agent/tests -q
# 17 passed

python -m pytest services/core-engine/tests/test_price_book_versioning.py -q
# 1 passed

python -m pytest services/db/tests/test_reports.py services/db/tests/test_usage.py services/db/tests/test_knowledge.py -q
# 8 passed

pnpm --filter @paax/web exec tsc --noEmit
# sukses

pnpm --filter @paax/web test
# 13 test files passed, 47 tests passed
```

Catatan:

- Test lokal tidak lagi gagal karena PostgreSQL belum hidup.
- Verifikasi production PostgreSQL/pgvector tetap perlu dilakukan saat service DB production/dev database dinyalakan dan migrasi Alembic sudah diterapkan.

## Penilaian Akhir

Pekerjaan Antigravity R2-R14 sebagian besar nyata dan masuk repo, tetapi statusnya harus dibaca sebagai:

- R2-R5: relatif aman.
- R6: ada; test endpoint lokal reports/knowledge/usage sudah bisa hijau tanpa Postgres lokal.
- R7: sebelumnya ada bug, sekarang sudah diperbaiki dan test/build lulus.
- R8: knowledge/RAG endpoint sudah terverifikasi lokal; production tetap memakai pgvector.
- R9-R10: scaffold/infra/auth ada.
- R11-R12: usage dan reports sudah terverifikasi lokal.
- R13: price-book versioning lulus test targeted.
- R14: sudah naik dari scaffold linear menjadi jalur db-api RAB -> core-engine Kurva S, dengan fallback linear jika data/service belum tersedia.

Rekomendasi berikutnya: jalankan PostgreSQL/Cloud SQL dev, migrasi Alembic, lalu lakukan smoke test production-mode agar pgvector dan koneksi DB nyata juga tervalidasi, bukan hanya jalur SQLite test.
