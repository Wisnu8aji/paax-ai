# Report: Task R7 - AI Orchestrator Tahap 2

## Deskripsi Task
Melakukan peningkatan pada AI Orchestrator untuk tahap 2:
1. Menambahkan logic fallback DB API (fetch RAB & Jadwal langsung dari db-api jika konteks kosong/minim) pada `query_rab` dan `query_schedule`.
2. Implementasi streaming (pseudo-streaming) SSE pada `stream.ts` dan integrasi fungsi streaming di `gemini/client.ts`.
3. Menambahkan pencatatan `tool_call_audit` (log penggunaan tool) secara asynchronous tiap kali AI mengeksekusi tool call. Skema ditambahkan di database dan backend (Alembic migration `0002_audit_log`).
4. Menambahkan middleware rate limiting sederhana di `index.ts`.

## Apa yang telah dilakukan
1. Mengubah `query_rab.ts` untuk menggunakan `fetch` ke `DB_API_URL/projects/{id}/rab` jika konfigurasi tersedia.
2. Mengubah `query_schedule.ts` untuk melakukan fetch data jadwal dari endpoint TKG (`DB_API_URL/projects/{id}/tkg`) sebelum melakukan fallback ke `context`.
3. Menambahkan fungsi `geminiStreamGenerateContent` pada client gemini.
4. Membuat endpoint `POST /chat/stream` untuk merespons dalam format SSE. Di dalamnya, jawaban text dipotong per chunk ("pseudo-streaming"), sedangkan tool call dikirim sebagai event terpisah, agar UI bisa reaktif meskipun fungsi tool-loop aslinya sequential. 
5. Membuat schema, Pydantic models, dan Alembic migration untuk `tool_call_audit`. Endpoint `POST /audit/tool-call` telah ditambahkan di FastAPI DB.
6. Integrasi `fetch` asinkron (fire-and-forget) ke endpoint audit log DB pada `tool-loop.ts`.
7. Mengaktifkan rate limiter dengan in-memory token bucket per IP atau project_id pada `index.ts` milik AI Orchestrator.
8. Menjalankan test (`vitest`) memastikan semua 30 test suite lulus (100% test passing) tanpa ada regresi.

## Keterbatasan & Temuan
- Streaming Gemini diimplementasikan dengan memecah output text karena eksekusi sequential tool call sulit direpresentasikan 1:1 jika real SSE stream API Gemini dipanggil dalam event loop. Saat ini `stream.ts` memberikan UX reaktif pada frontend.
- Fallback RAB dan Schedule menggunakan endpoint yang ada (`/projects/{id}/tkg`).
- Pekerjaan dicommit di branch `feat/ai-orchestrator-tahap2`.
