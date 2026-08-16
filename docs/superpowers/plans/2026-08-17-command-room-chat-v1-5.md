# Command Room Chat v1.5 implementation plan

> Scope: the downloaded Command Room Chat v1.5 target, its acceptance checklist, and the minimum Chat/Work separation required to make the target true. This plan is executed on `feat/command-room-chat-v1-5`; the dirty primary checkout is not touched.

## Authority and invariants

- The preserved transcript is product intent. The directive controls execution order and evidence. The master plan supplies the local implementation shape. The acceptance checklist is the gate.
- Chat is a turn-scoped cloud agent. It may use general cloud search/knowledge, file/image understanding, MCP or configured auxiliary services, and durable conversation memory. It does not expose project-graph, AHSP, RAB, schedule, scenario, RAB export, local terminal, or Work job tools.
- Work remains the project-scoped operational surface. Existing Work tools and the Work event contract stay isolated behind `mode: work` and are not deleted.
- Core Engine remains the only authority for final RAB/BoQ/HSP/bobot/durasi/quantity outputs. No UI, reducer, provider prompt, or LLM may compute or claim such output as authoritative.
- Every user-visible progress item is derived from a typed server event or a real reducer transition. No fixed fake RunStatus template is a source of truth.
- A client event is accepted only once per `(conversation_id, turn_id, event_id)` and only when it is not older than the last applied sequence. A terminal turn cannot be reopened by a late packet.
- No secret, prompt, raw reasoning, or large data URI is persisted in browser storage or evidence logs.

## File-level change map

### Contract and reducer

1. `apps/web/src/lib/chat/command-room-chat-contract.ts`
   - Define the discriminated event union: `turn.started`, `assistant.delta`, `assistant.interim`, `reasoning.delta`, `tool.drafting`, `tool.started`, `tool.progress`, `tool.completed`, `tool.failed`, `tool.interrupted`, `source.added`, `artifact.created`, `artifact.processing`, `artifact.ready`, `artifact.failed`, `turn.completed`, `turn.interrupted`, `turn.failed`, and `conversation.updated`.
   - Define ordered message parts and durable source/artifact/attachment metadata. Keep reasoning separate from visible transcript parts.
   - Export runtime guards/normalizers for SSE payloads and legacy-to-v1.5 compatibility.

2. `apps/web/src/lib/chat/command-room-chat-reducer.ts`
   - Implement immutable turn/conversation state, delta coalescing, interim sealing, ordered parts, tool upsert/state transitions, source/artifact projections, duplicate/late/race handling, and terminal-state protection.
   - Expose derived `activity`, `sources`, and `summary` projections from the same normalized state.

3. `apps/web/src/lib/chat/command-room-chat-contract.test.ts` and `command-room-chat-reducer.test.ts`
   - Start with failing tests for ordered event replay, duplicate/late events, interim-to-final sealing, concurrent tool calls, truthful failures, artifact lifecycle, and terminal stop/complete races.

4. `apps/web/src/lib/chat/chat-stream-events.ts`, `activity-timeline.ts`, `chat-run-store.ts`
   - Make v1.5 contract/reducer authoritative. Keep a narrow legacy parser only for old deployed streams; do not generate legacy synthetic steps for new Chat turns.
   - Store ordered parts and actual model metadata on the run/message. Persist assistant transcript through the server adapter first, with localStorage only as an explicitly marked migration/offline cache.

### Chat/Work boundary and server stream

5. `apps/web/src/app/api/command-room/chat/connector-permissions.ts` and tests
   - Replace connector/keyword selection in Chat with a fail-closed Chat registry policy. Retain connector mapping only for Work compatibility and add assertions that every Work-only tool is absent from Chat.

6. `apps/web/src/app/api/command-room/chat/tools.ts`, `route.ts`, `route.test.ts`
   - Route Chat without `selectCommandRoomTools`, `PROJECT_SCOPED_TOOLS`, Work tools, or keyword intent routing. Keep `mode: work` delegated to the existing Work handler.
   - Emit canonical v1.5 envelope fields (`event_id`, `conversation_id`, `turn_id`, `sequence`, `timestamp`, `runtime_id`) and actual lifecycle events. Map provider deltas/tool callbacks to typed events at one boundary.
   - Emit sources from real retrieval/tool provenance and artifacts by durable ID/reference; never forward raw structured tool results or data URIs to the client.
   - Preserve deterministic claim verification for project facts, but do not claim every Home Chat answer is Core Engine-backed.

7. `apps/web/src/app/api/command-room/chat/control/route.ts`
   - Add authenticated stop, steer, queue, resume, and status commands. Use a bounded in-process registry for the live request plus server persistence when DB is configured. Stop must abort provider/tool work, park the turn, and report the resulting state.

8. `apps/web/src/app/api/command-room/attachments/route.ts` and `apps/web/src/lib/chat/attachment-contract.ts`
   - Stage attachments server-side with generated IDs, content hash, MIME/size validation, status, and scoped storage reference. Accept image/PDF/DOCX/XLSX/PPTX/CSV; reject unsupported/oversized input truthfully.
   - The Chat request carries attachment IDs, never browser base64. Image attachments use the configured vision/auxiliary path when the main model is text-only and emit success/failure provenance.

