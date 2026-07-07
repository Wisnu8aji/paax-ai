# PROMPT CODEX — Task R6: Database Proyek Server-Side (Postgres/Cloud SQL)

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 6).
> **KEPUTUSAN ARSITEKTUR SUDAH DIKONFIRMASI OWNER 2026-07-07: Postgres
> (Cloud SQL)** — bukan Firestore. Ini task **PALING KOMPLEKS & PALING
> BERISIKO** di roadmap (mengubah fondasi penyimpanan) — WAJIB satu PR
> per sub-langkah §1, JANGAN satu PR raksasa untuk semuanya.

---

## 0. Konteks — kenapa task ini penting & apa yang diganti

Sekarang **TIDAK ADA database proyek server-side sama sekali**. Semua data
hidup di localStorage browser:
- `apps/web/src/lib/projects/project-repository.ts` — CRUD `Project`
  (field: `id, name, location, client, type, status, description,
  rabValue, progress, warnings, health, lastActivity, createdAt,
  updatedAt` — lihat `types.ts`), dengan fallback Firestore KALAU env
  Firebase ada (VERIFIKASI — baca `project-repository.ts` penuh untuk tahu
  apakah Firestore path itu benar-benar berfungsi atau cuma skeleton).
- `apps/web/src/lib/projects/rab-repository.ts` — `ProjectRabDraft`
  (`RabDraftLine[]`, region, PPN, mode) per proyek, localStorage murni.
- `apps/web/src/lib/projects/tkg-repository.ts` — `ProjectTkgRecord`
  (`TkgDocument`, source: manual/ai_proposal/pipeline, reviewed).
- `apps/web/src/lib/chat/chat-history.ts` — riwayat Command Room
  (conversations + folders/projects percakapan).

**Konsekuensi nyata dari tidak adanya DB server-side** (dikonfirmasi audit
B0 sesi 2026-07-05): tool `query_rab`/`query_schedule` di
`services/ai-orchestrator` HANYA bisa membaca `context` yang dikirim
client per-request — TIDAK BISA mengakses data proyek lain/lintas-sesi.
Task ini adalah PRASYARAT Task R7 (orchestrator v2 context server-side),
R8 (RAG), R10 (auth), R14 (site agent).

**INI TASK NON-UI** — service backend baru + migrasi data, TAPI wiring
`apps/web` untuk BENAR-BENAR memakai API baru (ganti localStorage dengan
fetch) sebagian menyentuh `apps/web/src/lib/projects/*.ts` (BUKAN
komponen UI/tampilan — file `lib/` adalah data-layer, bukan presentasi).
**Batasan tegas**: kamu BOLEH mengubah `apps/web/src/lib/projects/*.ts`
dan `apps/web/src/lib/chat/chat-history.ts` (logic penyimpanan data, sama
kelas dengan `engine.ts`), TAPI **DILARANG MUTLAK menyentuh apa pun di
`apps/web/src/app/**` atau `apps/web/src/components/**`** (tampilan murni
domain Claude). Kalau perubahan `lib/*.ts` butuh perubahan pemanggilan di
`app/`/`components/` (mis. `async`/`await` baru karena fetch network),
**JANGAN kerjakan sendiri** — laporkan sebagai "wiring UI menyusul, domain
Claude", biarkan fungsi lama tetap ada berdampingan (backward-compatible)
sampai Claude yang migrasi pemanggilnya.

---

## 1. Scope task ini (5 sub-langkah, SETIAP LANGKAH = PR TERPISAH)

### Langkah 1 — Provisioning & skema database (PR 1)

Buat `services/db/` (paket Python baru, folder netral — TIDAK di bawah
`core-engine`/`document-intelligence`/`ai-orchestrator` karena dipakai
ketiganya) berisi:
- `schema.sql` — DDL Postgres lengkap (§2).
- Migrasi via **Alembic** (dependency baru, satu-satunya yang diizinkan
  task ini) — `alembic/versions/0001_initial.py` dst.
- `services/db/pyproject.toml` — package `paax-db` (pola sama
  `paax-schemas`), dependency `sqlalchemy`, `alembic`, `psycopg2-binary`.
- Dokumentasi `services/db/README.md`: cara jalankan migrasi lokal
  (`docker run postgres` utk dev, `DATABASE_URL` env).

