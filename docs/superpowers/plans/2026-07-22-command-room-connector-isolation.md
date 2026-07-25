# Command Room Connector Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate DEM/PCKM Drawing Intelligence, RAB, and Schedule data so Command Room exposes only the explicitly selected source for the selected project.

**Architecture:** The client sends an explicit connector permission set. The server treats it as an allow-list, derives retrieval and tool availability from it, and never enables tools with an empty set. PLHUT is served only through the existing JSON-backed fixture DB, so the Project Studio runtime has one project without rerunning image analysis.

**Tech Stack:** Next.js route handlers, TypeScript, Zod, Vitest, FastAPI fixture service, SQLite.

## Global Constraints

- DEM/PCKM is the sole Drawing Intelligence authority; legacy TKG is not sent to Command Room.
- RAB/Schedule numerical outputs remain Core Engine-only.
- No connector means no tool schema, no project retrieval, and no project-scoped durable memory.
- The fixture reads existing 88-page JSON only; it must not upload a PDF or call a vision provider.
- Do not commit or push.

---

### Task 1: Connector permission policy

**Files:**
- Create: `apps/web/src/app/api/command-room/chat/connector-permissions.ts`
- Create: `apps/web/src/app/api/command-room/chat/connector-permissions.test.ts`
- Modify: `apps/web/src/app/api/command-room/chat/tools.ts`
- Modify: `apps/web/src/app/api/command-room/chat/context.ts`

- [ ] Write failing tests proving an empty permission list allows no tool/retrieval; Drawing permits only `query_project_graph`; RAB and Schedule receive only their respective tool names.
- [ ] Run `pnpm --dir apps/web exec vitest run src/app/api/command-room/chat/connector-permissions.test.ts` and confirm failure before implementation.
- [ ] Implement typed connector allow-lists; require permissions to build a tool registry or project retrieval context.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Request and client context boundary

**Files:**
- Modify: `apps/web/src/lib/chat/chat-run-store.ts`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`
- Modify: `apps/web/src/lib/ai/project-context.ts`
- Modify: `apps/web/src/app/api/command-room/chat/route.ts`

- [ ] Pass the conversation connector state to the route as an explicit enum list.
- [ ] Replace the combined TKG/RAB pack with an RAB-only pack; Drawing Intelligence sends no legacy TKG or draft RAB text and relies on server PCKM retrieval.
- [ ] Validate the request on the server; only attach a `projectId` when the validated list is non-empty.
- [ ] Typecheck the web application.

### Task 3: PLHUT-only local runtime

**Files:**
- Reuse: `scripts/live_test/serve_db_with_fixture.py`

- [ ] Start the fixture service on port 8001; it creates exactly `PLHUT-SURAKARTA` and its PCKM snapshot from stored JSON.
- [ ] Start web with `NEXT_PUBLIC_USE_DB=true`, `DB_API_URL=http://127.0.0.1:8001`, and the fixture internal key.
- [ ] Verify `/api/db-projects/projects` returns only PLHUT and the Drawing Intelligence health proxy is reachable.

### Task 4: Regression verification

**Files:**
- Modify: `apps/web/src/app/api/command-room/chat/connector-permissions.test.ts`

- [ ] Run focused Vitest, web typecheck, complete web test suite, `git diff --check`, and `graphify update .`.
- [ ] Do not make provider/model calls: validation uses static tests plus local fixture endpoints only.
