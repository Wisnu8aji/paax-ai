# Command Room Work Agent Design

**Status:** approved by the current task direction

## Goal

Turn Command Room Work into a general-purpose, session-scoped agent workspace. Chat remains the ordinary PAAX conversation surface; Work owns the agent loop, task ledger, commentary, reasoning visibility, tool lifecycle, terminal diagnostics, raw payload disclosure, approvals, replay, settings, personalization, and extension catalog.

## Boundaries

- Chat continues to use the civil-engineering context, project connectors, claim verification, and evidence gate.
- Work must not import Drawing Intelligence UI, DEM run APIs, drawing/RAB/schedule connectors, project run IDs, or drawing-specific final-answer instructions.
- Work uses neutral product copy. Provider, model, vendor, and internal routing names never appear in the Work surface.
- Numeric construction authority remains deterministic in Drawing Intelligence and Core Engine. Work may inspect files and run safe tools, but it does not become a second quantity engine.
- Secrets stay server-side and are never copied into the browser event ledger.

## Runtime contract

Work posts a session-scoped turn to the existing provider gateway with `mode: "work"`. The gateway runs an observe → model → parse → execute → observe loop. It emits ordered, deduplicable SSE records with `runId`, `conversationId`, `eventId`, and `sequence`.

The Work event union is:

```ts
type WorkEventType =
  | 'turn.started' | 'status.update' | 'assistant.interim'
  | 'reasoning.delta' | 'plan.updated'
  | 'tool.generating' | 'tool.started' | 'tool.progress' | 'tool.completed'
  | 'approval.requested' | 'approval.resolved'
  | 'subagent.started' | 'subagent.progress' | 'subagent.completed'
  | 'background.completed' | 'log.line'
  | 'assistant.delta' | 'turn.completed' | 'error';
```

The client store treats the server event stream as an append-only presentation log, not as the database. It stores a bounded replay ledger, tasks, tool records, commentary, assistant content, and pending approval state per Work session. Duplicate sequence numbers are ignored; events without the current session identity are ignored.

## Tools and safety

The initial registry is deliberately small and honest:

- `todo`: authoritative task ledger; one task may be `in_progress` at a time.
- `workspace_list`, `file_read`, `file_search`: bounded, read-only workspace inspection.
- `terminal_run`: read-only allowlisted commands. Writes, deletes, process control, network actions, and elevation require an approval event and are rejected when no approval exists.
- `tool_search`, `tool_describe`, `mcp_catalog`: registry and extension discovery only; discovery never bypasses tool policy.

External MCP servers enter the same registry abstraction and expose health/auth/include-exclude state. A configured server may execute only through a registered adapter; unavailable adapters are reported as unavailable rather than simulated.

Tool arguments and results in the technical panel are capped and redacted for credentials, tokens, cookies, authorization headers, and private key material. The UI receives normalized payloads, not raw provider HTTP requests.

## Frontend

When Work is selected, the Chat sidebar is replaced by a Work rail containing only Work sessions and the active session. The active session view has:

1. prompt composer and stop control;
2. task ledger with pending/running/completed/failed states;
3. chronological agent transcript with interim commentary and final answer;
4. collapsible reasoning and tool cards;
5. terminal/log pane and product/technical mode switch;
6. approval cards for blocked actions;
7. right rail for Blueprint, Pengetahuan, Arsip, Pasukan, Persona, and extension settings.

The Work rail and panels remain session-scoped. Selecting another Work session is explicit; the UI never mixes event records from another session. Provider/model labels are omitted from all Work headings, badges, status cards, and empty states.

## Persistence and resilience

Work sessions are persisted under a separate local storage namespace for instant replay and are optionally summarized server-side using the existing conversation persistence boundary. The browser stores no secrets. The store keeps a bounded event ledger and prunes old tool output while retaining the prompt, task state, recent commentary, final answer, and error boundary.

SSE transport exposes a replay cursor. A reconnect uses the session/run identity and cursor; stale or ambiguous events are discarded. Long turns emit status/heartbeat records without fabricating progress.

## Target 1 compatibility

The Drawing Intelligence route stays independent. Its 20-worker vision extraction, page-level event protocol, raw trace, deterministic formula boundary, and 20-page live test are verified separately. Work may link to a drawing result only through an ordinary user-supplied file or message, never by embedding the drawing execution console.

## Verification gate

- unit tests: event parser, redaction, task ledger, approval policy, Work store persistence, and component rendering;
- API tests: `mode: "work"` omits drawing context and emits Work event names;
- TypeScript and Next build;
- live browser test: create a Work session, submit a safe local task, observe commentary/task/tool/log/final events, switch technical mode, reload, and verify replay; maximum five real-app attempts;
- desktop agent test: ten small local read-only tasks, maximum ten attempts, with screenshots/log evidence;
- Target 1 live drawing verification remains limited to the 20-page fixture.
