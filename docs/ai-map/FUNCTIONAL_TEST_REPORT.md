# Command Room Worker — Phase 10 Functional Test Report

Tanggal pengujian: **2026-08-18 (Asia/Jakarta)**  
Workspace target: D:\paax-ai-command-room-worker  
Scope: real runtime startup, provider verification, browser UI, direct API, tool execution, session context, invalid input, dan screenshot evidence.

## Status

**PARTIAL**

Worker berhasil dijalankan dan diuji secara nyata melalui browser serta gateway
service. Respons UI datang dengan konfigurasi runtime Mimo v2.5 melalui
opencode-go. Tool berhasil dieksekusi pada sesi dengan projectId eksplisit dan
konteks percakapan terjaga.

Status tidak PASS penuh karena:

- next dev membuka proses tetapi tidak menjadi HTTP-ready; setelah timeout
  panjang, pengujian UI dilanjutkan menggunakan hasil build production dan
  next start.
- Endpoint yang diminta persis, POST http://127.0.0.1:8082/api/chat, tidak
  tersedia dan mengembalikan 404.
- Tool pada sesi Work tanpa projectId gagal dengan tool_binding_conflict;
  sesi dengan projectId eksplisit berhasil.
- Katalog route Chat legacy masih mengiklankan DeepSeek, walaupun jalur
  Command Room Worker/Work yang diuji memakai Mimo.

## Model AI yang digunakan

**mimo-v2.5 — VERIFIED**

Receipt dari endpoint runtime target:

- alias: lucent
- provider: opencode-go
- model: mimo-v2.5
- transport: openai-compatible
- requestStyle: chat-completions
- selectedEffort: high
- thinking: on
- handoff: service-conversation-loop

Konfigurasi non-secret yang dipakai pada apps/web/.env.local:

- PAAX_COMMAND_ROOM_GATEWAY_MODE=service
- PAAX_DEFAULT_MODEL_ALIAS=lucent
- PAAX_MODEL_PROFILES_JSON memetakan lucent ke opencode-go / mimo-v2.5
- PAAX_PROVIDER_ENDPOINTS_JSON mengarah ke
  https://opencode.ai/zen/go/v1
- apiKeyEnv memakai DEEPSEEK_API_KEY yang sudah tersedia di env lokal,
  sesuai fallback yang diotorisasi user; nilai key tidak dicetak atau
  disimpan dalam laporan.

Catatan penting: konfigurasi tersebut berlaku pada jalur canonical Worker
service. GET /api/command-room/chat masih mengembalikan katalog legacy
DeepSeek (Lucent → deepseek-v4-flash); jalur Chat legacy ini bukan jalur Work
yang dipakai untuk verifikasi Mimo.

## Environment check

| ID | Check | Evidence nyata | Result |
|---|---|---|---|
| ENV-01 | Node | v24.19.0 | PASS |
| ENV-02 | Python | 3.11.15 | PASS |
| ENV-03 | pnpm | 9.15.0 via Corepack | PASS |
| ENV-04 | apps/web/.env.local | File ada; DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, dan INTERNAL_SERVICE_KEY terdeteksi terisi; secret tidak dicetak | PASS |
| ENV-05 | ai-orchestrator artifact | services/ai-orchestrator/dist/index.js tidak tersedia; package runtime menyediakan script dev berbasis tsx | INFO |

## Runtime startup and identity

### AI orchestrator

Target service dijalankan dari workspace ini menggunakan script package karena
dist/index.js tidak ada. Health check nyata:

GET http://127.0.0.1:8082/health → HTTP 200

runtime_identity yang diterima:

- repo_root: D:\paax-ai-command-room-worker
- commit: 9f1208a8285cac27f46ac4481d086a7b19d80ce0
- branch: master
- dirty: true (perubahan env/report pengujian)
- service_name: ai-orchestrator
- pid: 6424

### Web app

Percobaan pertama menjalankan next dev pada port 3000. Proses child Next.js
hidup, tetapi request HTTP dan navigasi browser tidak selesai setelah lebih
dari dua menit; proses dihentikan setelah readiness timeout.

Kemudian build production dijalankan dan selesai exit code 0:

- Next.js 15.5.19
- compiled successfully
- type validation berhasil
- static generation 25/25 berhasil

Fallback production dijalankan dengan next start --hostname 127.0.0.1.
GET http://127.0.0.1:3000/command-room → HTTP 200, HTML 35,818 bytes.

## Test cases

