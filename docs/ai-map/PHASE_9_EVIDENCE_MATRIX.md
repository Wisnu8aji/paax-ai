# Phase 9 evidence matrix

This matrix is the compact evidence key used by the row-by-row ledgers. The
ledgers retain every catalog row; this file prevents repeating long PAAX test
names in thousands of rows.

## Runner evidence

| Evidence ID | PAAX source boundary | PAAX test evidence | Runner result |
| --- | --- | --- | --- |
| E-SKILL-FORMAT | `skills/format.ts:parseSkillDocument` | `tests/skills/format.test.ts`: narrow metadata/body separation; duplicate/unknown/unsafe fields, malformed lists, executable directives; metadata/body limits | PASS |
| E-SKILL-LOADER | `skills/loader.ts:FileSkillLoader`, `createSkillLoader`, `skills/types.ts:SkillLoader` | `tests/skills/loader.test.ts`: bounded metadata-first list/view; traversal, missing roots, duplicates, oversized bodies | PASS |
| E-SKILL-GUARD | `tools/skills-guard.ts:guardSkillAccess` | `tests/tools/skills-guard.test.ts`: actor/project/scope intersection and bounded capability intersection | PASS |
| E-SKILL-TOOLS | `tools/skills-tool.ts:createSkillsTools`, `tools/skill-manager-tool.ts:createSkillManagerTool` | `tests/tools/skills-tool.test.ts`: bounded read-only tools; `tests/tools/skill-manager-tool.test.ts`: manual fallback and injected mutation port | PASS |
| E-MCP-CONFIG | `tools/mcp/config.ts:parseMcpServers`, `loadMcpConfig` | `tests/tools/mcp-config.test.ts`: disabled configuration, exact command/host allowlists, duplicate/unknown/credential rejection | PASS |
| E-MCP-CLIENT | `tools/mcp/client.ts:createMcpClient` and transport factories | `tests/tools/mcp-client.test.ts`: bounded stdio initialize/list/call/close, malformed/oversized/timeout rejection, HTTP JSON-RPC | PASS |
| E-MCP-ADAPTER | `tools/mcp/adapter.ts:adaptMcpTools`, `createMcpToolSource` | `tests/tools/mcp-adapter.test.ts`: names/provenance, schema/collision rejection, registry/provider conversion, approval/journal routing, disabled servers | PASS |
| E-REGISTRY | `tools/registry.ts:createToolRegistry`, model/toolset conversion | `tests/tools/canonical-registry.test.ts`, `model-tools.test.ts`, `toolsets.test.ts`: canonical composition, provider-neutral schemas, policy, plugin/delegate boundaries | PASS |
| E-GATEWAY-RUN | `gateway/run.ts:GatewayRunner`, `createGatewayRouter` | `tests/gateway/run.test.ts`: profile/binding validation, endpoint/error shape, durable run/message receipt, WorkEvent persistence/replay | PASS |
| E-GATEWAY-SESSION | `gateway/session.ts` session store boundaries | `tests/gateway/session.test.ts`: deterministic identity, binding checks, durable reopen, metadata identity rules | PASS |
| E-GATEWAY-STREAM | `gateway/stream-consumer.ts` | `tests/gateway/stream-consumer.test.ts`: producer sequence, dedupe, failure/overflow, abort/close, replay cursor | PASS |
| E-GATEWAY-EVENTS | gateway WorkEvent emitter and schemas | `tests/gateway/work-events.test.ts`: envelope/sequence/SSE framing, redaction/bounds, invalid payload rejection | PASS |
| E-JOURNAL | `state/turn-journal.ts` | `tests/state/turn-journal.test.ts`: queued invocation reopen and terminal transition rules | PASS |
| E-CRON | `cron/host.ts`, scheduler, stores | `tests/cron/host.test.ts`, `scheduler.test.ts`, `jobs.test.ts`, `durable-store.test.ts`: explicit tick, durable claim/receipt, lease recovery, disabled/default lifecycle | PASS |
| E-RUNTIME | `agent/runtime.ts`, conversation loop, ToolExecutor | `tests/agent/runtime.test.ts`, `runtime-phase3.test.ts`, `conversation-loop.test.ts`, `tool-executor.test.ts` | PASS |
| E-CONTEXT | `agent/context-engine.ts`, `context-compressor.ts`, prompt/context files | `tests/agent/context-engine.test.ts`, `context-compressor.test.ts`, `context-files.test.ts`, `prompt-builder.test.ts` | PASS |
| E-APPROVAL | approval service, scoped resolver, tool approval boundary | `tests/agent/approval.test.ts`, `approval-service.test.ts`, `tests/agent/tool-executor.test.ts` | PASS |
| E-TOOL-EXEC | `agent/tool-executor.ts`, tool guardrails | `tests/agent/tool-executor.test.ts`, `tool-guardrails.test.ts` | PASS |
| E-SUBAGENT | subagent lifecycle/factory boundary | `tests/agent/subagent-lifecycle.test.ts`, `subagent-integration.test.ts` | PASS |
| E-STATE | `state/session-db.ts`, durable state stores | `tests/state/session-db.test.ts`, `schema.test.ts`, `search.test.ts`, `work-events.test.ts` | PASS |
| E-PLUGIN | plugin manager/middleware boundary | `tests/plugins/manager.test.ts`, `middleware.test.ts` | PASS |
| E-OBS | sanitized audit/trace/metrics observation | `tests/observability/audit.test.ts`, `trace.test.ts`, `metrics.test.ts` | PASS |
| E-PROVIDER | current provider profile/transport boundary | current OpenAI-compatible/provider transport tests in the same service runner; legacy Gemini tests remain frozen | PASS for current boundary; legacy NOT-RUN |
| E-COMPOSITION | `src/index.ts:createApp` | `tests/composition-root.test.ts`: SessionDB-backed store and disabled cron/shutdown lifecycle | PASS |
| E-SCHEMA-TS | `packages/schemas/src/command-room-worker.ts` | Jest package run: 2 suites / 41 tests; package typecheck | PASS |
| E-WEB-GATEWAY | `apps/web/.../command-room/work/route.ts`, gateway client, model catalog | web Vitest run: 110 files / 867 tests; web `tsc --noEmit` | PASS |

