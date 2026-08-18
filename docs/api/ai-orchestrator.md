# PAAX AI Orchestrator — current worker API

Status: reconciled by Phase 9 against the worker source, schemas, tests, and
Graphify evidence. This document describes the current Command Room worker
boundary; it is not a description of the historical Genkit/Gemini prototype.

## 1. Current request path

The default web path is:

```text
apps/web /api/command-room/work
  -> gateway-client (internal key, bounded timeout, prepared-response validation)
  -> services/ai-orchestrator /gateway/command-room/turn/stream
  -> GatewayRunner.prepareExecution / AIAgent.initializeTurn
  -> AIAgent.runPreparedTurn / provider transport / canonical ToolExecutor
  -> bounded WorkEvent SSE stream
```

`apps/web/src/app/api/command-room/work/route.ts` defaults
`PAAX_COMMAND_ROOM_GATEWAY_MODE` to `service`. The explicit `legacy` mode is a
compatibility handoff and is not current service evidence. The old Gemini
routes and their tests remain frozen historical code; they are not part of the
current Command Room contract.

The service is mounted below `/gateway` by `createApp`. Development commonly
uses `http://localhost:8082`; deployment URL and authentication are environment
owned and must not be hard-coded into this document.

## 2. Authentication and binding

The web gateway client sends the internal service credential through the
runtime-configured header. Credential values are never part of this API
document. The service applies its auth/rate-limit middleware, derives the
actor and tenant binding, and validates the request/session/run relationship
before agent preparation.

The binding includes channel, tenant, actor, conversation, and optional
project/thread/workspace/snapshot/document-revision identifiers. A reused
`runId` must match the existing binding. Prepared responses expose binding and
model metadata but do not expose the assembled prompt.

## 3. Turn endpoints

### `POST /gateway/command-room/turn/prepare`

This validates and prepares a turn without executing the provider loop. The
request is the `GatewayTurnRequestSchema` shape:

```json
{
  "mode": "work",
  "runId": "optional-idempotency-key",
  "session": {
    "channel": "command_room",
    "conversationId": "conversation-id",
    "projectId": "optional-project-id"
  },
  "messages": [{ "role": "user", "content": "user message" }],
  "modelAlias": "lucent",
  "reasoningEffort": "high",
  "thinking": "on",
  "clientCorrelationId": "optional-correlation-id"
}
```

The response is validated by `GatewayTurnPreparedSchema` and contains:

- `protocolVersion`: `command-room.gateway.v1`;
- `runId`, `sessionId`, and a session-key fingerprint;
- the normalized tenant/actor/conversation binding;
- the resolved provider profile (`alias`, provider, model, transport, request
  style, thinking capability, selected effort);
- prompt metadata only (version, stable hash, bounded section sizes, injection
  findings); and
- `handoff`: `service-conversation-loop` for the current path or
  `legacy-web-provider` only for explicit compatibility mode.

### `POST /gateway/command-room/turn/stream`

This prepares and executes one turn, then returns `text/event-stream`. The
service validates request size and profile capability before opening the stream.
`Last-Event-ID` may carry a numeric sequence (or a sequence suffix) for a
bound durable replay; replay does not rerun the agent.

The shared event schema is `GatewayWorkEventSchema`. Event types are:
`turn.started`, `status.update`, `assistant.interim`, `reasoning.delta`,
`plan.updated`, `tool.generating`, `tool.started`, `tool.progress`,
`tool.completed`, `tool.output_risk`, `approval.requested`,
`approval.resolved`, `subagent.started`, `subagent.progress`,
`subagent.completed`, `background.completed`, `artifact.created`, `log.line`,
`assistant.delta`, `turn.completed`, and `error`.

Every event carries the bounded run/conversation/event identifiers, a
non-negative sequence, and a timestamp. The stream consumer preserves producer
sequence, bounds payloads, handles client disconnect/queue overflow, and emits
one terminal completion or error path. `turn.completed` may contain the final
Markdown response and stop reason; it is not an engineering calculation
receipt.