9. `apps/web/src/app/api/command-room/artifacts/route.ts` and `apps/web/src/lib/chat/artifact-contract.ts`
   - Provide durable artifact metadata/download by ID. Normalize existing Work/tool artifact results into a reference and keep the implementation independent from the Chat registry.

### Persistence and security

10. `services/db/src/paax_db/models.py`, `schemas.py`, `main.py`, and a new Alembic revision
    - Add ownership-scoped Chat turn/event/part/source/attachment/artifact/queue records only where the existing conversation/message substrate cannot carry the contract safely.
    - All get/update/delete/message/event paths must filter by the authenticated owner (or the documented internal actor); cross-user IDs return 404/403 without data leakage.
    - Keep Zod request/response shapes and Pydantic shapes semantically aligned. Add migration tests and ownership tests.

11. `apps/web/src/lib/chat/chat-history.ts` and tests
    - Add server-backed adapter/migration flags and preserve the local cache solely for offline/read-through fallback. Store model identity, message parts, source/artifact refs, attachments, branch/pin/archive metadata, and turn status; never infer historical model from the active composer.

### UI

12. `apps/web/src/app/(dashboard)/command-room/page.tsx`, `components/command-room/RunStatus.tsx`, `command-room-ui.ts`, and focused tests
    - Home Chat contains only the simple Chat surface: remove New Project/Gambar Kerja/RAB/Schedule chips and Work quick actions. Keep Project/Work entry points in their own surface.
    - Keep High/Ultra as effort/thinking semantics with provider effort internal; render the model actually recorded on each message.
    - Replace RunStatus/ProcessingTrace as canonical state with ordered parts: interim, friendly tool cards with live status, sources, artifacts, and final answer. Raw reasoning stays private/opt-in per model policy.
    - Right rail becomes Activity/Sources/Summary and reads the same reducer state. Composer remains editable while a run is active; Enter queues FIFO, Stop parks, and Steer submits a correction to the active turn.
    - Attachment picker shows real staged status and truthful invalid/failure states. Mobile layout keeps chat usable without hiding the event/source truth.

13. Add focused UI tests for boundary labels, empty state, model history, right rail, queue/steer/stop, attachments, artifacts, and responsive state.

## Phase order and gates

1. **Baseline/spec gate** — source hashes, Graphify map, Hermes hash/reference notes, clean worktree, baseline test/typecheck/lint receipts.
2. **Contract gate** — red tests first; contract/reducer green; no UI/server behavior changed until replay semantics are proven.
3. **Boundary gate** — Chat tool registry has no Work names; route tests prove keyword text cannot activate Work; Work route tests remain green.
4. **Runtime gate** — canonical SSE events, actual interim/tool/source/artifact transitions, deterministic verification preserved; route unit/integration tests green.
5. **Persistence/control gate** — server ownership, migration, attachment/artifact IDs, queue/steer/stop race and restart tests green.
6. **UI gate** — Home Chat cleanup, right rail, parts renderer, historical metadata, and responsive/interaction tests green.
7. **Real-app gate** — start the portable stack, exercise at least: plain Chat, research/source, no Work tool leakage, actual interim, concurrent/failed tool, queue, steer, stop/resume, image/PDF attachment, artifact reference/download, reload/restore, branch/pin/archive/search, mobile viewport, console/network. Save screenshots, event traces, and network receipts.
8. **Delivery gate** — reread transcript/checklist, refresh Graphify for affected modules, review diff and secrets, write final traceability/evidence report, push branch and open PR; do not merge.

## Acceptance traceability

- TGT-001–021 → UI boundary, model semantics, Chat/Work separation (`page.tsx`, connector tests, route tests).
- TGT-022–044 → runtime provider/tool policy, actual interim, privacy, typed lifecycle (`route.ts`, contract, reducer, tool registry).
- TGT-045–066 → ordered parts, friendly tools, Activity/Sources/Summary, provenance (`contract`, reducer, renderer, claim/source adapters).
- TGT-067–080 → queue/steer/stop and durable turn state (`control/route.ts`, DB migration, store tests).
- TGT-081–094 → attachment staging, vision fallback, durable artifacts (`attachments`, `artifacts`, document-intelligence integration/tests).
- TGT-095–106 → persistence, restore, isolation, branch/pin/archive/search (`services/db`, history adapter, reload tests).
- TGT-107–115 → AI-first policy, deterministic authority, regression/typecheck/lint/build/real UI evidence and Git review gate.

## Rollback

- Each phase is independently revertible. The compatibility parser remains until the v1.5 route/store is proven against the portable runtime.
- If DB is unavailable, Chat remains usable with an explicitly marked session cache; it must not silently present cache as durable server history.
- If attachment/vision/artifact services fail, the user receives a typed failed/interrupted state and a manual text-only path remains available.
