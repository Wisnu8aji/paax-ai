# PROMPT CODEX — AI-Orchestrator Chain 01/2: Scaffold Service + Loop Tool-Calling Gemini + 2 Tool Proxy

> Ditulis Claude, 2026-07-05, reasoning tinggi, atas persetujuan EKSPLISIT
> owner ("semua saya setujui") utk membangun `services/ai-orchestrator`
> sbg service backend baru — migrasi tool-calling nyata utk Engineering
> Chat (§8.1 `docs/MASTER_PLAN.md`: `query_rab`/`query_schedule`/
> `lookup_ahsp`/`query_progress`/`run_scenario`/`query_materials`).
>
> **Ini bagian 1 dari 2 file berantai.** Setelah task ini selesai DAN
> report ditulis (§7), **WAJIB langsung baca & lanjutkan** ke:
> `docs/prompts/PAAX_CODEX_CHAIN_AIO_02_TOOLS_RAB_SCHEDULE_PROGRESS_MATERIALS_2026-07-05.md`
> — JANGAN berhenti menunggu instruksi manual, lanjutkan otomatis kecuali
> menemukan blocker nyata (lihat §8).

---

## 0. Konteks — kenapa task ini ada & keputusan desain yang SUDAH diambil

Audit B0 (`docs/ai-map/STATE.md` §AUDIT B0) menemukan: Engineering Chat
saat ini (`apps/web/src/app/api/ai/chat/route.ts`) HANYA satu panggilan
Gemini one-shot dgn "context pack" teks statis — TIDAK ADA tool-calling
sungguhan. Semua kode AI (`apps/web/src/lib/ai/*.ts`) hidup 100% di dalam
`apps/web/**`, dan **`services/ai-orchestrator/` yang disebut
`MASTER_PLAN.md` §15.2 "mulai v0.8" TIDAK PERNAH DIBUAT**. Karena Codex
dilarang mutlak menyentuh `apps/web/**`, solusinya: bangun service BARU
`services/ai-orchestrator` (Node/TypeScript, BUKAN `apps/web`) yang
Codex BOLEH implementasikan penuh.