### `POST /gateway/command-room/approval/resolve`

The approval boundary accepts `approvalId`, `sessionId`, and `decision` (`approved`
or `denied`), with optional note, arguments hash, and binding fingerprint. It
checks tenant, actor, conversation, session, and approval binding before
delegating to the approval service. Typical outcomes are `400` for malformed
input, `403` for a binding failure, `503` when the approval service is absent,
and a bounded success object containing `ok`, `approvalId`, and `decision`.

## 4. Schema ownership

The TypeScript Zod contract is
`packages/schemas/src/command-room-worker.ts`, including
`GatewayTurnRequestSchema`, `GatewayTurnPreparedSchema`, and
`GatewayWorkEventSchema`. The corresponding Python schema must remain aligned;
Phase 9 could not execute its Python test because the available interpreter has
no `pytest` module. That is a verification blocker, not permission to loosen
the schema.

The service and web code consume the same bounded request/prepared/event
concepts. Frontend code projects WorkEvents for display; it does not calculate
RAB/HSP, schedule, Kurva S, or physical quantities.

## 5. Model profile boundary

The current web catalog keeps the public aliases `lucent`, `arete`, and `noir`.
The current configured catalog maps them to DeepSeek profiles (Lucent to the
flash profile; Arete and Noir to the pro profile) through the
OpenAI-compatible service path. The default is `lucent`, reasoning effort
`high`, and thinking `on`. The service profile returned in the prepared receipt
is authoritative for a particular run; historical Qwen/Claude/Gemini claims in
older documents are stale.

Model aliases select a provider profile. They do not own construction formulas
or final quantities. Any RAB/HSP/BoQ/schedule quantity must come from the
deterministic Core Engine using approved, scoped measurement facts; an LLM
response is explanatory/proposal content only.

## 6. Canonical tool boundary

`createToolRegistry({ mode: "canonical" })` composes the domain tools, Command
Room tools, optional validated MCP tools, and optional plugin tools. Registry
collision checks, provider-neutral JSON schemas, tool policy, journal/approval
handling, and the single ToolExecutor are the runtime boundaries.

Skills are available through an explicit `skills` registry option and are
documented in `services/ai-orchestrator/src/skills/README.md`; the default
`createApp` path currently does not inject that option or a skill provider.
MCP is lazy, bounded, provenance-preserving, and approval-first as documented
in `services/ai-orchestrator/src/tools/mcp/README.md`.

The historical tool names `calculate_rab`, `get_drawing_data`, and similar
Genkit examples in the former version of this page are not a current registry
contract. Current domain tool schemas and policy are source-owned. No LLM,
TypeScript, or documentation example is an authority for final engineering
numbers.

## 7. Error and lifecycle notes

The gateway returns safe bounded error bodies. Invalid input is normally `400`,
oversized input `413`, unavailable configuration/preparation/state `503`, and
binding failures are rejected before execution. Internal provider/tool details
are not copied into the public error message.

Durable run/session/event state is SQLite-backed when configured; in-memory
fallbacks are explicit test/portable boundaries. The current source still has
known follow-up gaps around MCP lifecycle reuse/concurrency, complete audit and
provenance sinks, durable turn-journal injection, cron dispatch integration,
subagent/child-run durability, deterministic replay clocking, and bounded
reasoning-delta aggregation. The authoritative register is
`docs/ai-map/PHASE_9_RECEIPT.md`.

## 8. Evidence and maintenance rule

Phase 9 recorded the service runner at 90 files / 351 tests, the web runner at
110 files / 867 tests, the schemas runner at 2 suites / 41 tests, and successful
TypeScript builds/typechecks for the service, web, and schemas package. The
Python schema test remains `NOT-RUN/BLOCKED` solely because `pytest` is absent.

Examples in this document are synthetic shapes and placeholders. They must not
be copied as final construction quantities, prices, weights, durations, or
progress values. Update this page whenever the gateway route, Zod schema,
public model catalog, or canonical composition changes; record the evidence in
the Phase receipt and keep stale legacy claims explicitly labeled.
