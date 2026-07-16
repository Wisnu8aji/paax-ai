# PLAN — PAAX Command Room Intelligence & Skill Architecture

**Status:** rencana, belum dieksekusi.
**Asal:** `G:\Skill\Blueprint skill.txt` (blueprint v1.0, 20 bagian, sudah matang secara konsep) +
riset ulang terhadap kondisi nyata repo `paax-ai-main` per 2026-07-12.
**Tujuan dokumen ini:** menyesuaikan blueprint terhadap apa yang **benar-benar ada di kode**
sekarang, menandai gap, dan menyusun urutan implementasi yang bisa benar-benar dikerjakan
(bukan cuma indah di atas kertas). Bukan implementasi — hanya rencana.

---

## 0. Ringkasan eksekutif

Blueprint asli (lihat §1-20 di sana) sudah benar secara arsitektur: pemisahan
Intelligence Runtime / Memory / Tool-MCP / Artifact Production / Skill Control Plane,
plan berjenjang (Direct → Compact → Structured → Controlled), Evidence Gate yang
menegakkan Aturan Emas (`CLAUDE.md` §1 — AI tidak pernah menghitung), dan Memory
Distiller yang membedakan raw/summarized/durable/graph layer. Saya **tidak mengubah
prinsip-prinsip itu** — itu solid dan sudah sejalan dengan aturan proyek ini.

Yang saya ubah/tambahkan setelah membaca kode nyata:

1. **Gap arsitektur yang blueprint tidak sadari**: `services/ai-orchestrator`
   (tool-calling loop lengkap, 7 tools, SSE, audit log — dibangun untuk R7) **tidak
   pernah dipanggil dari `apps/web`**. Nol referensi. Command Room yang user pakai
   sekarang (`app/api/command-room/chat/route.ts`) adalah *pure streaming proxy* ke
   Lucent/Arete/Noir — tanpa tool call sama sekali. Blueprint mengasumsikan "Tool and
   MCP Layer" sudah tersambung ke runtime; kenyataannya perlu disambungkan dulu
   sebelum satu skill pun bisa memanggil tool sungguhan.
2. **Skala layanan diperkecil**: blueprint §17 mengusulkan 9 service backend baru
   (`skill-registry`, `memory-engine`, `graph-indexer`, `graph-query-gateway`,
   `tool-gateway`, `artifact-engine`, `skill-evaluator`, ditambah yang sudah ada).
   Untuk tim solo/kecil, ini terlalu besar sebagai langkah pertama. Saya petakan
   fase-fase awal supaya **sebagian besar "skill runtime" terwujud sebagai system-prompt
   sections + tool registry di dalam service yang sudah ada** (`ai-orchestrator`),
   bukan service baru — service baru baru masuk akal setelah pola pemakaian jelas.
3. **Skill Claude Code (folder `.claude/skills/`) vs "skill runtime PAAX" adalah dua
   hal berbeda** yang blueprint mencampur istilahnya. Saya pisahkan eksplisit di §2.
4. Struktur folder & fase implementasi ditulis ulang di §7-§9 supaya cocok dengan
   monorepo nyata (`apps/web`, `services/*`, `packages/*`) yang sudah ada, bukan
   struktur `packages/ai-skills/` yang diusulkan blueprint dari nol.

Blueprint asli tetap jadi rujukan detail (Intent Frame, Context Pack, Execution Plan
schema, dsb — semua di §16 blueprint sudah baik dan saya pakai apa adanya). Dokumen
ini fokus ke **apa yang beda dan kenapa**, plus urutan eksekusi.

---

## 1. Dua sistem yang harus dipisahkan secara sadar

Ini bukan poin baru dari blueprint, tapi perlu ditegaskan di awal karena seluruh
plan bergantung padanya (blueprint §2 sudah menyinggung, saya perjelas):

