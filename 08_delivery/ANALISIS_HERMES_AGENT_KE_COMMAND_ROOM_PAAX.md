# Analisis Mendalam: Aplikasi Hermes Agent ke Command Room PAAX

> **Tanggal:** 2026-08-06  
> **Sumber:** `hermes-agent-main.zip` (65.5 MB, 9,495 file, Hermes Agent by Nous Research)  
> **Lisensi:** MIT (open source, commercial use diizinkan)  
> **Tujuan:** Menganalisis arsitektur Hermes Agent dan membuat rencana implementasi penuh untuk Command Room PAAX  
> **Status:** ANALISIS & PLAN — BELUM IMPLEMENTASI

---

## Ringkasan Eksekutif

Hermes Agent adalah framework AI agent open-source yang sangat matang dengan arsitektur yang bisa diaplikasikan hampir seluruhnya ke Command Room PAAX. Konsep-konsep kuncinya — **Skill System, Persistent Memory, Session Search, Context Compression, Provider Abstraction, Multi-Agent Orchestration, Gateway, Tool System** — semuanya relevan dan bisa diadaptasi dengan rebranding.

PAAX Command Room saat ini sudah memiliki **basic chat + 3 model + tool-calling** tapi belum memiliki:
- ✅ Skill system (self-improving AI)
- ✅ Persistent memory lintas sesi (dengan SQLite + FTS5)
- ✅ Session search untuk recall percakapan lama
- ✅ Context compression (258K token handling)
- ✅ Provider pool + credential rotation
- ✅ Multi-profile / persona system
- ✅ Webhook + cron + scheduling

**Strategi:** Adaptasi konsep + arsitektur (bukan copy-paste). Nama diubah total. Gunakan Hermes sebagai reference implementation.

---

## 1. Arsitektur Hermes Agent — Peta Komponen

### 1.1 Struktur File Kunci

```
hermes-agent-main/
├── run_agent.py           # AIAgent class — 7,800+ line, main entry point
├── agent/                 # Core agent logic (44+ files, ~3.5M LOC)
│   ├── conversation_loop.py   # 413KB — turn-by-turn conversation
│   ├── agent_init.py          # 140KB — agent initialization
│   ├── prompt_builder.py      # 109KB — system prompt assembly
│   ├── system_prompt.py       # 31KB — system prompt tiers
│   ├── tool_executor.py       # 109KB — tool dispatch/execution
│   ├── context_compressor.py  # 342KB — automatic compaction
│   ├── memory_manager.py      # 50KB — persistent memory orchestration
│   ├── skill_utils.py         # 35KB — skill loading/parsing
│   ├── credential_pool.py     # 148KB — API key rotation
│   ├── model_metadata.py      # 147KB — model capabilities
│   ├── chat_completion_helpers.py  # 217KB — provider abstraction
│   ├── error_classifier.py    # 80KB — error classification/retry
│   └── turn_context.py        # 61KB — per-turn context assembly
├── tools/                 # Tool implementations (100+ files, ~4.5M LOC)
│   ├── registry.py            # Tool registry + discovery
│   ├── skills_tool.py         # skill_view, skills_list
│   ├── skill_manager_tool.py  # skill_manage (create/patch/delete)
│   ├── memory_tool.py         # memory (CRUD persistent memory)
│   ├── session_search_tool.py # session_search (FTS5 recall)
│   ├── delegate_tool.py       # delegate_task (subagent spawning)
│   ├── cronjob_tools.py       # cronjob (scheduling)
│   ├── file_tools.py          # read_file, write_file, patch, search_files
│   ├── terminal_tool.py       # terminal (shell execution)
│   ├── browser_tool.py        # browser navigate/click/snapshot
│   ├── web_tools.py           # web_search, web_extract
│   ├── clarify_tool.py        # clarify (ask user questions)
│   ├── todo_tool.py           # todo (task management)
│   └── kanban_tools.py        # kanban (boards/columns)
├── skills/                # Built-in skills (16 categories, 100+ skills)
│   ├── autonomous-ai-agents/  # codex, claude-code, opencode, hermes-agent
│   ├── software-development/  # TDD, debugging, code review, plan
│   ├── github/                # PR workflow, issues, code review
│   ├── creative/              # ascii-art, architecture-diagram, comfyui
│   ├── productivity/          # xlsx, docx, pdf, powerpoint, notion
│   └── research/              # arxiv, polymarket, blogwatcher
├── gateway/               # Multi-platform messaging gateway
├── providers/             # Provider-specific adapters (20+ providers)
├── hermes_cli/            # CLI framework
├── web/                   # React dashboard (Vite + TypeScript)
├── ui-tui/                # Terminal UI (Ink)
└── apps/                  # Platform apps (Electron desktop, etc.)
```

