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
AI_ORCH_MAX_TOOL_TURNS=3
```

Endpoint:
- `GET /health`
- `POST /chat`

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

## Tools

- `lookup_ahsp`: mencari kandidat AHSP dari katalog core-engine secara deterministik.
- `run_scenario`: menjalankan simulasi waktu-biaya via `POST /scenario/simulate`.
- `query_rab`: membaca snapshot RAB yang dikirim caller di `context.rab_lines`.
- `query_schedule`: membaca snapshot jadwal yang dikirim caller di `context.schedule`.
- `query_progress`: stub jujur, monitoring progres lapangan belum tersedia.
- `query_materials`: stub jujur, prediksi/pengingat kebutuhan material belum tersedia.

## Batasan Jujur

`query_rab` dan `query_schedule` tidak mengambil data dari database server-side. Saat ini draft RAB dan jadwal proyek berada di client, sehingga caller harus mengirim snapshot data ke `POST /chat` melalui field `context`.

`query_progress` dan `query_materials` selalu mengembalikan `available: false` karena Site Agent dan prediksi material belum dibangun.

`apps/web` belum memanggil service ini. Wiring frontend ke `ai-orchestrator` adalah pekerjaan terpisah.
