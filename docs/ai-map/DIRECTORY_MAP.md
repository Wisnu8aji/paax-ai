# PAAX Command Room Worker — Directory Map

Peta ini adalah daftar lokasi kanonik Phase 1 untuk runtime agent Command Room.
Status `ADA` berarti file sudah ada dan tidak boleh diubah oleh Phase 1;
`ADA-PARSIAL` berarti boundary existing dipakai tetapi target konsolidasi belum
selesai; `BARU` berarti file/direktori ditambahkan sebagai scaffolding kosong.

## Legenda dan prinsip lokasi

| Status | Arti |
| --- | --- |
| ADA | Existing dan dipertahankan; Phase 1 tidak mengeditnya |
| ADA-PARSIAL | Existing tetapi belum menjadi boundary kanonik; migrasi dilakukan phase berikutnya |
| BARU | Dibuat Phase 1 sebagai README, barrel kosong, atau stub `export {}` |
| FUTURE | Target arsitektur, tidak dibuat Phase 1 |

Runtime agent penuh tinggal di `services/ai-orchestrator/src/`. `apps/web`
tetap surface + gateway Next.js, `packages/schemas` tetap kontrak bersama, dan
root `agent/` tetap direktori markdown instruksi. Root `agent/` tidak di-rename
menjadi `agent-instructions/` pada phase ini.

## Pohon target Phase 1

```text
services/ai-orchestrator/
├── package.json                         ADA — sumber versi worker 0.1.0
├── src/
│   ├── agent/                            BARU — runtime + loop Hermes
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── runtime.ts                    BARU — stub Phase 2
│   │   ├── conversation-loop.ts         BARU — stub Phase 3
│   │   ├── turn-context.ts               BARU — stub Phase 3
│   │   ├── prompt-builder.ts             BARU — stub Phase 2
│   │   ├── system-prompt.ts              BARU — stub Phase 2
│   │   ├── context-files.ts              BARU — stub Phase 5
│   │   ├── tool-executor.ts              BARU — stub Phase 3
│   │   ├── turn-finalizer.ts             BARU — stub Phase 4
│   │   ├── iteration-budget.ts           BARU — stub Phase 3
│   │   ├── tool-guardrails.ts            BARU — stub Phase 5
│   │   ├── context-engine.ts             BARU — stub Phase 6
│   │   ├── context-compressor.ts         BARU — stub Phase 6
│   │   ├── memory-manager.ts             BARU — stub Phase 6
│   │   └── subagent-lifecycle.ts         BARU — stub Phase 6
│   ├── gateway/                          BARU — gateway/session/streaming
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── run.ts                        BARU — stub Phase 2
│   │   ├── session.ts                    BARU — stub Phase 2
│   │   ├── stream-consumer.ts            BARU — stub Phase 4
│   │   ├── config.ts                     BARU — stub Phase 2
│   │   └── platforms/                    BARU — adapter boundary Phase 6
│   │       └── README.md                 BARU
│   ├── providers/                        BARU — provider boundary Hermes
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── base.ts                       BARU — stub Phase 3
│   │   └── transports/                   BARU — transport boundary Phase 3
│   │       └── README.md                 BARU
│   ├── cron/                             BARU — background scheduler
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── jobs.ts                       BARU — stub Phase 4/6
│   │   └── scheduler.ts                  BARU — stub Phase 4/6
│   ├── plugins/                          BARU — plugin + middleware boundary
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── manager.ts                    BARU — stub Phase 6
│   │   └── middleware.ts                 BARU — stub Phase 6
│   ├── skills/                           BARU — paket SKILL.md
│   │   └── README.md                     BARU
│   ├── state/                            BARU — SessionDB boundary
│   │   ├── README.md                     BARU
│   │   ├── index.ts                      BARU — barrel kosong
│   │   ├── session-db.ts                 BARU — stub Phase 4/6
│   │   ├── schema.ts                     BARU — stub Phase 4/6
│   │   └── search.ts                     BARU — stub Phase 6
│   ├── constants.ts                       BARU — stub Phase 2
│   ├── tools/                            ADA + boundary baru
│   │   ├── registry.ts                   ADA — registry existing; jangan diubah
│   │   ├── model-tools.ts                BARU — stub Phase 3
│   │   ├── toolsets.ts                   BARU — stub Phase 5
│   │   ├── skills-tool.ts                BARU — stub Phase 5
│   │   ├── skills-guard.ts               BARU — stub Phase 5
│   │   ├── skill-manager-tool.ts         BARU — stub Phase 5
│   │   ├── delegate-tool.ts              BARU — stub Phase 6
│   │   ├── approval.ts                   BARU — stub Phase 5
│   │   ├── threat-patterns.ts            BARU — stub Phase 5
│   │   ├── environments/                 BARU — execution environment boundary
│   │   │   ├── README.md                 BARU
│   │   │   ├── base.ts                   BARU — stub Phase 4
│   │   │   ├── local.ts                  BARU — stub Phase 4
│   │   │   ├── docker.ts                 BARU — stub Phase 4
│   │   │   └── ssh.ts                    BARU — stub Phase 4
│   │   └── mcp/                          BARU — MCP boundary Phase 5
│   │       └── README.md                 BARU
│   ├── agentic/                          ADA — plan/step/approval existing
│   ├── router/                           ADA — capability/evidence existing
│   ├── gemini/                           ADA — legacy transport, frozen
│   ├── routes/                           ADA — Express routes existing
│   ├── config.ts                         ADA — existing `loadConfig`
│   ├── auth.ts                           ADA — existing auth boundary
│   ├── usage.ts                          ADA — existing usage accounting
│   └── index.ts                          ADA — existing service entrypoint
├── tsconfig.json                         ADA — typecheck scope
└── vitest.config.ts                      ADA — test configuration
├── scripts/worker-identity.mjs           BARU — repo root, not service child
├── docs/ai-map/                           BARU — repo root documentation
└── data/portable/worker-manifest.json    BARU — generated audit manifest
```