### 1.2 Pola Arsitektur Kunci

#### A. Conversation Loop (`conversation_loop.py` — 413KB)

Ini adalah jantung Hermes Agent. Satu fungsi `run_conversation()` yang menggerakkan seluruh agent turn:

```
USER MESSAGE
  → Build turn context (system prompt + memory + skills + messages)
  → Call model (provider-agnostic via chat_completion_helpers)
  → Parse response (text, tool calls, reasoning)
  → IF tool calls:
      → Execute tools (parallel/concurrent via ThreadPoolExecutor)
      → Append tool results to messages
      → Loop back to model call (max 90 iterations)
  → IF text response:
      → Finalize turn (save to session DB, update memory)
      → Return to user
```

**Fitur penting:**
- **Auto-continuation**: Jika respons terpotong (finish_reason="length"), otomatis lanjutkan
- **Error recovery**: Klasifikasi error (rate limit, context overflow, auth) → retry/fallback
- **Interrupt handling**: User bisa interrupt mid-generation
- **Reasoning scrubbing**: Chain-of-thought tidak pernah masuk transcript replay
- **Streaming**: Delta callback real-time untuk UI
- **Compaction gate**: Cek context length sebelum setiap API call

#### B. System Prompt — Tiga Tier (`system_prompt.py`)

```
STABLE TIER (cross-session):
  - SOUL.md identity atau DEFAULT_AGENT_IDENTITY
  - Tool guidance, platform hints, coding guidance
  
CONTEXT TIER (session-stable):
  - AGENTS.md / CLAUDE.md / .cursorrules dari project
  - Workspace snapshot
  
VOLATILE TIER (per-turn rebuild):
  - Skills index (deskripsi pendek semua skill)
  - Memory snapshot (fakta durable)
  - USER.md profile
  - Timestamp / session / model info
```

Ini memungkinkan prompt caching tetap hangat — stable + context jarang berubah.

#### C. Skill System (`skills/` + `tools/skills_tool.py` + `tools/skill_manager_tool.py`)

Skill adalah file Markdown dengan YAML frontmatter yang berisi prosedur. Agent:
1. **Load**: Membaca skills index setiap turn (volatile tier)
2. **Use**: `skill_view(name)` untuk load full content
3. **Create**: `skill_manage(action='create')` setelah task kompleks selesai
4. **Patch**: `skill_manage(action='patch')` saat skill outdated

Skills auto-discover dari `~/.hermes/skills/` — recursive directory scanning.

**Skill Safety Rule** (unik untuk Hermes):
- `[SKILL_PRUNED]` — konten hilang karena kompresi
- Auto-reload kalau pruned
- Dedup marker

#### D. Persistent Memory (`memory_manager.py` + `tools/memory_tool.py`)

Memory disimpan di SQLite (`state.db`) dengan:
- **Dua target**: `user` (profil pengguna) dan `memory` (catatan agent)
- **Char limit**: ~2,200 karakter per store
- **Operasi CRUD**: add, replace, remove (batch atomic)
- **Auto-inject**: Memory diinjeksi ke system prompt setiap turn

Aturan ketat:
- ❌ Jangan simpan task progress / PR number / commit SHA
- ✅ Simpan preferensi user, environment, konvensi, pelajaran

#### E. Session Search (`session_search_tool.py`)

