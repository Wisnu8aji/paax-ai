# PAAX AI Orchestrator

Service backend Express + TypeScript untuk Engineering Chat tool-calling.

## Jalankan Lokal

```bash
pnpm install
pnpm --filter ai-orchestrator dev
```

Environment:

```bash
PORT=8082
GEMINI_API_KEY=<isi untuk mode Gemini>
CORE_ENGINE_URL=http://localhost:8081
DOCUMENT_INTELLIGENCE_URL=http://localhost:8083
AI_ORCH_MAX_TOOL_TURNS=3
```

Endpoint:
- `GET /health`
- `POST /chat` (auth + rate-limit per `project_id`/IP)
- `POST /chat/stream` (sama, SSE pseudo-streaming — teks dipotong per-chunk, bukan native Gemini streaming)

Contoh:

```json
{
  "message": "Carikan AHSP cat dinding",
  "project_id": "proj-123",
  "context": {
    "rab_lines": [
      {"id": "line-1", "ahsp_code": "A.1", "volume": 12.5, "duration_days": 4}
    ]
  }
}
```

## Tools (`src/tools/`)

- `lookup_ahsp`: mencari kandidat AHSP dari katalog core-engine secara deterministik.
- `search_knowledge`: RAG — cari pengetahuan AHSP/proyek via `services/db` (pgvector di Postgres, fallback cosine-similarity di SQLite untuk test lokal). Embedding: Gemini `text-embedding-004`.
- `run_scenario`: menjalankan simulasi waktu-biaya via `POST /scenario/simulate`.
- `analyze_drawing`: mengecek status dan ringkasan hasil analisa gambar dari `services/document-intelligence` berdasarkan `job_id`.
- `query_rab`: membaca snapshot RAB yang dikirim caller di `context.rab_lines`.
- `query_schedule`: membaca snapshot jadwal yang dikirim caller di `context.schedule`.
- `query_progress`: **stub tetap** — mengembalikan `available: false` walau `services/site-agent` sudah ada (R14); tool ini belum di-wiring ke endpoint site-agent yang nyata. Gap jujur, belum dikerjakan.
- `query_materials`: stub jujur, prediksi/pengingat kebutuhan material belum tersedia (belum ada rencana konkret).

Semua panggilan tool dicatat async (fire-and-forget) ke `services/db` `/audit/tool-call`.

## Batasan Jujur

`query_rab` dan `query_schedule` tidak mengambil data dari database server-side. Saat ini draft RAB dan jadwal proyek berada di client, sehingga caller harus mengirim snapshot data ke `POST /chat` melalui field `context`.

`analyze_drawing` membaca `GET /drawings/analyze/status/{job_id}` dari document-intelligence — job store sekarang **persisten** (file-based, R2), tidak lagi in-memory, jadi status job bertahan lintas restart.

`apps/web` belum memanggil service ini untuk Engineering Chat per-proyek (`app/api/ai/chat/route.ts` masih memanggil Gemini langsung). **Command Room** (`apps/web/src/app/(dashboard)/command-room/`) juga TIDAK memanggil service ini — ia punya jalur NVIDIA/DeepSeek sendiri di `apps/web/src/lib/ai/orchestrator.ts` + `app/api/command-room/chat/route.ts`. Wiring frontend ke `ai-orchestrator` ini masih pekerjaan terpisah yang belum dijadwalkan.