**Owner SUDAH menyetujui EKSPLISIT keputusan besar ini** ("semua saya
setujui") — TIDAK perlu tanya ulang. Tugas Codex sesi ini: implementasi
backend service baru SESUAI SPEK DI BAWAH INI (spek sudah dirancang
Claude, Codex TIDAK perlu membuat keputusan arsitektur baru, cukup ikuti).

### 0.1 Temuan penting yang WAJIB diketahui sebelum mulai

1. **Ada scaffold LAMA yang TIDAK DIPAKAI**: `scripts/scaffolding/
   create_ai_orch.py` men-generate `services/ai-orchestrator` berbasis
   **Genkit** (`@genkit-ai/core`, `@genkit-ai/googleai`, `@genkit-ai/flow`)
   dgn flow MOCK (`"Menerima pesan: ..."`, tidak ada logika nyata). Script
   ini **TIDAK PERNAH DIJALANKAN** (folder `services/ai-orchestrator`
   belum ada di repo) dan filenya sendiri punya artefak encoding rusak
   (string terpotong). **JANGAN jalankan script ini, JANGAN pakai
   Genkit.** Keputusan desain (Claude, didokumentasikan eksplisit):
   pakai **REST langsung ke Gemini API + Express**, BUKAN Genkit — alasan:
   (a) pola REST langsung SUDAH TERBUKTI jalan di repo ini
   (`apps/web/src/lib/ai/orchestrator.ts`, lihat §1.2), (b) Genkit API
   berubah cepat & scaffold lama sudah rusak/usang, menambah risiko tanpa
   manfaat jelas utk slice pertama ini, (c) tidak menambah dependency
   framework baru yang perlu dipelajari dari nol. Ini DEVIASI SADAR dari
   `MASTER_PLAN.md` §15.2 (yang menyebut "Node/Genkit") — dicatat jujur,
   BUKAN kesalahan; migrasi ke Genkit tetap opsi terbuka di masa depan
   kalau pola manual ini terbukti perlu upgrade.
2. **`pnpm-workspace.yaml`** SAAT INI hanya `apps/*` dan `packages/*` —
   **TIDAK termasuk `services/*`**. `services/ai-orchestrator` (Node/TS)
   PERLU ditambahkan sbg workspace member. `services/core-engine` dan
   `services/document-intelligence` (Python) TIDAK di pnpm workspace
   (wajar, beda bahasa) — JANGAN mengubah cara kedua service Python itu
   dikelola.
3. **Root `package.json`** SUDAH punya `@types/express` di
   `devDependencies` (temuan Claude, artefak dari usaha lama yang tidak
   selesai) — BOLEH dipakai/diandalkan, TAPI cek juga apakah `express`
   (runtime, bukan cuma `@types/express`) sudah ada sbg dependency di
   manapun; kalau belum, tambahkan `express` sbg dependency BARU khusus di
   `services/ai-orchestrator/package.json` (bukan root) — service ini
   independen, tidak perlu semua paket ada di root.
4. **PORT**: `services/core-engine` pakai 8081, `services/document-
   intelligence` pakai 8083 (lihat root `package.json` script
   `dev:core`/`dev:doc-intel`). **Pakai PORT 8082** utk
   `services/ai-orchestrator` (default, override via env `PORT`).

---

## 1. Scope task ini (Chain 01/2) — HANYA bagian ini, JANGAN lebih

1. Scaffold service `services/ai-orchestrator/` (struktur file §2).
2. Implementasi klien Gemini + LOOP tool-calling multi-turn (§3) — bagian
   PALING PENTING & PALING BERISIKO, kerjakan dgn hati-hati & test lengkap.
3. Implementasi 2 tool PALING SEDERHANA (proxy langsung ke core-engine,
   TIDAK butuh data dari client): `lookup_ahsp` dan `run_scenario` (§4).
4. Endpoint `GET /health` dan `POST /chat` yang MENGGABUNGKAN loop
   tool-calling + 2 tool ini (§5).
5. Test lengkap dgn FAKE Gemini client (§6) — TIDAK PERNAH memanggil API
   Gemini sungguhan.

**JANGAN dikerjakan di task ini** (itu tugas Chain 02): tool
`query_rab`/`query_schedule`/`query_progress`/`query_materials`. Endpoint
`/chat` di task ini HANYA punya 2 tool terdaftar (`lookup_ahsp`,
`run_scenario`) — 4 tool sisanya ditambahkan di Chain 02 tanpa mengubah
arsitektur loop yang sudah dibangun di sini.

**JANGAN menyentuh `apps/web/**` sama sekali** — service ini BERDIRI
SENDIRI, tidak dipanggil siapa pun dari `apps/web` di task ini (wiring
`apps/web` → `ai-orchestrator` adalah tugas Claude terpisah, BUKAN Codex).

---

## 2. Struktur file yang harus dibuat

```
services/ai-orchestrator/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                    # bootstrap Express, listen PORT
│   ├── config.ts                   # baca env: PORT, GEMINI_API_KEY, CORE_ENGINE_URL
│   ├── routes/
│   │   ├── health.ts               # GET /health
│   │   └── chat.ts                 # POST /chat (pakai loop dari gemini/tool-loop.ts)
│   ├── gemini/
│   │   ├── client.ts               # geminiGenerateContent() — REST call mentah
│   │   ├── tool-loop.ts            # loop multi-turn tool-calling (INTI task ini)
│   │   └── types.ts                # tipe request/response Gemini (contents, tools, parts, dst)
│   └── tools/
│       ├── types.ts                # interface ToolDefinition (declaration + execute)
│       ├── registry.ts             # daftar semua tool aktif (Chain 01: 2 tool; Chain 02: +4)
│       ├── lookup_ahsp.ts
│       └── run_scenario.ts
└── tests/
    ├── gemini/
    │   ├── fake-gemini-client.ts   # stub deterministik, TIDAK PERNAH panggil jaringan
    │   └── tool-loop.test.ts
    ├── tools/
    │   ├── lookup_ahsp.test.ts
    │   └── run_scenario.test.ts
    └── routes/
        └── chat.test.ts
```

Test runner: **vitest** (SAMA dgn `apps/web`, konsisten tooling repo ini —
cek `apps/web/package.json`/`vitest.config.ts` utk pola konfigurasi yang
sudah ada, JANGAN pakai jest/mocha).

---

## 3. Klien Gemini + loop tool-calling (INTI, kerjakan paling hati-hati)

### 3.1 Pola REST yang WAJIB diikuti (sudah terbukti jalan di repo ini)

Contoh REFERENSI (BACA file ini dulu sebelum menulis kode, JANGAN
menebak-nebak shape API): `apps/web/src/lib/ai/orchestrator.ts` fungsi
`geminiGenerateContent`. Pola: `POST https://generativelanguage.
googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, header
`x-goog-api-key: <key>` (BUKAN query param), body JSON
`{contents: [...], generationConfig: {...}}`.

### 3.2 Tambahan utk tool-calling (BARU, belum ada contoh di repo — ikuti
spek ini persis)

Body request Gemini function-calling:
```json
{
  "contents": [
    {"role": "user", "parts": [{"text": "<pesan user>"}]}
  ],
  "systemInstruction": {"parts": [{"text": "<system prompt>"}]},
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "lookup_ahsp",
          "description": "Cari kode AHSP dari kata kunci nama pekerjaan.",
          "parameters": {
            "type": "OBJECT",
            "properties": {
              "query": {"type": "STRING", "description": "Kata kunci nama pekerjaan, mis. 'cat dinding'"}
            },
            "required": ["query"]
          }
        }
      ]
    }
  ],
  "generationConfig": {"temperature": 0.2}
}
```

Response BISA berisi salah satu dari 2 bentuk part di
`candidates[0].content.parts[0]`:
- `{"text": "<jawaban akhir>"}` → SELESAI, kembalikan teks ini sbg jawaban.
- `{"functionCall": {"name": "lookup_ahsp", "args": {"query": "cat dinding"}}}`
  → model MINTA eksekusi tool. Jalankan tool lokal yang cocok
  (`registry.ts`), lalu KIRIM ULANG request dgn `contents` bertambah 2
  turn baru:
  ```json
  {"role": "model", "parts": [{"functionCall": {"name": "lookup_ahsp", "args": {"query": "cat dinding"}}}]},
  {"role": "function", "parts": [{"functionResponse": {"name": "lookup_ahsp", "response": { "...hasil tool sbg object JSON..." }}}]}
  ```
  Lalu panggil `generateContent` LAGI dgn `contents` yang sudah bertambah
  (tools tetap disertakan). Ulangi sampai dapat `text` ATAU sampai
  `MAX_TOOL_TURNS` tercapai.

### 3.3 Guard WAJIB (anti infinite-loop, anti biaya tak terkendali)

- `MAX_TOOL_TURNS = 3` (konstanta bernama, boleh di-override via env
  `AI_ORCH_MAX_TOOL_TURNS` utk fleksibilitas test) — kalau model masih
  minta tool call ke-4, HENTIKAN paksa & kembalikan jawaban fallback jujur:
  `"Maaf, saya butuh terlalu banyak langkah untuk pertanyaan ini. Coba
  perjelas pertanyaan Anda."` — JANGAN infinite loop, JANGAN biarkan biaya
  API tak terbatas.
