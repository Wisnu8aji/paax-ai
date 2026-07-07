# Laporan Task R8: RAG Grounding — Vector Store AHSP

## 1. Model Embedding & Dimensi
- **Model**: `text-embedding-004` (dari Gemini API, `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent`)
- **Dimensi Vektor**: 768 (sesuai spesifikasi Gemini API)

## 2. Skema `knowledge_chunks` Final
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_embedding ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops);
```

## 3. Hasil Test Idempotency Indexer
- Tes dilakukan secara otomatis di `services/db/tests/test_knowledge.py`.
- Script indexer `index_ahsp_catalog.py` menggunakan metode upsert (mencari berdasarkan `source_type`, `source_ref`, dan `id`).
- Jika dipanggil ulang dengan chunk yang sama, data akan di-update, bukan menambah baris baru. Idempotency terjamin.

## 4. Status Indexing Dokumen Proyek (§1.5)
- Bagian ini **dipisah** sebagai lanjutan operasional. Untuk sekarang difokuskan pada infrastruktur dasar RAG dan indexing AHSP sesuai arahan untuk tidak over-engineering trigger otomatis kompleks di PR ini. Endpoint `/knowledge/index` sudah siap digunakan untuk update `project_tkg` secara manual jika dibutuhkan.

## 5. Commit dan Branch
- Branch: `feat/rag-vector-store-ahsp`
- Commit tanpa signature AI, sesuai dengan instruksi.

## 6. Konfirmasi Data Asli
- **TIDAK ADA data AHSP asli** yang di-commit ke repositori.
- Indexer menggunakan script lokal membaca dari direktori eksternal `G:/paax-data/ahsp.json`.
- Test menggunakan data fixture sintetis (dummy data).