FTS5-backed search di SQLite session database:
- **Discovery**: `session_search(query="auth refactor")` → top N sessions
- **Scroll**: `session_search(session_id=..., around_message_id=...)` → window
- **Browse**: `session_search()` → recent sessions
- **Bookends**: Setiap hasil discovery menyertakan 3 pesan awal + 3 pesan akhir

#### F. Context Compression (`context_compressor.py` — 342KB)

Fitur paling canggih:
- **Deteksi threshold**: Monitor token usage sebelum API call
- **Automatic compaction**: Ringkas conversation history saat mendekati limit
- **Iterative summary**: Update summary yang sudah ada (bukan buat baru)
- **Micro-compaction**: Rolling summary untuk long-running sessions
- **258K token limit**: Konfigurable per profil

#### G. Provider Abstraction (`chat_completion_helpers.py` — 217KB)

Satu interface untuk 20+ provider:
- OpenAI, Anthropic, Google, DeepSeek, xAI, OpenRouter, Groq, Cerebras, dll
- **Credential pool**: Rotasi multiple API keys
- **Fallback chain**: Model A → Model B kalau gagal
- **Streaming**: Unified SSE consumer
- **Tool calling**: Konversi otomatis tool schema antar provider

#### H. Multi-Agent Orchestration (`delegate_tool.py` — 172KB)

- **delegate_task**: Spawn subagent untuk task paralel
- **Batch mode**: Hingga 3 subagent concurrent
- **Live transcript**: Real-time log setiap subagent
- **Orchestrator role**: Subagent bisa spawn subagent lagi
- **Isolated context**: Setiap subagent punya session sendiri

---

## 2. PAAX Command Room — Kondisi Saat Ini

### 2.1 Apa yang Sudah Ada

| Komponen | Status | Catatan |
|----------|--------|---------|
| Chat UI | ✅ | React component `command-room-ui.ts` |
| Model routing | ✅ | 3 model: Lucent (DS V4 Pro), Arete (Qwen3.7+), Noir (Claude Sonnet 5) |
| Streaming SSE | ✅ | Delta content + reasoning (Noir only) |
| Tool calling | ✅ | Fase 0: query_rab, query_schedule, lookup_ahsp, run_scenario |
| Provider abstraction | ⚠️ Partial | 4 jalur: OpenRouter, DeepSeek native, DashScope, Anthropic |
| Chat history | ✅ | `chat-history.ts` — localStorage persistence |
| Activity timeline | ✅ | `activity-timeline.ts` — step visualization |
| Project context | ✅ | `project-context.ts` — RAB/schedule injection |
| Evidence gate | ✅ | `claim-pipeline.ts` — verify claims sebelum jawab |
| Memory runtime | ✅ | `memory-runtime.ts` — summary persistence |

### 2.2 Apa yang BELUM Ada (Gap Analysis)

| Fitur Hermes | PAAX Status | Prioritas |
|-------------|-------------|-----------|
| **Skill System** | ❌ Tidak ada | 🔴 KRITIS |
| **Persistent Memory** | ❌ localStorage only (bukan SQLite) | 🔴 KRITIS |
| **Session Search** | ❌ Tidak bisa recall percakapan lama | 🔴 KRITIS |
| **Context Compression** | ❌ Tidak ada; maxDuration 600s | 🟡 TINGGI |
| **Multi-Provider Pool** | ❌ Satu key per provider | 🟡 TINGGI |
| **Credential Rotation** | ❌ Tidak ada | 🟢 MEDIUM |
| **Profile/Persona System** | ❌ Tidak ada | 🟢 MEDIUM |
| **Webhook/Cron** | ❌ Tidak ada | 🟢 MEDIUM |
| **Multi-Agent Delegation** | ❌ Tidak ada (external IRIS only) | 🟢 MEDIUM |
| **Browser Tools** | ❌ Tidak ada | 🔵 RENDAH |
| **File Operations** | ❌ Via terminal only | 🔵 RENDAH |

---

## 3. Rencana Implementasi — Fase Bertahap

### Fase 1: Fondasi — Skill + Memory + Session Search (2-3 minggu)

Ini adalah **tiga pilar utama** yang membedakan Hermes Agent dari chatbot biasa.