**JANGAN provision Cloud SQL instance sungguhan** dalam task ini (itu
infra GCP nyata, biaya nyata — domain Task R9/owner). Cukup skema +
migrasi yang BISA dijalankan ke Postgres manapun (lokal Docker atau Cloud
SQL nanti).

### Langkah 2 — Service API CRUD (PR 2, di atas PR 1)

Service baru `services/db-api/` (FastAPI, port `8084` baru — cek
`.claude/launch.json` tidak ada konflik) ATAU tambahkan router baru ke
`services/core-engine` (PILIH SALAH SATU, pertimbangkan: core-engine
adalah "compute-only" per `CLAUDE.md` §3, jadi PISAH sebagai service baru
LEBIH KONSISTEN dengan pemisahan tanggung jawab — REKOMENDASI: service
baru). Endpoint minimal:
```
GET    /projects?owner_id=...           daftar proyek milik user
POST   /projects                        buat proyek
GET    /projects/{id}
PATCH  /projects/{id}
DELETE /projects/{id}
GET    /projects/{id}/rab-draft
PUT    /projects/{id}/rab-draft         (upsert, replace penuh - sama pola localStorage lama)
GET    /projects/{id}/tkg
PUT    /projects/{id}/tkg
GET    /projects/{id}/conversations
POST   /projects/{id}/conversations
PATCH  /conversations/{id}
DELETE /conversations/{id}
```
Model Pydantic **selaras 1:1** dengan `Project`/`ProjectRabDraft`/
`ProjectTkgRecord`/`ChatConversation` TypeScript yang ADA SEKARANG (§0) —
JANGAN redesign shape data, HANYA pindahkan tempat penyimpanannya. Zod
mirror di `packages/schemas` untuk model baru KALAU belum ada yang cocok
(cek dulu — `packages/schemas/src/index.ts` mungkin sudah punya sebagian).

### Langkah 3 — Migrasi data existing (PR 3)

Skrip `scripts/migrate/migrate_localstorage_to_db.py` — TIDAK BISA
dijalankan otomatis (localStorage ada di BROWSER user, bukan server) —
jadi buat ini sebagai:
(a) endpoint `POST /projects/import` di `services/db-api` yang menerima
JSON dump persis shape localStorage (`Project[]`, dst) dan meng-insert-nya
— dipakai NANTI oleh Claude saat wiring `apps/web` (tombol "impor data
lama" one-time), DAN
(b) test yang membuktikan endpoint ini idempotent (import 2x data yang
sama tidak duplikasi, pakai `id` yang sudah ada sebagai primary key).

### Langkah 4 — Client TypeScript baru (PR 4, HATI-HATI batasan §0)

`apps/web/src/lib/projects/project-repository.ts` (dan
rab/tkg-repository setara) dapat **backend baru** `db-api` sebagai OPSI
KETIGA (localStorage → Firestore → **db-api**, urutan fallback
dikonfirmasi dulu dgn membaca kode fallback yang ADA). Tambahkan env
`NEXT_PUBLIC_DB_API_URL` — kalau diisi, pakai `db-api`; kalau kosong,
PERILAKU LAMA (localStorage/Firestore) TIDAK BERUBAH SAMA SEKALI (default
off, backward compatible penuh). Ini murni penambahan fungsi di `lib/`,
BUKAN mengubah cara komponen React memanggilnya (interface publik
`projectRepository.list()/get()/create()/...` harus tetap sama).

### Langkah 5 — Wiring `ai-orchestrator` (PR 5)

`services/ai-orchestrator/src/tools/query-rab.ts` (atau nama file
sebenarnya — VERIFIKASI) dapat SUMBER BARU: kalau `project_id` diberikan
DAN `DB_API_URL` env diset, coba fetch dari `db-api` DULU; kalau gagal
ATAU env kosong, fallback ke `context` yang dikirim client (perilaku LAMA
tetap ada, TIDAK dihapus). Ini melengkapi temuan jujur README
"tidak ada database proyek server-side" — sekarang ADA, tapi opsional.

---

## 2. Skema Postgres (draft — verifikasi & sesuaikan field types TS asli
   sebelum finalisasi DDL)

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL,              -- siap utk Task R10 (auth), belum di-enforce di task ini
    name TEXT NOT NULL,
    location TEXT,
    client TEXT,
    type TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT,
    rab_value NUMERIC,
    progress INTEGER NOT NULL DEFAULT 0,
    warnings INTEGER NOT NULL DEFAULT 0,
    health INTEGER NOT NULL DEFAULT 100,
    last_activity TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_owner ON projects(owner_id);