### 1.1 Skill Claude Code — `.claude/skills/*/SKILL.md`
Ini adalah mekanisme **Claude Code sendiri** (yang sedang menjalankan sesi ini),
dipakai untuk pekerjaan *engineering* di repo: `/graphify`, `/code-review`, dan
kandidat baru dari plan ini (`paax-skill-forge`, `paax-connector-foundry` — lihat
§6.2). Konsumennya adalah **developer/owner** yang bekerja lewat Claude Code CLI.
Progressive disclosure-nya (metadata → body → references) persis seperti dijelaskan
`skill-creator/SKILL.md` yang sudah ada di `G:\Skill\skill-creator.zip` (sudah saya
baca — workflownya: draft → eval → review → iterate → package).

### 1.2 Skill Runtime PAAX — bagian dari Command Room, dipakai end-user
Ini adalah **konsep** dari blueprint §6-§8: Capability Router, Intent Architect,
Task Planner, dst. Ini **bukan** file `SKILL.md` yang dibaca Claude Code — ini logika
yang berjalan **di dalam `services/ai-orchestrator`** (system prompt sections,
tool registry entries, routing rules dalam TypeScript) setiap kali user PAAX
mengetik sesuatu di Command Room. Konsumennya adalah **insinyur sipil pengguna
PAAX**, bukan developer.

Blueprint memberi nama `paax-capability-router`, `paax-intent-architect`, dst
seolah-olah itu skill folder — saya pertahankan penamaan itu (bagus, konsisten,
mudah dirujuk) tapi mereka **diwujudkan sebagai modul TypeScript**, bukan `SKILL.md`.
Hanya dua yang benar-benar jadi skill Claude Code: `paax-skill-forge` dan
`paax-connector-foundry` (kerja developer, dijalankan lewat Claude Code — lihat §6.2).

**Kenapa ini penting ditulis eksplisit**: kalau nanti implementasi dimulai tanpa
pemisahan ini jelas, ada risiko orang mencoba menaruh logika runtime PAAX ke dalam
`.claude/skills/` (yang tidak akan pernah dibaca oleh Command Room production — itu
hanya dibaca sesi Claude Code lokal) — kesalahan kategori yang mahal untuk dibongkar
belakangan.

---

## 2. Temuan arsitektur nyata (dasar semua penyesuaian di bawah)

Dikonfirmasi lewat `graphify query`/`explain`/`path` + grep + baca kode langsung
(bukan asumsi):

| Yang blueprint asumsikan | Yang benar-benar ada di kode |
|---|---|
| "Tool and MCP Layer" sudah memberi akses ke Drawing Intelligence/RAB/BOQ/schedule dari runtime chat | `services/ai-orchestrator` (Express, port 8082) **punya** tool registry lengkap (`lookup_ahsp`, `run_scenario`, `analyze_drawing`, `query_rab`, `query_schedule`, `query_progress`, `query_materials`, `search_knowledge`) dan `runToolCallingLoop()` (Gemini tool-calling) — tapi **`apps/web` tidak pernah memanggilnya**. Nol import, nol fetch ke port 8082 dari `apps/web/src`. |
| Command Room chat route menjalankan skill routing | `app/api/command-room/chat/route.ts` murni: terima `{messages, modelAlias, reasoningEffort, thinking}` → stream langsung ke OpenRouter/DeepSeek/DashScope/Anthropic. Tidak ada Capability Router, Intent Architect, tool call, atau plan apa pun. Satu system prompt statis (`SYSTEM_PROMPT`, satu paragraf: "jawab pakai Bahasa Indonesia"). |
| Ada satu "AI runtime" yang koheren | **Dua implementasi paralel** sudah dicatat sebagai gap jujur di `docs/ai-map/STATE_CURRENT.md`: `lib/ai/orchestrator.ts` (dipakai di halaman per-proyek lama, `proyek/[projectId]/chat/` — pemanggil Gemini langsung) vs `route.ts` Command Room (Lucent/Arete/Noir). Logika mirip (payload, retry, timeout) tidak disatukan. |
| Memory Supabase sudah ada sebagai source of truth (blueprint §9.1) | Chat history Command Room sekarang **`localStorage`-based** (`apps/web/src/lib/chat/chat-history.ts` — `load()`/`save()` baca-tulis `localStorage`, bukan database). Tidak ada tabel `conversations`/`messages`/`durable_memories` di server. `services/db` (Postgres/Alembic, R6/R8) ada tapi untuk RAG AHSP pgvector, bukan chat memory. |
| Graphify sudah menjadi bagian runtime PAAX (blueprint §10) | Graphify sekarang murni **alat developer** (`.claude/skills/graphify/`, dipanggil manual/hook PreToolUse saat sesi Claude Code) — tidak ada jalur di mana Command Room production memanggil `graphify query` saat runtime. |
| Document production (docx/pdf/xlsx) sudah punya jalur artifact (blueprint §8) | Ada `excel_exporter.py` di core-engine (export RAB ke Excel via engine — ini **benar**, sesuai Aturan Emas: engine yang isi angka). Tidak ada `paax-docx-production`/`paax-pdf-production` apa pun; skill Anthropic aslinya (`docx.zip`, `pdf.zip`, `xlsx.zip`) ada di `G:\Skill` tapi belum diadaptasi/diintegrasikan ke repo ini sama sekali. |