#### 3.1 Skill System (PAAX Skill Vault)

**Konsep dari Hermes:**
- File Markdown dengan YAML frontmatter
- Disimpan di filesystem, recursive scan
- Auto-inject ke system prompt sebagai index
- Self-improving: agent belajar dan simpan prosedur

**Implementasi untuk PAAX:**

```
paax-skills/
├── sipil/              # Konstruksi & Teknik Sipil
│   ├── rab-konstruksi.md
│   ├── schedule-analysis.md
│   └── quantity-takeoff.md
├── ai/                 # AI & Development
│   ├── code-review.md
│   ├── debugging.md
│   └── code-generation.md
├── gambar-kerja/       # Drawing Intelligence
│   ├── ekstraksi-denah.md
│   ├── klasifikasi-elemen.md
│   └── validasi-dimensi.md
└── produktivitas/      # Productivity tools
    ├── laporan-xlsx.md
    ├── presentasi.md
    └── dokumentasi.md
```

**Komponen baru:**
1. `apps/web/src/lib/skills/skill-loader.ts` — Baca + parse skill MD files
2. `apps/web/src/lib/skills/skill-injector.ts` — Inject skill index ke system prompt
3. `apps/web/src/app/api/command-room/skills/route.ts` — API untuk skill_view, skills_list
4. `apps/web/src/lib/skills/skill-manager.ts` — Create/patch/delete skills

**Nama rebrand:**
- "Skill" → **"Blueprint"** (Cetak Biru) — lebih relevan dengan konstruksi
- `skill_view` → `blueprint_view`
- `skill_manage` → `blueprint_manage`
- `skills_list` → `blueprints_list`

#### 3.2 Persistent Memory (PAAX Knowledge Base)

**Konsep dari Hermes:**
- SQLite + FTS5 untuk search
- Dua target: user profile + agent knowledge
- Batas karakter, operasi batch atomic
- Injeksi otomatis ke system prompt

**Implementasi untuk PAAX:**

```sql
-- Schema di SQLite (via better-sqlite3 atau libsql)
CREATE TABLE paax_memory (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL CHECK(target IN ('user', 'knowledge')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE paax_memory_fts USING fts5(
  target, content, content=paax_memory
);
```

**Komponen baru:**
1. `services/knowledge-base/` — Service Python baru (FastAPI)
2. `apps/web/src/lib/knowledge/knowledge-client.ts` — Client TypeScript
3. `apps/web/src/app/api/command-room/knowledge/route.ts` — API proxy
4. Memory injection ke system prompt di `route.ts`

**Nama rebrand:**
- "Memory" → **"Knowledge Base"** / **"Pengetahuan"**
- `memory` tool → `pengetahuan` tool
- Target: `user` → `profil`, `memory` → `pengetahuan`

#### 3.3 Session Search (PAAX Conversation Archive)

**Konsep dari Hermes:**
- FTS5 search di SQLite session DB
- Tiga mode: discovery, scroll, browse
- Bookends (awal + akhir sesi)
- Window-based navigation

**Implementasi untuk PAAX:**

Saat ini PAAX menyimpan chat history di localStorage. Perlu migrasi ke:

1. Backend persistence: Simpan semua percakapan ke SQLite/PostgreSQL
2. FTS5 indexing untuk full-text search
3. API endpoint untuk search + retrieve

**Komponen baru:**
1. `services/conversation-archive/` — Service untuk session persistence
2. `apps/web/src/lib/archive/archive-client.ts` — Client
3. `apps/web/src/app/api/command-room/archive/route.ts` — API

**Nama rebrand:**
- "Session Search" → **"Arsip Percakapan"** / **"Riwayat"**
- `session_search` → `cari_riwayat`

---

### Fase 2: Advanced Intelligence (2-3 minggu)

#### 3.4 Context Compression (PAAX Context Guard)

**Konsep dari Hermes:**
- Monitor token count sebelum API call
- Auto-compress saat melebihi threshold
- Iterative summary update
- Micro-compaction untuk long-running sessions

