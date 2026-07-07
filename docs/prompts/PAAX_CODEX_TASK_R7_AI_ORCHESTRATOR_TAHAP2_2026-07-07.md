# PROMPT CODEX — Task R7: AI-Orchestrator Tahap 2 (Context Server-Side, Streaming, Audit Log)

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 7).
> **WAJIB dikerjakan SETELAH** `PAAX_CODEX_TASK_R6_DATABASE_SERVER_SIDE_
> POSTGRES_2026-07-07.md` Langkah 1-2 (skema + API `db-api`) sudah merge —
> task ini konsumsi endpoint `db-api` yang dibangun di situ.

---

## 0. Konteks

`services/ai-orchestrator` (README + `src/tools/*.ts` — 7 tool:
`lookup_ahsp`, `run_scenario`, `analyze_drawing`, `query_rab`,
`query_schedule`, `query_progress`, `query_materials`) sekarang: (a) HANYA
`POST /chat` non-streaming, (b) `query_rab`/`query_schedule` HANYA baca
`context` yang dikirim client (batasan jujur di README), (c) NOL audit
log persisten — kalau ingin tahu riwayat tool-call, tidak ada tempat
menyimpannya, (d) NOL rate-limit.

Task R6 sudah (atau akan) menyediakan `services/db-api` dengan endpoint
`GET /projects/{id}/rab-draft`, `GET /projects/{id}/tkg`, dst. Task ini
memakainya.

---

## 1. Scope task ini

### 1.1 `query_rab`/`query_schedule` — DB server-side sbg sumber PRIMER

`src/tools/query_rab.ts` (verifikasi nama file exact): tambah env
`DB_API_URL`. Kalau `project_id` valid DAN `DB_API_URL` diset: fetch
`GET {DB_API_URL}/projects/{project_id}/rab-draft` — SUKSES → pakai itu.
GAGAL (404/500/timeout) ATAU `DB_API_URL` kosong → fallback ke
`context.rab_lines` yang dikirim client (PERILAKU LAMA, jangan dihapus).
Field response tool TIDAK BERUBAH (kontrak lama dipertahankan) — hanya
SUMBER datanya yang bertambah. Sama pola utk `query_schedule.ts` (fetch
`GET /projects/{id}/tkg` atau endpoint schedule yang relevan — VERIFIKASI
apa yang benar-benar disimpan Task R6 utk "schedule").

### 1.2 Streaming SSE — `POST /chat/stream` (endpoint BARU, terpisah)

**JANGAN ubah `POST /chat` yang sudah ada** (banyak kontrak bergantung
padanya, termasuk test yang sudah lulus). Tambah endpoint BARU
`POST /chat/stream` — sama request body, response `text/event-stream`:
tiap token/chunk jawaban Gemini dikirim sbg event `data: {"type":"token",
"content":"..."}\n\n`, tool-call dikirim sbg `data: {"type":"tool_call",
"tool":"...","input":{...}}\n\n`, selesai dgn `data: {"type":"done",
"tool_calls":[...]}\n\n`. Perlu VERIFIKASI apakah Gemini REST API
(`generateContent`, dipakai `client.ts`) punya varian streaming
(`streamGenerateContent`) — GUNAKAN itu kalau ada (baca dokumentasi Gemini
API endpoint yang relevan sebelum implementasi, JANGAN asumsi shape
response tanpa verifikasi — kalau tidak yakin, laporkan & implementasikan
fallback "pseudo-streaming" yang membagi respons non-streaming jadi
chunk-chunk buatan HANYA jika streaming asli tidak bisa dipastikan
formatnya, catat ini jujur di laporan sebagai keterbatasan).

### 1.3 Audit log persisten

Tabel baru di skema `services/db/` (Task R6, migrasi tambahan Alembic
task ini — `alembic/versions/0002_audit_log.py`):
```sql
CREATE TABLE tool_call_audit (
    id UUID PRIMARY KEY,
    conversation_id TEXT,
    project_id TEXT,
    tool_name TEXT NOT NULL,
    input_json JSONB NOT NULL,
    output_json JSONB,
    model TEXT,
    latency_ms INTEGER,
    tokens_in INTEGER,
    tokens_out INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_conversation ON tool_call_audit(conversation_id);
```
`tool-loop.ts` (loop tool-calling yang ADA — VERIFIKASI nama fungsi exact)
memanggil `db-api` (endpoint baru `POST /audit/tool-call`) SETELAH tiap
tool-call selesai — fire-and-forget (jangan blokir respons ke user kalau
audit log gagal ditulis, log error saja). Ini amanat `CLAUDE.md` §1.1
"Audit trail wajib ... karena keluaran LLM bisa bervariasi antar run".

### 1.4 Rate-limit per klien

Middleware Express sederhana (token-bucket in-memory per `project_id`
ATAU per IP kalau `project_id` tidak ada — putuskan mana yang lebih masuk
akal, laporkan alasan): `RATE_LIMIT_PER_MINUTE` env (default `30`),
respons `429` dgn `Retry-After` header kalau lewat. **JANGAN** tambah
dependency baru (`express-rate-limit`) kecuali benar-benar diperlukan —
implementasi manual sederhana lebih disukai kalau tidak rumit (± 30 baris).

---

## 2. Test WAJIB

- `query_rab`/`query_schedule`: fetch `db-api` sukses → dipakai; fetch
  gagal (mock network error) → fallback `context` dipakai TANPA error
  ke user; `DB_API_URL` kosong → perilaku identik SEBELUM task ini (test
  regresi 30 test lama HARUS tetap lulus tanpa modifikasi).
- Streaming: test dengan fake Gemini stream client → event `token`/
  `tool_call`/`done` muncul berurutan benar; `POST /chat` LAMA tidak
  berubah sama sekali (test lama tetap hijau).
- Audit log: tool-call memicu `POST /audit/tool-call` terpanggil dengan
  payload benar (mock `db-api`); kegagalan audit-log TIDAK menggagalkan
  respons chat ke user (fire-and-forget terbukti via test — audit gagal
  sengaja, assert chat tetap sukses).
- Rate limit: request ke-31 dalam 1 menit → `429`; reset setelah window
  lewat (mock waktu, jangan sleep asli di test).

Jalankan SEMUA test ai-orchestrator (baseline 30 passed — laporkan
before/after) + `tsc --noEmit`.

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR7_ORCHESTRATOR_TAHAP2_CODEX_<tanggal>.md`.
Isi wajib: (1) hasil verifikasi Gemini streaming API (dukung asli atau
pseudo-streaming, JUJUR), (2) skema audit log final, (3) hasil test
before/after, (4) konfirmasi `POST /chat` lama TIDAK berubah kontraknya,
(5) commit + PR.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R6 Langkah 1-2):
  `feat/ai-orchestrator-tahap2`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN ubah kontrak `POST /chat` yang sudah ada — hanya TAMBAH endpoint
  baru & sumber data baru dengan fallback.