The service run was `METERING_ENABLED=0; corepack pnpm --dir
services/ai-orchestrator test` and its verbose form: 90 files / 351 tests,
PASS. A PASS here means the PAAX test runner executed the cited invariant; it
does not mean that the Hermes catalog row has parity.

## Graphify evidence

Graphify was run before broad source browsing, after `reflect --if-stale`, from
each available active module graph:

| Graph evidence | Result |
| --- | --- |
| Service vocabulary | Selected exact tokens from generated vocab: `test`, `skill`, `loader`, `format`, `guard`, `mcp`, `package`, `api`, `tool`, `registry`, `runtime`, `composition` |
| Service query | Located `skills-guard.test.ts`, `skills-tool.test.ts`, `skill-manager-tool.test.ts`, `composition-root.test.ts`, `format.ts`, `loader.ts`, `mcp/client.ts`, `registry.ts`, `runtime.ts`, `tools-entry.ts`, and their related symbols |
| `graphify path "parseSkillDocument" "skills-guard.test.ts" --undirected` | Three-hop context through `format.ts` and `skills/types.ts`; directed path was absent, so no directed test-import claim is made |
| `graphify path "createMcpClient" "mcp-client.test.ts" --undirected` | Two-hop context through `mcp/client.ts`; directed path was absent, so no directed test-import claim is made |
| `graphify explain "SkillLoader"` | Source at `skills/types.ts`, connections to loader, tools-entry, skills index, and `FileSkillLoader` implementation |
| Web vocabulary | Selected exact tokens: `command`, `room`, `work`, `event`, `stream`, `route`, `model`, `chat`, `history`, `session`, `gateway`, `deepseek`, `orchestrator`, `run` |
| Web query | Located WorkEvent types, gateway client, work route, model aliases/catalog, chat run/history stores, orchestrator, and route/client tests |
| Graph freshness | Service and web lessons were read after reflect; a non-blocking warning reports the installed Graphify skill `0.9.26` versus package `0.9.43` |

Graphify is navigation/dependency evidence. It is not a substitute for the
source export/import chain or the runner result. The schema package had no
`graphify-out/graph.json`; its evidence is therefore static source plus the
Jest/typecheck run.

## Interpretation rules

- `EXACT` means the PAAX invariant and boundary are materially the same; it is
  intentionally rare.
- `ADAPTED` means a PAAX test proves a bounded analogous invariant, not Hermes
  implementation parity.
- `ABSENT` means the catalog capability is in the worker scope but no PAAX
  implementation/test was found.
- `OUT-OF-SCOPE` means a Hermes platform, UI, package, or content row is not a
  Command Room worker contract.
- `FROZEN` means the row belongs to explicitly retained legacy/Gemini material;
  it must not be used as current evidence.
- `FINDING` is reserved for a current PAAX source/test/documentation mismatch;
  each such row points to a receipt gap code.