**Implementasi untuk PAAX:**
1. Token counter (tiktoken untuk OpenAI, custom untuk DeepSeek)
2. Compression trigger di `route.ts` sebelum kirim ke model
3. Summary generation menggunakan model kecil (DS V4 Flash)
4. Compressed context injection ke messages

**Nama rebrand:**
- "Context Compression" → **"Kontekstual Ringkas"** / **"Pemadatan Konteks"**

#### 3.5 Multi-Provider Pool (PAAX Provider Mesh)

**Konsep dari Hermes:**
- Rotasi multiple API keys
- Fallback chain: Model A → Model B
- Provider health check
- Rate limit awareness

**Implementasi untuk PAAX:**
1. Provider pool manager — load balance antar key
2. Health check endpoint — probe sebelum dispatch
3. Fallback logic — kalau provider A down, coba provider B

**Nama rebrand:**
- "Credential Pool" → **"Provider Mesh"** / **"Jaringan Penyedia"**

---

### Fase 3: Autonomi & Orchestration (3-4 minggu)

#### 3.6 Multi-Agent Delegation (PAAX Task Force)

**Konsep dari Hermes:**
- `delegate_task` — spawn subagent untuk task paralel
- Batch mode — hingga 3 concurrent
- Live transcript — real-time monitoring
- Isolated context per subagent

**Implementasi untuk PAAX:**
Ini sudah partially ada via IRIS + ORION workers di PAAX Mission Control. Tapi perlu di-bawa ke Command Room:

1. `apps/web/src/app/api/command-room/delegate/route.ts` — API delegation
2. Subagent runner — spawn worker untuk query RAB, analisis schedule, dll
3. Result aggregator — kumpulkan hasil parallel workers

**Nama rebrand:**
- "delegate_task" → **"pasukan_tugas"** / **"tim_kerja"**

#### 3.7 Profile/Persona System (PAAX Persona)

**Konsep dari Hermes:**
- Multiple profiles dengan isolated config
- Setiap profile punya skills, memory, sessions sendiri
- Bisa switch profile mid-session

**Implementasi untuk PAAX:**
1. Persona definitions: Estimator, PM, Inspector, Drafter
2. Per-persona system prompt
3. Per-persona tool access
4. UI selector di Command Room

**Nama rebrand:**
- "Profile" → **"Persona"** / **"Peran"**

---

### Fase 4: Platform & Integrasi (4-6 minggu)

#### 3.8 Gateway + Multi-Platform (PAAX Connect)

**Konsep dari Hermes:**
- Gateway untuk Telegram, Discord, Slack, WhatsApp, dll
- Satu agent core, banyak channel
- Message routing + delivery

#### 3.9 Cron + Scheduling (PAAX Scheduler)

**Konsep dari Hermes:**
- `cronjob` tool — scheduled tasks
- Recurring: daily briefing, weekly report
- One-shot: reminder, delayed task

#### 3.10 Browser + File Tools

Already mostly available via terminal tapi bisa dibuat first-class.

---

## 4. Perbandingan Komponen: Hermes vs PAAX Target

| Layer | Hermes Agent | PAAX Command Room (Target) | Nama PAAX |
|-------|-------------|---------------------------|-----------|
| **Agent Core** | `run_agent.py` (Python) | `route.ts` (TypeScript/Next.js) | Tetap route.ts |
| **Conversation Loop** | `conversation_loop.py` | Enhanced `route.ts` + tool loop | - |
| **System Prompt** | `system_prompt.py` (3 tiers) | `context.ts` + `systemPrompt()` | - |
| **Skill System** | `skills/` + `skills_tool.py` | `blueprints/` + Blueprint API | **Blueprint** |
| **Memory** | `memory_manager.py` + SQLite | Knowledge Base Service | **Pengetahuan** |
| **Session Search** | `session_search_tool.py` + FTS5 | Archive Service + FTS5 | **Arsip** |
| **Tool Registry** | `tools/registry.py` | `@paax/ai-orchestrator/tools` | Tetap |
| **Provider** | `chat_completion_helpers.py` | `route.ts` stream functions | - |
| **Compression** | `context_compressor.py` | Context Guard middleware | **Ringkas** |
| **Delegation** | `delegate_tool.py` | Task Force API | **Pasukan** |
| **Profiles** | `profiles/` directory | Persona definitions | **Persona** |
| **Cron** | `cronjob_tools.py` | Scheduler service | **Penjadwal** |
| **Gateway** | `gateway/` | PAAX Connect | **Konektor** |