**Implikasi langsung**: Fase 1 blueprint tidak boleh mulai dari "Capability Router"
seperti urutan §6.1 blueprint — harus mulai dari **menyambungkan pipa yang sudah ada
tapi terputus** (ai-orchestrator ↔ Command Room UI), karena tanpa itu, Capability
Router tidak punya apa-apa untuk dirutekan. Saya susun ulang urutan fase di §9.

---

## 3. Penyesuaian terhadap urutan blueprint §2

Blueprint sudah benar menolak urutan naif `Input → plan → Skill Creator → skill
lain → jawaban` (Skill Creator memang bukan skill harian — itu tepat, sesuai
`skill-creator/SKILL.md`: workflownya draft→eval→iterate, bukan penyelesaian tugas).
Urutan blueprint §2 (Capability Router → Intent Architect → Context Recall → Task
Planner → Domain/Artifact Skills → Plan Executor → Evidence Gate → Response
Synthesizer → Memory Distiller) saya **pertahankan utuh** sebagai urutan logis
per-pesan. Tidak ada perubahan di sini — ini bagian blueprint yang paling matang.

Yang saya tambahkan: **Run Preflight** (blueprint §4 sudah menyebutnya sebagai
langkah 1 di diagram alur tapi tidak dijabarkan sebagai skill/modul terpisah).
Saya jadikan eksplisit sebagai modul nol-risiko pertama yang harus ada sebelum
Capability Router: resolve `runId`/`conversationId`/`projectId` aktif, cek API key
provider tersedia (pola `resolveKeyForModel()` yang sudah ada di `route.ts` — pakai
ulang, jangan tulis ulang), cek file/attachment yang disertakan. Ini murni
"housekeeping" tapi tanpa ini Context Recall tidak tahu scope proyek mana yang aktif.

---

## 4. Daftar skill runtime PAAX — dengan status implementasi nyata

Format: nama blueprint dipertahankan, saya tambahkan kolom **Wujud** (modul TS di
mana) dan **Status** (ada/tidak ada di kode sekarang).

### 4.1 Intelligence Runtime (jalan tiap pesan)