- Tool yang TIDAK terdaftar di `registry.ts` tapi diminta model (nama
  fungsi asing) → JANGAN crash, kembalikan `functionResponse` berisi
  `{"error": "tool tidak dikenal: <nama>"}` ke model, biarkan model
  menyesuaikan jawaban.
- Tool yang error saat eksekusi (exception, network fail ke core-engine)
  → TANGKAP, kembalikan `functionResponse` `{"error": "<pesan error
  singkat>"}` ke model (BUKAN throw ke caller `/chat` — model harus tetap
  bisa menyusun jawaban yang menjelaskan kegagalan ke user).
- `GEMINI_API_KEY` tidak diset → `/chat` langsung kembalikan fallback
  (JANGAN panggil Gemini sama sekali), pola sama
  `apps/web/src/app/api/ai/chat/route.ts` (`fallbackEngineeringAnswer`):
  `{provider: "local-fallback", fallback: true, answer: "GEMINI_API_KEY
  belum disetel di ai-orchestrator."}`.
- **Audit trail WAJIB**: setiap tool call (nama, args, ringkasan hasil)
  dicatat ke array `tool_calls` yang dikembalikan di response `/chat` —
  lihat §5.2 utk shape persis. Ini KONSISTEN dgn prinsip audit trail
  `CLAUDE.md` §1.1 yang sudah diterapkan di lapisan AI-assist
  document-intelligence sesi-sesi sebelumnya.

