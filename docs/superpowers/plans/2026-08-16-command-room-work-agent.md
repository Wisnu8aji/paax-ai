# Command Room Work Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a general-purpose Work agent workspace in Command Room while preserving Chat and Drawing Intelligence boundaries.

**Architecture:** Keep Chat on its existing domain route and add a `mode: "work"` branch with a neutral general-agent prompt, bounded Work tool registry, session-scoped event contract, approval bridge, and replayable Work store. Replace the current Drawing Intelligence console wrapper with a focused Work UI and hide Chat navigation while Work is active.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, SSE, existing provider adapters, localStorage session persistence.

**Spec:** `docs/superpowers/specs/2026-08-16-command-room-work-agent-design.md`

## Global Constraints

- Work contains no Drawing Intelligence run console, project run ID, drawing connector, or provider/model label.
- Chat behavior and existing drawing guardrails remain intact.
- Tool output is bounded and redacted before it reaches the browser.
- Every production behavior change has a failing test first.
- Every implementation checkpoint has a plain commit message with no contributor trailers.
- Real browser validation uses a 20-page drawing fixture only for Target 1 and safe local Work tasks for Target 2.

---

### Task 1: Freeze the Work event and safety contracts

**Files:**
- Create: `apps/web/src/lib/command-room/work-agent-types.ts`
- Create: `apps/web/src/lib/command-room/work-agent-contract.test.ts`
- Create: `apps/web/src/lib/command-room/work-agent-redaction.ts`
- Create: `apps/web/src/lib/command-room/work-agent-redaction.test.ts`

**Interfaces:**
- `WorkEvent`, `WorkEventType`, `WorkTask`, `WorkToolRecord`, `WorkSessionSnapshot`, `WorkApprovalRequest`.
- `normalizeWorkEvent(value: unknown): WorkEvent | null` rejects missing session identity and unsafe shapes.
- `redactWorkPayload(value: unknown, maxChars?: number): unknown` removes secret-looking keys and caps recursive text.

- [ ] Write tests that reject an event from another session, preserve sequence/event identity, and redact bearer tokens, API keys, cookies, and private key blocks.
- [ ] Run the focused tests and observe failure because the contracts do not exist.
- [ ] Implement the smallest typed union, parser, and redactor that satisfy the tests.
- [ ] Run the focused tests and verify they pass.
- [ ] Commit with `add work event contract`.

### Task 2: Add a replayable Work store

**Files:**
- Create: `apps/web/src/lib/command-room/work-agent-store.ts`
- Create: `apps/web/src/lib/command-room/use-work-agent.ts`
- Create: `apps/web/src/lib/command-room/work-agent-store.test.ts`

**Interfaces:**
- `workAgentStore.createSession(title?: string): string`.
- `workAgentStore.startTurn(input): Promise<void>`.
- `workAgentStore.applyEvent(sessionId, event): void`.
- `workAgentStore.resolveApproval(sessionId, approvalId, decision): Promise<void>`.
- `useWorkAgent(sessionId): WorkSessionSnapshot`.

- [ ] Write tests for session isolation, duplicate sequence suppression, task/tool lifecycle projection, final answer accumulation, stop behavior, and localStorage hydration.
- [ ] Run the tests and observe failure.
- [ ] Implement the external-store snapshot, SSE reader, bounded ledger, persistence namespace, and reconnect cursor.
- [ ] Run focused tests, then refactor only while green.
- [ ] Commit with `add work session store`.

### Task 3: Split Chat and Work at the API boundary

**Files:**
- Modify: `apps/web/src/app/api/command-room/chat/route.ts`
- Create: `apps/web/src/app/api/command-room/work/approval/route.ts`
- Create: `apps/web/src/app/api/command-room/work/route.test.ts`
- Create: `apps/web/src/app/api/command-room/work-approval.ts`

**Interfaces:**
- Request schema accepts `mode: "chat" | "work"`, defaulting to `"chat"`.
- Work events include `runId`, `conversationId`, `eventId`, and `sequence`.
- `requestWorkApproval` and `resolveWorkApproval` use a bounded server-side pending map with timeout.

- [ ] Write API tests proving Work does not load drawing context, does not append drawing instructions, emits neutral Work events, and returns a typed error for unsafe terminal execution without approval.
- [ ] Run the tests and observe failure.
- [ ] Add the Work branch, neutral system prompt, scoped event helper, approval route, heartbeat, and capped payload forwarding. Leave Chat branch behavior unchanged.
- [ ] Run the API tests and existing Chat route tests.
- [ ] Commit with `separate work api mode`.