| Nama | Wujud teknis | Status |
|---|---|---|
| Run Preflight | fungsi di `services/ai-orchestrator/src/routes/chat.ts` (baru) | tidak ada |
| `paax-capability-router` | modul baru `services/ai-orchestrator/src/router/capability-router.ts` | tidak ada |
| `paax-intent-architect` | modul baru `services/ai-orchestrator/src/router/intent-architect.ts` | tidak ada |
| `paax-context-recall` | modul baru, bergantung pada memory layer (§5) yang juga belum ada | tidak ada — **blocker: perlu §5 lebih dulu** |
| `paax-task-planner` | modul baru `services/ai-orchestrator/src/router/task-planner.ts` | tidak ada |
| `paax-plan-executor` | perluasan `runToolCallingLoop()` yang **sudah ada** di `gemini/tool-loop.ts` — ini kabar baik, fondasinya sudah ditulis, tinggal diberi struktur plan eksplisit | **sebagian ada** (tool loop generik ada, belum plan-aware) |
| `paax-evidence-gate` | modul baru, menegakkan Aturan Emas §1 CLAUDE.md secara terprogram | tidak ada — **ini yang paling wajib ada sebelum apa pun lain jalan di production**, karena tanpanya tidak ada penjamin bahwa model tidak "mengarang angka" |
| `paax-response-synthesizer` | modul baru, post-process sebelum SSE dikirim ke client | tidak ada |
| `paax-memory-distiller` | modul baru, bergantung pada memory layer (§5) | tidak ada |

### 4.2 Domain skills

| Nama | Sumber data nyata yang sudah ada | Status |
|---|---|---|
| `paax-project-context` | `apps/web/src/lib/projects/project-repository.ts`, `projects-context.tsx` | data ada, belum ada skill/tool yang expose ke chat |
| `paax-project-evidence-search` | belum ada full-text search lintas file proyek | tidak ada |
| `paax-drawing-intelligence-query` | `services/document-intelligence` (consolidate.py, TKG models) — data JSON-1/JSON-2 nyata ada | data ada, tidak ada tool chat yang query itu (tool `analyze_drawing` di ai-orchestrator ada tapi terputus dari UI — lihat §2) |
| `paax-cost-quantity-analysis` | `services/core-engine/app/rab/` (rab.py, models.py, sections.py) — RABResult nyata, dihitung engine | tool `query_rab`/`lookup_ahsp` **sudah ditulis** di ai-orchestrator, terputus dari UI |
| `paax-schedule-analysis` | `services/core-engine/app/rab/schedule.py` (CPM, `compute_cpm()`, `build_schedule_plan()`) — nyata, dihitung engine | tool `query_schedule` **sudah ditulis**, terputus dari UI |
| `paax-project-diagnostics` | — | tidak ada, tapi source datanya (RAB/schedule/drawing) semua sudah ada begitu §2 tersambung |
| `paax-decision-analysis` | — | tidak ada |
| `paax-document-composer` | — | tidak ada |

### 4.3 Document production

| Nama | Basis | Status |
|---|---|---|
| `paax-docx-production` | skill Anthropic `docx.zip` di `G:\Skill` (belum diadaptasi) | tidak ada di repo |
| `paax-pdf-production` | skill Anthropic `pdf.zip` | tidak ada di repo |
| `paax-xlsx-production` | skill Anthropic `xlsx.zip` **+** `services/core-engine/app/export/excel_exporter.py` yang **sudah nyata menghitung & export RAB ke Excel lewat engine** — ini fondasi paling matang di seluruh blueprint, tinggal disambung sebagai artifact tool | fondasi ada (excel_exporter.py), belum ada jalur dari chat |
| `paax-artifact-quality-control` | — | tidak ada |

### 4.4 Skill Control Plane (ini yang jadi skill Claude Code sungguhan — lihat §1.1)

| Nama | Wujud | Status |
|---|---|---|
| `paax-skill-forge` | `.claude/skills/paax-skill-forge/SKILL.md`, adaptasi dari `skill-creator` (`G:\Skill\skill-creator.zip` — sudah dibaca, workflow lengkap: capture intent → draft → eval → grade → package) | belum dibuat |
| `paax-connector-foundry` | `.claude/skills/paax-connector-foundry/SKILL.md`, adaptasi dari `mcp-builder` (`G:\Skill\mcp-builder.zip` — sudah dibaca, 4 fase: research → implement → review → eval) | belum dibuat |