### 3.4 Struktur kode yang disarankan (`gemini/tool-loop.ts`)

```typescript
export interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface ToolLoopResult {
  answer: string;
  toolCalls: ToolCallLog[];
  hitMaxTurns: boolean;
}

export async function runToolCallingLoop(params: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];        // dari registry.ts
  maxTurns?: number;               // default MAX_TOOL_TURNS
  fetchImpl?: typeof fetch;        // utk test, sama pola orchestrator.ts
}): Promise<ToolLoopResult> { ... }
```

`resultSummary` di `ToolCallLog` HARUS ringkas (mis. "3 kandidat AHSP
ditemukan" bukan dump penuh JSON) — ini utk audit trail yang bisa dibaca
manusia, BUKAN log mentah.

---

## 4. 2 Tool proxy sederhana (Chain 01)

### 4.1 `lookup_ahsp`

**Endpoint sumber**: `GET {CORE_ENGINE_URL}/ahsp` — **PENTING, VERIFIKASI
SENDIRI SEBELUM IMPLEMENTASI**: endpoint ini (dicek Claude,
`services/core-engine/app/main.py` baris ~144) **MENGEMBALIKAN SELURUH
KATALOG** (±2.542 item `{code, name, unit, bidang}`), **TIDAK ADA filter
query param server-side**. Implikasi: `lookup_ahsp` tool HARUS melakukan
filter DI SISI `ai-orchestrator` sendiri (bukan di core-engine):

```typescript
interface LookupAhspArgs {
  query: string;      // kata kunci, mis. "cat dinding"
  limit?: number;      // default 5, max 10
}
interface LookupAhspResult {
  candidates: Array<{ code: string; name: string; unit: string }>;
  total_matched: number;
}
```

Logika: fetch SELURUH katalog dari `GET {CORE_ENGINE_URL}/ahsp` (cache
in-memory di module scope dgn TTL 5 menit — supaya tidak fetch 2.542 item
tiap panggilan tool, tapi TETAP refresh berkala; JANGAN cache permanen
tanpa TTL). Filter: `name.toLowerCase().includes(query.toLowerCase())`
ATAU token overlap sederhana (pisah `query` jadi kata, item match kalau
SEMUA kata query muncul di `name` — case-insensitive). Urutkan hasil
BERDASARKAN kecocokan (jumlah token match menurun), ambil `limit` teratas.
**TIDAK ADA logika AI/LLM di sini — ini filter deterministik biasa**,
konsisten Aturan Emas (`CLAUDE.md` §1: LLM boleh MEMILIH memanggil tool
ini, tapi filter/pencarian di dalam tool sendiri harus deterministik).

Kalau `CORE_ENGINE_URL` tidak bisa dihubungi (network error) → tool
mengembalikan `{candidates: [], total_matched: 0, error: "core-engine
tidak dapat dihubungi"}` — JANGAN crash proses.

### 4.2 `run_scenario`

**Endpoint sumber**: `POST {CORE_ENGINE_URL}/scenario/simulate`. Request
body PERSIS schema `ScenarioConfig` (`services/core-engine/app/scenario/
models.py` baris 32-40, VERIFIKASI LANGSUNG ke file itu sebelum
implementasi, JANGAN menebak field yang mungkin sudah berubah):

```python
class ScenarioConfig(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    base_mode: Literal["sequential", "parallel"] = "sequential"
    crew_factor: float = 2.0
    overtime_speedup: float = 1.25
    overtime_cost_factor: float = 1.4
    params: ScenarioParams | None = None
    lines: List[ScenarioLineInput]   # WAJIB, tidak ada default

class ScenarioLineInput(BaseModel):
    ahsp_code: str
    volume: float
    workers: int = 4
```

```typescript
interface RunScenarioArgs {
  lines: Array<{ ahsp_code: string; volume: number; workers?: number }>;
  region_code?: string;    // default "jateng"
  ppn_rate?: number;       // default 0.11
  crew_factor?: number;    // default 2.0
}
interface RunScenarioResult {
  baseline_total_days: number;
  baseline_total_cost: number;
  candidates: Array<{ key: string; label: string; total_days: number; total_cost: number }>;
}
```

Logika: proxy langsung — bangun `ScenarioConfig`-shaped body dari args
(field yang tidak diisi model, pakai default di atas), POST ke
`/scenario/simulate`, ambil field yang relevan dari `ScenarioResult`
(lihat `packages/schemas/src/index.ts` `ScenarioResultSchema` utk shape
response PERSIS — WAJIB dicek dulu, JANGAN menebak nama field). Kalau
`lines` kosong (model tidak kasih data RAB sama sekali, DAN tidak ada
fallback dari context — di Chain 01 belum ada context dari client, jadi
kalau `lines` kosong TOOL INI HARUS menolak jujur, BUKAN memanggil engine
dgn array kosong):
```typescript
if (args.lines.length === 0) {
  return { error: "tidak ada data RAB untuk disimulasikan — minta user menyebutkan item & volume, atau tunggu Chain 02 (context dari client)" };
}
```

---

## 5. Endpoint HTTP

### 5.1 `GET /health`
```json
{"status": "ok", "service": "ai-orchestrator", "version": "0.1.0"}
```

### 5.2 `POST /chat`

Request:
```json
{
  "message": "Carikan kode AHSP untuk pekerjaan cat dinding",
  "project_id": "proj-123"
}
```

Response (sukses, Gemini dipanggil):
```json
{
  "provider": "gemini-2.5-flash",
  "fallback": false,
  "answer": "Kode AHSP yang cocok: ... (dari lookup_ahsp)",
  "tool_calls": [
    {"tool": "lookup_ahsp", "args": {"query": "cat dinding"}, "resultSummary": "3 kandidat ditemukan"}
  ]
}
```

Response (GEMINI_API_KEY tidak diset):
```json
{
  "provider": "local-fallback",
  "fallback": true,
  "answer": "GEMINI_API_KEY belum disetel di ai-orchestrator.",
  "tool_calls": []
}
```

`systemPrompt` yang dipakai (WAJIB persis semangat ini, boleh disesuaikan
kalimatnya tapi JANGAN hilangkan larangan hitung sendiri):
```
Anda adalah Engineering Chat PAAX, asisten AI di workspace insinyur sipil
Indonesia. Anda punya akses ke tool: lookup_ahsp (cari kode AHSP),
run_scenario (jalankan simulasi skenario waktu-biaya via engine
deterministik). WAJIB gunakan tool ini kalau pertanyaan user butuh data
itu -- JANGAN mengarang kode AHSP atau angka simulasi sendiri. Angka
final SELALU dari hasil tool (core-engine), tidak pernah dari perkiraan
Anda sendiri. Jawab singkat, teknis, Bahasa Indonesia.
```

---

## 6. Test WAJIB (vitest, TIDAK PERNAH panggil API Gemini sungguhan)

### 6.1 `tests/gemini/fake-gemini-client.ts`
Stub `fetchImpl` yang bisa diprogram utk skenario: (a) langsung jawab
teks, (b) minta 1 tool call lalu jawab teks, (c) minta tool call berturut-
turut sampai `MAX_TOOL_TURNS` (utk test guard), (d) network error.

### 6.2 `tests/gemini/tool-loop.test.ts`
- Loop mengembalikan teks langsung kalau model tidak minta tool sama
  sekali.
- Loop mengeksekusi tool yang diminta, mengirim `functionResponse`, dan
  mengembalikan jawaban akhir model setelah itu.
- Loop berhenti paksa di `MAX_TOOL_TURNS` dgn `hitMaxTurns: true` dan
  jawaban fallback jujur (BUKTIKAN test ini dgn fake client yang SELALU
  minta tool call, tidak pernah kasih teks).
- Tool call ke nama tool yang tidak terdaftar → `functionResponse` berisi
  `error`, loop TIDAK crash.
- Tool yang throw exception saat eksekusi → ditangkap, `functionResponse`
  berisi `error`, loop TIDAK crash.

### 6.3 `tests/tools/lookup_ahsp.test.ts`
- Query cocok → kandidat terurut relevansi.
- Query tidak cocok apa pun → `candidates: []`, `total_matched: 0`.
- Core-engine tidak bisa dihubungi (mock fetch throw) → `error` field
  terisi, tidak crash.
- Cache TTL: 2 panggilan berturut dlm TTL yang sama → HANYA 1 fetch ke
  core-engine (assert jumlah pemanggilan fetch mock).

### 6.4 `tests/tools/run_scenario.test.ts`
- Args lengkap → payload yang dikirim ke `/scenario/simulate` PERSIS
  sesuai `ScenarioConfig` (assert body request mock).
- `lines` kosong → `error` field terisi, TIDAK memanggil core-engine sama
  sekali (assert fetch mock TIDAK dipanggil).

### 6.5 `tests/routes/chat.test.ts`
- `GEMINI_API_KEY` tidak diset → response `local-fallback`, TIDAK ada
  panggilan jaringan ke Gemini (assert via fake fetch call count = 0).
- End-to-end dgn fake Gemini client: user tanya sesuatu yang trigger
  `lookup_ahsp` → response akhir berisi `tool_calls` dgn 1 entri.

Jalankan `pnpm --filter ai-orchestrator test` (atau nama package yang
kamu pilih di `package.json`, WAJIB konsisten dgn `name` yang didaftarkan)
setelah selesai — laporkan hasil lengkap di report (§7).

---

## 7. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_AIO_CHAIN01_SCAFFOLD_TOOLCALLING_CODEX_<tanggal>.md`.
**JANGAN edit/hapus report lama** (semua file `REPORT_*` yang sudah ada).

Isi wajib: (1) struktur file yang dibuat, (2) keputusan desain yang
DIIKUTI dari spek ini vs yang TERPAKSA disesuaikan (kalau ada — jelaskan
kenapa), (3) hasil test lengkap (jumlah pass/fail), (4) daftar commit
sesi ini dgn output MENTAH `git log -1 --format="%H%n%s%n%n%b" <sha>`
tiap commit, (5) link PR + status, (6) konfirmasi eksplisit: tidak ada
`apps/web/**` tersentuh, tidak ada `Co-Authored-By`/signature AI di commit
manapun.

---

## 8. Pembagian kerja, commit, gerbang review, dan larangan (SAMA seperti fase sebelumnya)

- **Branch baru dari `main`** (mis. `feat/ai-orchestrator-toolcalling`) —
  service ini independen dari kerja document-intelligence sesi-sesi
  sebelumnya, tidak ada overlap file.
- **Commit HANYA oleh Codex**, boleh beberapa commit kecil (scaffold →
  loop → tools → tests), **TANPA `Co-Authored-By`/signature AI apa pun**.
- **PR draft ke `main`, JANGAN merge sendiri.**
- **JANGAN sentuh `apps/web/**` sama sekali.**
- **JANGAN pakai Genkit** (§0.1 poin 1) — kalau di tengah jalan kamu
  merasa REST manual terlalu rumit/tidak cukup, **STOP dan laporkan**
  di report kenapa, JANGAN diam-diam ganti pendekatan.
- Kalau ternyata `express` runtime ATAU `@types/express` di root
  `package.json` menyebabkan konflik versi/dependency yang tidak bisa
  diselesaikan dgn mudah: **STOP, laporkan detail konfliknya**, JANGAN
  memaksakan workaround yang mengubah `package.json` root/`apps/web`.
- **SETELAH task ini selesai DAN report (§7) sudah ditulis: LANGSUNG baca
  dan lanjutkan mengerjakan** `docs/prompts/PAAX_CODEX_CHAIN_AIO_02_
  TOOLS_RAB_SCHEDULE_PROGRESS_MATERIALS_2026-07-05.md`. **Jangan berhenti
  menunggu instruksi manual** — lanjutkan otomatis, KECUALI kamu menemukan
  blocker nyata (lihat larangan "STOP" di atas), dalam hal itu berhenti
  DAN laporkan blocker-nya dgn jelas di report Chain 01 ini.