`scripts/`, `docs/ai-map/`, dan `data/portable/` berada di root repository;
ketiganya ditampilkan di bawah tree untuk menunjukkan artefak Phase 1, bukan
sebagai child dari `services/ai-orchestrator/`.

## Tanggung jawab direktori dan file baru

### `src/agent/` — runtime dan siklus turn

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `README.md` | 1 | Boundary runtime dan larangan membuat loop kedua |
| `index.ts` | 1 | Barrel kosong; tidak mengimpor stub yang belum punya API |
| `runtime.ts` | 2 | Façade AIAgent: lifecycle provider, context, toolset, callback |
| `conversation-loop.ts` | 3 | Satu loop context → model → response → act |
| `turn-context.ts` | 3 | Snapshot context untuk satu turn |
| `prompt-builder.ts` | 2 | Penyusunan prompt dari stable/context/volatile input |
| `system-prompt.ts` | 2 | Definisi system prompt yang versioned |
| `context-files.ts` | 5 | Context file discovery dan loading progresif |
| `tool-executor.ts` | 3 | Eksekusi tool sequential/concurrent/segmented |
| `turn-finalizer.ts` | 4 | Finalisasi turn, event akhir, dan delivery handoff |
| `iteration-budget.ts` | 3 | Batas iterasi/resource loop |
| `tool-guardrails.ts` | 5 | Validasi approval, capability, dan side-effect guard |
| `context-engine.ts` | 6 | Orkestrasi context recall, compression, dan token budget |
| `context-compressor.ts` | 6 | Kompresi context yang dapat diaudit |
| `memory-manager.ts` | 6 | Lifecycle memory/lineage untuk runtime |
| `subagent-lifecycle.ts` | 6 | Lifecycle delegation dan completion subagent |

### `src/gateway/` — boundary platform, session, dan stream

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `README.md` | 1 | Kontrak gateway; tidak memiliki model loop |
| `index.ts` | 1 | Barrel kosong untuk boundary gateway |
| `run.ts` | 2 | GatewayRunner: menghubungkan session ke runtime |
| `session.ts` | 2 | Source/store identity session dan routing key |
| `stream-consumer.ts` | 4 | Mengonsumsi event runtime untuk delivery |
| `config.ts` | 2 | PlatformConfig dan konfigurasi gateway |
| `platforms/README.md` | 1 | Boundary adapter platform Phase 6 |

### `src/providers/` — transport provider

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `README.md` | 1 | Kontrak provider dan aturan transport tunggal |
| `index.ts` | 1 | Barrel kosong provider |
| `base.ts` | 3 | Profile/provider interface yang stabil |
| `transports/README.md` | 1 | Lokasi transport chat-completions/Anthropic/Bedrock/Responses future |

Transport konkret di `src/providers/transports/` adalah `FUTURE`; tidak ada
file transport dibuat Phase 1. `src/gemini/` adalah `ADA` dan dibekukan mulai
phase ini sampai konsolidasi Phase 6.

### `src/cron/`, `src/plugins/`, dan `src/skills/`

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `cron/README.md` | 1 | Boundary background job dan scheduler |
| `cron/index.ts` | 1 | Barrel kosong cron |
| `cron/jobs.ts` | 4/6 | Definisi job yang persisten dan dapat diaudit |
| `cron/scheduler.ts` | 4/6 | Tick, lifecycle guard, dan trigger runtime |
| `plugins/README.md` | 1 | Boundary extension tanpa loop model |
| `plugins/index.ts` | 1 | Barrel kosong plugin |
| `plugins/manager.ts` | 6 | Discovery, load, dan lifecycle plugin |
| `plugins/middleware.ts` | 6 | Hooks/middleware/metrics extension point |
| `skills/README.md` | 1 | Paket instruksi/aset progresif; bukan executable loop |

