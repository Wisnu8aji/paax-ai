# PROMPT CODEX — Task R8: RAG Grounding — Vector Store AHSP + Dokumen Proyek

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 8).
> **WAJIB setelah** Task R6 (Postgres — pakai `pgvector` extension di
> instance yang sama, BUKAN vector store terpisah) **dan** R7 (tool baru
> ditambahkan ke tool-loop yang sudah diperluas di situ).

---

## 0. Konteks

Engineering Chat/Command Room sekarang (per README ai-orchestrator + audit
B0) TIDAK PUNYA retrieval sama sekali — jawaban murni dari prompt +
`context` yang dikirim client. `MASTER_PLAN.md` §8 mengamanatkan RAG:
jawaban harus bisa ditelusuri ke sumber (kode AHSP, halaman dokumen),
bukan mengarang. Task ini membangun lapisan retrieval TAHAP PERTAMA:
katalog AHSP (2.542 item CK 2026, data di `G:\paax-data` — **JANGAN
COMMIT DATANYA**, hanya kode yang mengindeksnya) + dokumen/TKG proyek yang
sudah tersimpan di `db-api` (Task R6).

---

## 1. Scope task ini

### 1.1 Extension `pgvector` di skema Task R6

Migrasi Alembic baru `0003_pgvector.py`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY,
    source_type TEXT NOT NULL,      -- 'ahsp' | 'project_tkg' | 'project_rab'
    source_ref TEXT NOT NULL,       -- kode AHSP, atau project_id, dsb
    content TEXT NOT NULL,          -- teks asli yang di-embed
    embedding VECTOR(768),          -- dimensi SESUAIKAN model embedding yang dipilih §1.2
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_embedding ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops);
```

### 1.2 Indexer AHSP (skrip, bukan endpoint — dijalankan manual/batch)

`services/db/scripts/index_ahsp_catalog.py` — baca katalog AHSP dari
`PAAX_DATA_DIR` (pola sama `services/core-engine/app/rab/loader.py`,
REUSE cara baca `data/ahsp/*.json` KALAU katalog lengkap 2.542 item ada di
situ, ATAU baca langsung dari `G:\paax-data` via env terpisah kalau
katalog produksi disimpan di luar `data/ahsp/` yang di-commit — VERIFIKASI
lokasi sebenarnya, jangan asumsi). Untuk tiap item AHSP: bangun teks
representatif (`f"{code} {name} ({unit}, {bidang})"`), panggil **Gemini
Embedding API** (`text-embedding-004` atau model embedding terbaru yang
tersedia — VERIFIKASI endpoint/model exact via dokumentasi resmi Gemini
API sebelum implementasi, JANGAN menebak nama model), simpan ke
`knowledge_chunks` (`source_type='ahsp'`).

**Idempotency**: jalankan ulang skrip dengan katalog yang sama → tidak
duplikasi (upsert by `source_type+source_ref`, hapus dulu entri lama utk
`source_ref` yang sama sebelum insert baru — pola replace, bukan append
tak terbatas).

### 1.3 Tool baru `search_knowledge` di ai-orchestrator

`src/tools/search_knowledge.ts` (baru) — terima `query: string,
source_type?: string, project_id?: string`, panggil `db-api` endpoint baru
`POST /knowledge/search` (§1.4), kembalikan top-K (default 5) hasil dengan
`content`, `source_ref`, `similarity_score` — **WAJIB** disertakan sbg
rujukan eksplisit di jawaban model (system prompt tool-loop diperbarui:
"kalau memakai hasil search_knowledge, WAJIB sebut kode/sumbernya di
jawaban, JANGAN parafrase tanpa rujukan").

### 1.4 Endpoint `db-api`: `POST /knowledge/search`

Terima `{query_embedding: float[], source_type?: string, project_id?:
string, top_k: int}` — **embedding query dihitung di ai-orchestrator**
(panggil Gemini Embedding API di situ, sama seperti indexer), `db-api`
HANYA menjalankan pgvector similarity search (`ORDER BY embedding <=>
query_embedding LIMIT top_k`). Ini menjaga `db-api` tetap "dumb storage",
logic AI (panggil model embedding) tetap di `ai-orchestrator` — konsisten
pemisahan lapis `CLAUDE.md` §3.

### 1.5 Indexing dokumen/TKG proyek (opsional, kalau waktu cukup)

Kalau `tkg_records`/`rab_drafts` (Task R6) proyek tertentu di-update,
`db-api` (atau trigger terpisah) HARUS bisa memicu re-index chunk teks
relevan (`source_type='project_tkg'`) — **DESAIN SEDERHANA DULU**: endpoint
manual `POST /projects/{id}/reindex` yang dipanggil ai-orchestrator ATAU
skrip cron (Task R9 nanti) — JANGAN bangun trigger otomatis kompleks
(database trigger/pub-sub) di task ini, itu over-engineering untuk tahap
pertama. Kalau ini terasa terlalu besar untuk 1 PR, **PISAHKAN** jadi PR
kedua terpisah dan laporkan sebagai "R8b — lanjutan opsional".

---

## 2. Test WAJIB

- Indexer: jalankan terhadap katalog fixture kecil sintetis (5-10 item
  AHSP palsu, BUKAN data asli) → `knowledge_chunks` terisi benar,
  idempotent (jalan 2× → jumlah baris sama, bukan 2x lipat).
- `search_knowledge` tool: fake `db-api` response → tool mengembalikan
  hasil dengan `source_ref` yang bisa dirujuk; system prompt memuat
  instruksi wajib-sebut-sumber (test string contains, bukan test
  perilaku model asli).
- `POST /knowledge/search`: query embedding fixture (vector acak
  deterministik, dimensi sesuai skema) → hasil terurut by similarity
  (test dengan 3 chunk fixture, embedding yang jaraknya sudah diketahui
  manual → urutan hasil sesuai prediksi).

Jalankan test semua service tersentuh (services/db, ai-orchestrator).

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR8_RAG_VECTOR_STORE_CODEX_<tanggal>.md`.
Isi wajib: (1) model embedding yang dipakai & dimensi vektor (verifikasi
sumbernya, JANGAN menebak), (2) skema `knowledge_chunks` final, (3) hasil
test idempotency indexer, (4) apakah §1.5 (indexing dokumen proyek)
diselesaikan atau dipisah PR terpisah, (5) commit + PR, (6) konfirmasi
TIDAK ADA data AHSP asli (`G:\paax-data`) yang commit ke repo — hanya
fixture sintetis kecil di test.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R6 & R7): `feat/rag-vector-store-ahsp`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN commit data AHSP asli/katalog 2.542 item ke repo.
- JANGAN bangun trigger DB otomatis kompleks — endpoint manual/skrip cukup.