### Task 4: Implement the bounded general tool registry

**Files:**
- Create: `apps/web/src/app/api/command-room/work/tools.ts`
- Create: `apps/web/src/app/api/command-room/work/tools.test.ts`
- Modify: `apps/web/src/app/api/command-room/chat/route.ts`

**Interfaces:**
- `getWorkToolRegistry(context): ToolDefinition[]`.
- Tools return normalized summaries and technical payloads through the redactor.
- `terminal_run` accepts only read-only allowlisted commands until approval is resolved.

- [ ] Write tests for file list/read/search bounds, task ledger authority, terminal allowlist, and unavailable extension reporting.
- [ ] Run focused tests and observe failure.
- [ ] Implement the registry with workspace root validation, output limits, and explicit unsafe-action errors.
- [ ] Run focused tests and verify no secret appears in serialized output.
- [ ] Commit with `add bounded work tools`.

### Task 5: Replace the incorrect Work surface

**Files:**
- Modify: `apps/web/src/components/command-room/command-room-work.tsx`
- Modify: `apps/web/src/components/command-room/command-room-work.test.tsx`
- Modify: `apps/web/src/components/command-room/command-room.css`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`

**Interfaces:**
- `CommandRoomWorkSurface` accepts only optional initial session metadata and no project/run/drawing callback.
- The component renders task rail, transcript, reasoning, tool cards, log/terminal pane, approval cards, session list, technical toggle, and settings rail.

- [ ] Replace the old tests with failing tests for neutral standby, prompt submission, only-active-session visibility, technical payload disclosure, approval action, and no drawing/provider/model text.
- [ ] Run the component tests and observe failure.
- [ ] Implement the Work surface using the Work store and keep expensive panels mounted when hidden.
- [ ] Hide the outer Chat sidebar actions/conversations while Work is selected; retain profile/settings affordances.
- [ ] Run focused component tests and inspect responsive styles.
- [ ] Commit with `build general work surface`.

### Task 6: Add Blueprint, Pengetahuan, Arsip, Pasukan, Persona, and extension settings

**Files:**
- Create: `apps/web/src/lib/command-room/work-settings.ts`
- Create: `apps/web/src/lib/command-room/work-settings.test.ts`
- Create: `apps/web/src/app/api/command-room/work/catalog/route.ts`
- Modify: `apps/web/src/components/command-room/command-room-work.tsx`

**Interfaces:**
- `WorkSettings` contains persona, approval policy, technical mode, enabled blueprints, memory mode, and tool visibility.
- Catalog returns honest availability for local blueprints, durable memory, session archive, subagent delegation, and configured extensions.

- [ ] Write tests for default settings, persistence without secrets, and catalog availability.
- [ ] Run tests and observe failure.
- [ ] Implement settings and catalog with empty-but-valid states when directories or adapters are absent.
- [ ] Run focused tests.
- [ ] Commit with `add work settings and catalog`.

### Task 7: Reconcile Target 1 with the master plan

**Files:**
- Modify only the Target 1 files identified by the audit.
- Update: `D:\PAAX-Orchestration\00_projects\2026-08-07-drawing-intelligence-r2\08_delivery\2026-08-16_TARGET1_DESKTOP_AUDIT.md`

- [ ] Compare 20-worker vision concurrency, SSE/replay, raw trace, deterministic formula boundary, and 20-page fixture to the master plan.
- [ ] Add a regression test for each gap found before fixing it.
- [ ] Implement only evidence-backed corrections.
- [ ] Run focused Target 1 tests and the 20-page live fixture.
- [ ] Commit with `align drawing worker contract`.

### Task 8: Verification and reports

**Files:**
- Update: `D:\PAAX-Orchestration\00_projects\2026-08-07-drawing-intelligence-r2\08_delivery\2026-08-16_TARGET2_WORK_SURFACE_REPORT.md`
- Create: `D:\PAAX-Orchestration\00_projects\2026-08-07-drawing-intelligence-r2\08_delivery\2026-08-16_WORK_AGENT_FINAL_REPORT.md`

- [ ] Run focused Vitest tests, full web test suite, TypeScript check, and Next build.
- [ ] Start/reuse the official local server and perform at most five real browser attempts.
- [ ] Verify one safe Work task from prompt to final answer, with task, commentary, tool, log, payload, approval, and replay evidence.
- [ ] Rerun desktop validation with at most ten attempts and attach evidence.
- [ ] Record failures honestly, including unrelated baseline failures.
- [ ] Commit with `record work verification`.