---

## 5. Memory architecture — penyesuaian blueprint §9

Blueprint §9.1 mengasumsikan Supabase sudah jadi source of truth dengan 4 layer
(raw/summarized/durable/graph mapping). **Tidak ada Supabase di repo ini** — yang
ada `services/db` (Postgres via Alembic, dipakai untuk RAG AHSP pgvector, R6/R8) dan
chat history yang sekarang **100% localStorage di browser** (`chat-history.ts`).

Ini gap paling besar dari seluruh blueprint karena §9 adalah fondasi buat
`paax-context-recall` dan `paax-memory-distiller` — dan keduanya tidak bisa jalan
tanpa storage server-side. LocalStorage:
- tidak bisa di-query lintas device/sesi;
- tidak bisa dibaca oleh `services/ai-orchestrator` (beda proses, beda mesin bahkan);
- hilang kalau user clear browser data.

**Penyesuaian**: saya pertahankan 4-layer model blueprint §9.1 (raw/summarized/
durable/graph mapping) dan seluruh skema provenance §9.5 — itu desain yang benar.
Yang saya ubah adalah **substrate-nya**: pakai `services/db` yang sudah ada
(Postgres + Alembic sudah terpasang, tinggal tambah tabel) bukan Supabase baru.
Ini juga selaras dengan §5 `CLAUDE.md` proyek — Codex yang mengerjakan wiring
skema/DB mekanis, Claude yang menulis spek tabelnya.

Tabel minimal yang dibutuhkan (skema Alembic baru di `services/db`):
```
conversations       (id, project_id, user_id, model_alias, created_at, archived, pinned)
messages             (id, conversation_id, role, content, created_at, sequence)
durable_memories     (id, scope, scope_ref_id, type, content, confidence, status,
                       source_type, source_id, supersedes, created_at)
memory_graph_map     (memory_id, graph_node_id, graph_version, indexed_at)
```