---

## 5. Strategi Rebranding & Kepatuhan Lisensi

### 5.1 Prinsip

1. **Lisensi MIT** = bebas digunakan, dimodifikasi, didistribusikan, termasuk commercial use
2. **Nama HARUS berbeda** — sesuai permintaan Owner
3. **Konsep + arsitektur yang diambil, bukan copy-paste kode**
4. **Attribution**: Cantumkan "Inspired by Hermes Agent (Nous Research)" di NOTICES

### 5.2 Pemetaan Nama

| Hermes Original | PAAX Rebrand | Alasan |
|----------------|-------------|--------|
| Hermes Agent | PAAX Command Center | Platform name |
| Skill | **Blueprint** | Cetak biru = konstruksi |
| Memory | **Pengetahuan** | Knowledge = fondasi |
| Session Search | **Arsip** | Archive = dokumentasi |
| SOUL.md | **INTI.md** | Inti = core identity |
| AGENTS.md | Tetap AGENTS.md | Standard convention |
| delegate_task | **pasukan_tugas** | Task force |
| cronjob | **penjadwal** | Scheduler |
| tool | **alat** | Tool dalam bhs Indonesia |
| profile | **persona** | Role-based |

### 5.3 File NOTICES

Semua referensi ke Hermes Agent harus dicantumkan:

```
PAAX Command Center — Powered by concepts from Hermes Agent
Copyright (c) 2025 Nous Research
Licensed under MIT License — https://github.com/NousResearch/hermes-agent
```

---

## 6. Arsitektur Target — PAAX Command Center

### 6.1 Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   PAAX Command Center                        │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React)                                           │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────────────┐  │
│  │  Chat   │ │ Blueprint│ │ Arsip  │ │ Persona Selector │  │
│  │  Panel  │ │  Panel   │ │ Panel  │ │                  │  │
│  └────┬────┘ └────┬─────┘ └───┬────┘ └────────┬─────────┘  │
├───────┼──────────┼────────────┼───────────────┼────────────┤
│  API Layer (Next.js Route Handlers)                         │
│  ┌────┴──────────┴────────────┴───────────────┴──────────┐ │
│  │           /api/command-center/chat                      │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │ │
│  │  │ Provider │ │ Context  │ │  Tool  │ │ Blueprint   │  │ │
│  │  │  Mesh    │ │  Guard   │ │  Loop  │ │ Injector    │  │ │
│  │  └──────────┘ └──────────┘ └────────┘ └────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │        /api/command-center/blueprints                   │ │
│  │        /api/command-center/pengetahuan                   │ │
│  │        /api/command-center/arsip                         │ │
│  │        /api/command-center/pasukan                       │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Services Layer (Python FastAPI)                             │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │ Pengeta- │ │    Arsip     │ │    Pasukan (Worker)  │    │
│  │  huan    │ │  (FTS5+SQL)  │ │                      │    │
│  └──────────┘ └──────────────┘ └──────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │ SQLite   │ │   FTS5       │ │  File System         │    │
│  │ state.db │ │   Index      │ │  blueprints/         │    │
│  └──────────┘ └──────────────┘ └──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Data Flow — Satu Turn Chat

```
User Message
  │
  ├─→ Context Guard: Cek token count → compress if needed
  │
  ├─→ Blueprint Injector: Load blueprint index → inject ke system prompt
  │
  ├─→ Pengetahuan Injector: Load knowledge entries → inject ke system prompt
  │
  ├─→ System Prompt Assembly (3 tiers):
  │     Stable:  INTI.md identity + tool guidance
  │     Context: Project files + AGENTS.md
  │     Volatile: Blueprint index + Knowledge + Session info
  │
  ├─→ Provider Mesh: Select optimal provider/key
  │
  ├─→ Model Call (streaming)
  │     │
  │     ├─→ IF text response → stream to UI
  │     │
  │     └─→ IF tool calls → execute tools → append results → loop
  │
  ├─→ Post-Turn:
  │     ├─→ Save to Arsip (session DB)
  │     ├─→ Update Pengetahuan (if new facts learned)
  │     └─→ Offer to create Blueprint (if complex task completed)
  │
  └─→ Return to UI
```