### `src/state/` — state durable dan search

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `state/README.md` | 1 | Boundary SessionDB dan lineage |
| `state/index.ts` | 1 | Barrel kosong state |
| `state/session-db.ts` | 4/6 | SessionDB WAL/FTS5/lineage target |
| `state/schema.ts` | 4/6 | Schema state dan migrasi |
| `state/search.ts` | 6 | Search dan retrieval state |

Dependency SQLite sengaja belum dipilih. Stub tidak membuka koneksi atau
menambahkan dependency.

### `src/tools/` — registry boundary dan environment

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `tools/registry.ts` | existing | Registry existing; satu-satunya registry kanonik target |
| `tools/model-tools.ts` | 3 | Bentuk definisi tool untuk provider |
| `tools/toolsets.ts` | 5 | Komposisi capability dan availability |
| `tools/skills-tool.ts` | 5 | Tool untuk discovery/loading skill |
| `tools/skills-guard.ts` | 5 | Validasi skill policy dan trust boundary |
| `tools/skill-manager-tool.ts` | 5 | Lifecycle operasi skill |
| `tools/delegate-tool.ts` | 6 | Boundary tool delegation/subagent |
| `tools/approval.ts` | 5 | Adapter approval menuju service fail-closed existing |
| `tools/threat-patterns.ts` | 5 | Pattern threat untuk guardrail tool |
| `tools/environments/README.md` | 1 | Boundary execution environment |
| `tools/environments/base.ts` | 4 | Kontrak environment |
| `tools/environments/local.ts` | 4 | Backend local future |
| `tools/environments/docker.ts` | 4 | Backend Docker future |
| `tools/environments/ssh.ts` | 4 | Backend SSH future |
| `tools/mcp/README.md` | 1 | Boundary MCP discovery/server task |

`agentic/budget-sandbox.ts` tetap existing dan berarti run budget; ia bukan
pengganti `tools/environments/`.

### File root service yang baru

| File | Phase target | Tanggung jawab |
| --- | --- | --- |
| `src/constants.ts` | 2 | Resolver root/profile/runtime home |

### Artefak repo root dan peta existing

| Path | Status | Tanggung jawab / batas |
| --- | --- | --- |
| `docs/ai-map/WORKER_IDENTITY.md` | BARU | Identitas, scope, exclude, provenance, graph |
| `docs/ai-map/ARCHITECTURE_LAYERS.md` | BARU | Diagram dan kontrak 16 lapisan + 11 hub |
| `docs/ai-map/DIRECTORY_MAP.md` | BARU | Tree dan tanggung jawab file |
| `docs/ai-map/PHASE_1_RECEIPT.md` | BARU | Receipt verifikasi akhir, ditulis Langkah 8 |
| `scripts/worker-identity.mjs` | BARU | Generate/verify manifest stdlib |
| `scripts/worker-identity.test.mjs` | BARU | Node test fixture identity |
| `data/portable/worker-manifest.json` | BARU | Manifest mesin, tidak meng-hash diri sendiri |
| `docs/ai-map/STATE_CURRENT.md` | ADA | Hanya ditambah ringkasan status 1–2 baris pada Langkah 7 |
| `apps/web/src/app/(dashboard)/command-room/**` | ADA | Surface existing; tidak diubah |
| `apps/web/src/app/api/command-room/**` | ADA | Gateway/chat route existing; tidak diubah |
| `apps/web/src/components/command-room/**` | ADA | UI surface existing; tidak diubah |
| `apps/web/src/lib/command-room/**` | ADA | Client/state boundary existing; tidak diubah |
| `apps/web/src/lib/chat/**` | ADA | Chat state existing; tidak diubah |
| `apps/web/src/lib/ai/**` | ADA-PARSIAL | Provider/client existing; tidak diubah |
| `apps/web/src/lib/paax-models.ts` | ADA | Catalog model existing; tidak diubah |
| `packages/schemas/src/**` | ADA | Kontrak schema existing; tidak diubah |

## Existing directories yang dibekukan Phase 1

Direktori dan file berikut tetap ada untuk menjaga verified functionality:

- `services/ai-orchestrator/src/agentic/` — plan/step/approval existing.
- `services/ai-orchestrator/src/router/` — capability/evidence/memory existing.
- `services/ai-orchestrator/src/gemini/` — legacy provider transport; frozen.
- `services/ai-orchestrator/src/routes/` — Express routes existing.
- `services/ai-orchestrator/src/tools/registry.ts` — registry existing.
- `services/ai-orchestrator/src/config.ts`, `auth.ts`, `usage.ts`, `index.ts`.
- Semua source `apps/web` dan `packages` yang tercantum dalam scope audit.

Tidak ada target Phase 1 di `apps/web/agent/`, `apps/web/gateway/`, atau
`apps/web/providers/`; membuatnya akan menggandakan surface/gateway dan
melanggar aturan satu runtime.