`scope` dan `type` persis enum yang sudah didefinisikan blueprint §9.2/§9.3 — tidak
diubah. Migrasi dari localStorage: `chat-history.ts` tetap dipertahankan sebagai
**local cache/offline fallback** (bukan dihapus — ini melanggar aturan "Command
Room tidak boleh dihapus" §6 CLAUDE.md kalau di luar konteks yang benar), tapi
source of truth dipindah ke `services/db` secara bertahap, sinkron dua arah dulu
sebelum localStorage jadi read-only cache.

Peran Graphify di §10 blueprint saya pertahankan konsepnya (raw conversation →
Memory Distiller → atomic durable memories → Graphify indexer → graph.json → MCP
query tools) — tapi ini eksplisit **fase lanjut** (§9 Fase 5 di bawah), bukan awal,
karena butuh durable memory layer nyata dulu sebagai input. Graph terpisah per
scope (`graphs/user/`, `graphs/projects/`, dst — blueprint §9 "Graph terpisah")
dipertahankan apa adanya.

---

## 6. Penyesuaian model orchestration (blueprint §14)

Tidak ada perubahan konseptual — routing "Direct/Compact → Lucent, Structured/
Complex → Arete, Critical/Audit → Noir" tetap masuk akal. Satu catatan teknis dari
kode nyata yang perlu diperhitungkan saat implementasi Task Planner memilih model:

`route.ts` sudah punya temuan empiris terdokumentasi (komentar `OPENROUTER_EFFORT_MAP`)
bahwa Noir (Claude Sonnet 5) via OpenRouter butuh effort mapping berbeda dari
Lucent/Arete (`high`→`xhigh` khusus utk Noir, bukan mapping generik) supaya
reasoning benar-benar terlihat aktif. **Task Planner harus mewarisi routing key ini
apa adanya** — jangan menulis ulang effort-mapping generik saat menambah layer
routing baru di atasnya, karena itu akan meregresi hasil probe langsung yang sudah
diverifikasi 2026-07-12.

---

## 7. Struktur folder — revisi dari blueprint §17

Blueprint §17 mengusulkan `packages/ai-skills/` dari nol + 9 service baru. Revisi
saya menaruh kode runtime **di dalam `services/ai-orchestrator` yang sudah ada**
selama fase awal (tidak butuh service baru untuk mulai), dan hanya
`.claude/skills/` yang baru untuk dua skill Claude Code (§4.4):

```
services/ai-orchestrator/src/
├── router/                        # BARU — Intelligence Runtime
│   ├── run-preflight.ts
│   ├── capability-router.ts
│   ├── intent-architect.ts
│   ├── context-recall.ts          # depends on memory/ (di bawah)
│   ├── task-planner.ts
│   ├── evidence-gate.ts
│   └── response-synthesizer.ts
├── memory/                        # BARU — Memory Distiller + akses services/db
│   ├── memory-distiller.ts
│   └── memory-store.ts            # client ke services/db tabel §5
├── tools/                         # SUDAH ADA — tinggal ditambah, bukan ditulis ulang
│   ├── registry.ts                # sudah ada, tambahkan tool baru di sini
│   ├── query_rab.ts               # sudah ada
│   ├── query_schedule.ts          # sudah ada
│   ├── analyze_drawing.ts         # sudah ada
│   ├── lookup_ahsp.ts             # sudah ada
│   ├── search_knowledge.ts        # sudah ada
│   ├── project_context.ts         # BARU — expose project-repository ke chat
│   └── artifact_xlsx.ts           # BARU — bridge ke excel_exporter.py (engine)
└── gemini/tool-loop.ts            # SUDAH ADA — jadi basis paax-plan-executor

apps/web/src/app/api/command-room/chat/route.ts
  → diubah agar memanggil services/ai-orchestrator (port 8082) alih-alih
    langsung stream ke provider — INI PERUBAHAN PALING KRITIS DAN PALING BERISIKO,
    lihat §8 "Titik risiko tertinggi"

.claude/skills/
├── paax-skill-forge/SKILL.md      # BARU — adaptasi skill-creator
├── paax-connector-foundry/SKILL.md # BARU — adaptasi mcp-builder
└── paax-command-room-intelligence/ # folder dokumen ini (plan, bukan skill aktif)
    └── PLAN.md
```

Service baru (`memory-engine`, `graph-indexer`, dll dari blueprint §17) hanya
dipertimbangkan **setelah** pola pemakaian di atas terbukti dan `services/db`
mulai terasa sesak menampung memory + RAG AHSP + chat history sekaligus — bukan
keputusan yang diambil di muka.

---

## 8. Titik risiko tertinggi — harus ditangani eksplisit, bukan diam-diam

1. **Mengalihkan `route.ts` dari direct-stream ke proxy-ke-orchestrator** adalah
   perubahan pada file yang dilindungi eksplisit (`CLAUDE.md` §6 — Command Room
   tidak boleh dihapus/dipindah tanpa bukti). Ini bukan "dihapus", tapi tetap
   berisiko tinggi karena Command Room "3 rewrite besar dalam 4 hari... belum
   dianggap stabil" (kutipan `STATE_CURRENT.md`). **Wajib**: fitur-flag/rollback
   path jelas (mis. `ORCHESTRATOR_ENABLED` env var, fallback ke direct-stream lama
   kalau proxy gagal), dan berjalan di branch terpisah dengan PR — sesuai gerbang
   review §5 `CLAUDE.md`. Jangan pernah langsung ganti tanpa jalur mundur.
2. **Evidence Gate harus ada SEBELUM tool-calling diaktifkan di production**, bukan
   sesudah. Begitu Command Room bisa memanggil `query_rab`/`run_scenario`, ada
   risiko nyata model mem-parafrase angka tool-result secara salah di response teks
   — Evidence Gate adalah satu-satunya penjamin numerik itu tetap dari engine
   (Aturan Emas §1 CLAUDE.md, non-negotiable, "Jika sebuah task akan membuat LLM
   ... menghitung angka final — STOP dan lapor ke pemilik repo").
3. **Migrasi memory dari localStorage ke `services/db`** harus dua-arah dulu
   (baca dari keduanya, tulis ke keduanya) sebelum localStorage jadi cache-only —
   kalau tidak, user yang sudah punya riwayat chat lokal kehilangan itu begitu
   server jadi source of truth.
4. **Dua implementasi AI paralel** (`lib/ai/orchestrator.ts` vs `route.ts`) — plan
   ini **tidak** mengusulkan konsolidasi keduanya (`STATE_CURRENT.md` sudah
   mencatat itu sebagai keputusan terpisah, bukan scope sesi ini). Tapi begitu
   `route.ts` mulai proxy ke `ai-orchestrator`, drift antara dua implementasi itu
   makin besar — perlu diputuskan pemilik repo kapan konsolidasi itu dikerjakan,
   idealnya sebelum atau bersamaan dengan Fase 2 di bawah, bukan dibiarkan makin jauh.

---

## 9. Roadmap fase — revisi dari blueprint §18

Blueprint §18 punya 10 fase yang urutannya logis tapi mengasumsikan pipa sudah
tersambung. Revisi saya menyisipkan langkah penyambungan yang hilang, dan
menandai dependency antar fase eksplisit.

### Fase 0 — Sambungkan pipa yang sudah ada (BARU, tidak ada di blueprint asli)
- `route.ts` memanggil `services/ai-orchestrator` (bukan stream langsung ke provider),
  dengan fitur-flag & rollback (lihat §8.1).
- Verifikasi 7 tools yang sudah ditulis (`registry.ts`) benar-benar bisa dipanggil
  end-to-end dari UI Command Room sungguhan, bukan cuma dari test.
- **Selesai ketika**: user bisa bertanya "berapa total RAB proyek ini" di Command
  Room dan jawabannya benar-benar lewat `query_rab` → core-engine, bukan dikarang
  model. Ini uji lakmus paling penting di seluruh roadmap.

### Fase 1 — Runtime contracts (sama seperti blueprint §18 Fase 1)
Intent Frame, Context Pack, Execution Plan, Skill Selection, Verification Report,
Memory Candidate — schema TypeScript persis seperti blueprint §16, ditaruh di
`services/ai-orchestrator/src/router/types.ts`.

### Fase 2 — Evidence Gate DULUAN, sebelum Capability Router
Blueprint §18 menaruh Evidence Gate di Fase 7 (mendekati akhir). Saya majukan ke
Fase 2 karena §8.2 di atas: begitu Fase 0 selesai dan tool-calling aktif di
production, tidak ada penjamin angka sebelum Evidence Gate ada. Lebih baik
Evidence Gate "primitif" (cek sederhana: apakah angka RAB/BOQ/HSP dalam response
punya tool-call source, tolak kalau tidak) hidup dari awal, disempurnakan
belakangan — daripada tool-calling jalan tanpa gate sama sekali selama berbulan-bulan.

### Fase 3 — Capability Router + Intent Architect + Task Planner
Sama seperti blueprint §18 Fase 2-3, digabung karena saling bergantung erat (router
butuh tahu skill apa yang dipilih Intent Architect untuk plan_depth-nya).

### Fase 4 — Memory layer di `services/db` + Memory Distiller
Prasyarat sebelum Context Recall bisa jalan (lihat dependency di §4.1). Termasuk
migrasi dua-arah localStorage (§8.3).

### Fase 5 — Context Recall + Graphify integration
Sama seperti blueprint §18 Fase 5, tapi sekarang punya fondasi nyata (Fase 4)
untuk diindeks — blueprint aslinya menaruh Graphify integration sebelum memory
layer jelas ada, urutan yang secara logis terbalik.

### Fase 6 — Domain skills tersisa + Plan Executor penuh
`paax-project-diagnostics`, `paax-decision-analysis`, `paax-document-composer`.
`paax-plan-executor` diperluas dari `runToolCallingLoop()` existing jadi plan-aware
(baca Execution Plan dari Fase 1, jalankan step berurutan/paralel sesuai dependency).

### Fase 7 — Document production
Urutan blueprint §18 Fase 8 dipertahankan (Composer → DOCX → XLSX → PDF → QC), tapi
**XLSX duluan secara de-facto** karena `excel_exporter.py` sudah paling matang
(§4.3) — DOCX/PDF mulai dari nol memakai `docx.zip`/`pdf.zip` di `G:\Skill` sebagai
rujukan adaptasi.

### Fase 8 — Skill Forge & Connector Foundry (skill Claude Code sungguhan)
Ini **bisa dikerjakan kapan saja secara independen** dari Fase 0-7 karena ini skill
developer (§1.1), bukan bagian runtime production. Saya taruh di akhir hanya karena
prioritas — kalau owner mau lebih cepat: adaptasi `skill-creator.zip`/`mcp-builder.zip`
jadi `.claude/skills/paax-skill-forge/` dan `.claude/skills/paax-connector-foundry/`
bisa mulai duluan tanpa menunggu apa pun di atas.

### Fase 9 — Observability & rollout
Sama seperti blueprint §18 Fase 10, dipertahankan apa adanya (internal test → shadow
mode → limited beta → opt-in → default).

---

## 10. Yang TIDAK berubah dari blueprint asli (referensi langsung ke sana)

Supaya dokumen ini tidak duplikasi isi yang sudah baik — bagian berikut di
`G:\Skill\Blueprint skill.txt` dipakai **apa adanya**, tidak direvisi:
- §5 Sistem plan proporsional (Level 0-3, Direct/Compact/Structured/Controlled)
- §6.2-6.8 definisi tugas & output internal tiap skill Intelligence Runtime
  (Intent Frame, Context Pack, dst — isinya, bukan wujud teknisnya yang direvisi di §4 atas)
- §9.2-9.5 scope memory, jenis node/relationship Graphify, provenance
- §11 MCP tool families & annotations (`readOnlyHint`, dst)
- §13 Progressive skill loading & skill-chain budget
- §15 Contoh workflow A-D
- §19 Benchmark keberhasilan (semua kategori metrik)

---

## 11. Pertanyaan terbuka untuk owner sebelum eksekusi dimulai

Plan ini sengaja berhenti di sini — tidak mengeksekusi apa pun sesuai instruksi.
Sebelum Fase 0 dimulai, ada 3 keputusan yang perlu pemilik repo pastikan (bukan
keputusan yang aman diambil sendiri oleh AI karena menyentuh arsitektur produksi
dan file yang dilindungi):

1. **Fitur-flag untuk `route.ts` → proxy ke ai-orchestrator**: nama env var, default
   on/off saat pertama deploy, siapa yang menguji jalur rollback sebelum dianggap aman.
2. **Substrate memory** (§5): konfirmasi `services/db` (Postgres existing) yang
   dipakai, bukan menambah Supabase/DB baru — ini mengubah beban service yang
   sudah menampung RAG AHSP.
3. **Urutan Fase 7 vs Fase 8**: apakah document production (XLSX/DOCX/PDF) atau
   Skill Forge/Connector Foundry (tooling developer) yang lebih prioritas duluan —
   keduanya independen satu sama lain jadi urutannya murni pilihan, bukan teknis.