---

## 7. Timeline & Milestone

| Milestone | Fase | Fitur Utama | Estimasi |
|-----------|------|------------|----------|
| M1 | Fase 1a | Blueprint System (skill loader + API) | 1 minggu |
| M2 | Fase 1b | Pengetahuan (SQLite + FTS5 + API) | 1 minggu |
| M3 | Fase 1c | Arsip (session persistence + search) | 1 minggu |
| M4 | Fase 2a | Context Guard (token counting + compression) | 1 minggu |
| M5 | Fase 2b | Provider Mesh (pool + health check + fallback) | 1 minggu |
| M6 | Fase 2c | Blueprint self-improvement loop | 1 minggu |
| M7 | Fase 3a | Pasukan (delegation API) | 2 minggu |
| M8 | Fase 3b | Persona System | 1 minggu |
| M9 | Fase 4a | PAAX Connect (gateway) | 2 minggu |
| M10 | Fase 4b | Penjadwal (cron) | 2 minggu |

**Total: ~14-16 minggu untuk implementasi penuh**

---

## 8. Risiko & Mitigasi

| Risiko | Level | Mitigasi |
|--------|-------|----------|
| Kompleksitas SQLite di Next.js | 🔴 HIGH | Gunakan service Python terpisah (FastAPI) |
| Token overhead dari blueprint injection | 🟡 MEDIUM | Hard-cap di 500 karakter untuk index; full content on-demand |
| Konflik dengan IRIS orchestration | 🟡 MEDIUM | Command Center independen dari Mission Control |
| Perubahan API model yang dipakai | 🟢 LOW | Provider abstraction sudah flexibel |
| Migration dari localStorage ke SQLite | 🟡 MEDIUM | Dual-write selama transisi |

---

## 9. Rekomendasi & Next Steps

1. **Mulai dari Fase 1a (Blueprint System)** — paling cepat memberikan nilai tambah dan paling rendah risiko
2. **Gunakan Python FastAPI untuk service backend** — konsisten dengan stack PAAX yang sudah ada (`services/`)
3. **Pisahkan dari IRIS/Mission Control** — Command Center adalah produk terpisah
4. **Jangan rewrite `route.ts` yang sudah ada** — tambahkan layer di atasnya
5. **Gunakan SQLite (bukan PostgreSQL)** untuk portabilitas — pattern Hermes Agent
6. **Simpan blueprint di filesystem** (bukan DB) — agar mudah diedit manual
7. **Commit per-fase** — jangan big-bang

---

## 10. Kesimpulan

Hermes Agent menyediakan **reference implementation terbaik** untuk AI agent yang self-improving. Arsitekturnya yang modular, provider-agnostic, dengan skill system + persistent memory + session search, bisa diaplikasikan hampir sepenuhnya ke PAAX Command Room.

Dengan rebranding yang tepat (Blueprint, Pengetahuan, Arsip, Pasukan, Persona), PAAX Command Center bisa menjadi **AI assistant konstruksi paling canggih** — bukan hanya chatbot yang menjawab pertanyaan, tapi agent yang **belajar dari pengalaman** dan **mengingat pengetahuan** lintas sesi.

**Kunci sukses:** Adaptasi arsitektur + konsep, bukan copy-paste. Bangun di atas fondasi yang sudah ada. Fase bertahap untuk mengurangi risiko.

---

> **Status:** ANALISIS SELESAI — Menunggu approval Owner untuk memulai Fase 1  
> **File project:** `G:\paax-ai-main\08_delivery\ANALISIS_HERMES_AGENT_KE_COMMAND_ROOM_PAAX.md`