| ID | Test | Result | Evidence nyata |
|---|---|---|---|
| CFG-01 | Runtime provider diarahkan ke Mimo | PASS | Receipt prepare HTTP 200 menyatakan provider opencode-go dan model mimo-v2.5. |
| SVC-01 | ai-orchestrator target ready | PASS | GET /health HTTP 200 dengan repo_root target dan commit target. |
| SVC-02 | Web target ready | PASS WITH DEVIATION | next dev gagal menjadi HTTP-ready; production build exit 0 dan next start melayani /command-room HTTP 200. |
| UI-01 | Buka halaman Command Room pertama | PASS | Browser membuka /command-room; screenshot initial tersimpan. |
| UI-02 | Buka Work execution surface | PASS | Tab Work aktif, textbox Instruksi kerja dan tombol Kirim instruksi terlihat; screenshot tersimpan. |
| UI-03 | Kirim Halo, siapa kamu? via Work UI | PASS | SSE event turn.started/status.update/Final answer tampil; respons lengkap dari Command Room PAAX terlihat di UI. Provider receipt mengonfirmasi profile Mimo. |
| API-01 | POST persis ke /api/chat | FAIL | HTTP 404 dengan body Cannot POST /api/chat. Route tersebut tidak terdaftar pada ai-orchestrator target. |
| API-02 | Canonical Worker stream API | PASS | POST /gateway/command-room/turn/stream mengembalikan HTTP 200 text/event-stream dan event turn.completed. |
| TOOL-01 | Memicu workspace_list tanpa projectId | FAIL | HTTP 200 SSE, tetapi tool selesai sebagai failed dengan errorCode tool_binding_conflict. |
| TOOL-02 | Memicu workspace_list dengan projectId eksplisit | PASS | Event tool.started lalu tool.completed untuk workspace_list; summary 68 entry ditemukan; finalMarkdown menyatakan package.json ada. |
| SESSION-01 | Dua pesan pada sesi Work yang sama | PASS | Pesan kedua bertanya pertanyaan sebelumnya; agent menjawab tepat: Anda menyapa dengan pertanyaan "Halo, siapa kamu?". Screenshot context tersimpan. |
| ERR-01 | Empty/invalid gateway message | PASS | POST gateway dengan messages kosong mengembalikan HTTP 400 JSON: invalid_gateway_request / gateway request is invalid. Tidak ada crash atau stack trace ke client. |
| MODEL-LEGACY-01 | Verifikasi katalog Chat legacy | FAIL / SCOPE LIMITATION | GET /api/command-room/chat HTTP 200 masih mengembalikan provider deepseek dan deepseek-v4-flash/pro. Jalur Work service tetap terverifikasi Mimo. |
| SHOT-01 | Screenshot langkah penting | PASS | Browser screenshots dan screenshot dari ss_codex.py tersedia pada daftar di bawah. |

## Evidence tool execution

Prompt tool:

Gunakan tool workspace_list pada path . untuk melihat isi root workspace.
Jangan menebak hasil. Setelah tool selesai, laporkan apakah package.json ada.

Dengan projectId eksplisit, receipt SSE berisi:

- tool.started: workspace_list
- tool.completed: workspace_list
- state: completed
- summary: 68 entry ditemukan
- turn.completed: final menyatakan package.json ada di root workspace

Tanpa projectId, failure reproducible:

- toolBindingConflict
- errorCode: tool_binding_conflict
- pesan: binding tool tidak cocok dengan turn

Investigasi source/Graphify menunjukkan penyebab:

- runtime membentuk binding dengan projectId = source.projectId ?? source.conversationId
- TurnContext tanpa projectId menyimpan projectId undefined
- bindingMatchesContext membandingkan kedua nilai tersebut secara ketat
- Work UI tidak mengirim projectId ketika tidak ada proyek yang sedang dibuka

Akibatnya, sesi Work default tanpa proyek tidak dapat menjalankan tool
canonical, sementara sesi dengan projectId eksplisit dapat.

## Screenshot paths

- Halaman Chat awal:
  D:\paax-ai-command-room-worker\docs\ai-map\screenshots\phase10-ui-initial.png
- Work surface siap:
  D:\paax-ai-command-room-worker\docs\ai-map\screenshots\phase10-ui-work-ready.png
- Respons live Mimo/Worker:
  D:\paax-ai-command-room-worker\docs\ai-map\screenshots\phase10-ui-response-mimo.png
- Context recall sesi kedua:
  D:\paax-ai-command-room-worker\docs\ai-map\screenshots\phase10-ui-session-context.png
- Screenshot desktop yang diambil menggunakan tool yang diminta user,
  ss_codex.py:
  D:\paax-ai-command-room-worker\docs\ai-map\screenshots\phase10-web-start-blocked.png

Screenshot ss_codex.py adalah capture desktop Codex/Edge sesuai kemampuan
script; screenshot halaman web yang menjadi evidence UI diambil dari browser
Chrome yang mengendalikan halaman target secara langsung.

## Bugs / errors found

1. **next dev readiness hang.** Proses dev hidup tetapi tidak melayani request
   HTTP setelah timeout. Production build/start berhasil, sehingga masalah
   readiness dev terpisah dari jalur runtime production.
2. **API contract mismatch.** User-requested POST /api/chat mengembalikan 404.
   Worker memakai gateway canonical /gateway/command-room/turn/stream dan
   /gateway/command-room/turn/prepare.
3. **Tool binding conflict for unbound Work sessions.** Default Work session
   tanpa projectId gagal menjalankan tool karena mismatch project scope.
4. **Legacy Chat provider drift.** /api/command-room/chat masih mengiklankan
   DeepSeek. Ini perlu keputusan arsitektur bila requirement Mimo dimaksudkan
   untuk seluruh tab Chat dan bukan hanya Worker/Work.
5. **Missing dist artifact.** Instruksi node dist/index.js tidak dapat dipakai
   pada checkout ini; package dev script digunakan untuk menguji source runtime.

## Kesimpulan

Command Room Worker berfungsi nyata pada jalur Work: service target sehat,
browser menerima respons AI, provider receipt memverifikasi mimo-v2.5 melalui
opencode-go, tool dapat dieksekusi pada scope proyek yang valid, session
context terjaga, dan invalid input ditangani dengan HTTP 400.

Release gate tetap **PARTIAL** sampai API contract /api/chat, binding default
tanpa projectId, next dev readiness, dan keputusan konsistensi provider Chat
legacy ditangani.

Tidak ada commit, push, branch, PR, atau perubahan pada D:\paax-ai-main.