CREATE TABLE rab_drafts (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,              -- ProjectRabDraft penuh (lines[], region, ppn, mode)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tkg_records (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,              -- ProjectTkgRecord penuh (TkgDocument, source, reviewed)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_folders (
    id UUID PRIMARY KEY,
    project_id TEXT NOT NULL,            -- scope: 'command-room' global ATAU project id nyata
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY,
    project_id TEXT NOT NULL,
    folder_id UUID REFERENCES chat_folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]',
    pinned BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_project ON chat_conversations(project_id);
```

**PENTING**: `payload JSONB` untuk `rab_drafts`/`tkg_records` (bukan
kolom ternormalisasi penuh) SENGAJA — data ini kompleks/nested & berubah
bentuk seiring fitur baru (mis. `RabDraftLine` dapat field baru
`ahsp_suggested`); JSONB fleksibel tanpa migrasi skema tiap kali field
baru ditambah, tapi tetap query-able (Postgres JSONB operators). Kalau
kamu menemukan alasan kuat untuk menormalisasi lebih jauh (mis. butuh
query analitik lintas-baris RAB), CATAT sebagai rekomendasi di laporan,
JANGAN implementasikan tanpa diskusi (scope creep).

---

## 3. Test WAJIB

- Migrasi Alembic: `upgrade head` dari kosong sukses; `downgrade base`
  sukses (rollback bersih) — jalankan terhadap Postgres container test
  (Docker, atau `pytest-postgresql` kalau mau tanpa Docker — putuskan &
  laporkan).
- CRUD lengkap tiap endpoint `db-api` (`TestClient` FastAPI + DB test
  terisolasi per test — transaksi rollback per test, pola umum SQLAlchemy).
- Idempotency import (`Langkah 3`): import data yang sama 2× → jumlah
  baris tidak berubah, field ter-update (bukan duplikat).
- `project-repository.ts` baru: test dengan `NEXT_PUBLIC_DB_API_URL`
  KOSONG → behavior identik dengan SEBELUM task ini (regresi test
  `project-repository.test.ts` yang SUDAH ADA harus tetap lulus tanpa
  modifikasi assertion).
- ai-orchestrator: test `query_rab` dengan `DB_API_URL` fetch sukses vs
  fallback ke `context` (kedua jalur, tidak boleh salah satu rusak).

Jalankan test SEMUA service yang tersentuh (core-engine, document-
intelligence TIDAK tersentuh — verifikasi tetap hijau tanpa perubahan;
ai-orchestrator; apps/web `project-repository.test.ts` khususnya).

---

## 4. Laporan WAJIB — `report-remote/` (SATU laporan per PR/langkah,
   5 laporan total, jangan digabung)

Tiap laporan: `report-remote/REPORT_TASKR6_LANGKAH<N>_<NAMA>_CODEX_<tanggal>.md`.
Isi wajib per laporan: (1) apa yang dibuat/diubah, (2) hasil test, (3)
konfirmasi backward-compat (khususnya Langkah 4: buktikan behavior lama
TIDAK BERUBAH saat env baru kosong), (4) commit + PR, (5) untuk Langkah 5:
konfirmasi fallback `context` client masih berfungsi persis seperti
sebelumnya.

---

## 5. Pembagian kerja & larangan

- 5 branch terpisah dari `main` (satu per langkah, berurutan — Langkah 2
  butuh Langkah 1 sudah merge, dst.): `feat/db-schema-postgres`,
  `feat/db-api-crud`, `feat/db-migrate-import`, `feat/db-client-web`,
  `feat/db-wiring-orchestrator`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft tiap langkah, JANGAN self-merge, JANGAN lanjut langkah
  berikutnya sebelum langkah sebelumnya di-review (tunggu sinyal owner
  ATAU lanjut menulis kode tapi JANGAN merge sendiri — PR menumpuk sbg
  draft sampai direview berurutan).
- **Langkah 4 — batasan PALING KETAT**: HANYA file di
  `apps/web/src/lib/**` (data layer) boleh disentuh. **NOL PERUBAHAN**
  di `apps/web/src/app/**` dan `apps/web/src/components/**` — kalau
  kamu merasa perlu mengubah file di situ untuk "membuat fitur ini
  kelihatan", **JANGAN LAKUKAN**, itu bukan scope-mu.
- JANGAN provision infra GCP nyata (Cloud SQL instance) — domain Task R9.
