# Command Room Comprehensive Runtime Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Command Room Worker API/model contracts consistent with the configured `opencode-go / mimo-v2.5` runtime, then verify the complete Phase 1–10 flow with 20 real test cases and screenshot evidence.

**Architecture:** Keep the canonical Work execution path on `services/ai-orchestrator` gateway endpoints and preserve the existing web SSE contracts. Add the requested `/api/chat` compatibility path to the existing orchestrator chat handler, and align the legacy web Chat model receipt/direct provider defaults with the already configured Mimo profile without changing tool authority or session binding semantics.

**Tech Stack:** TypeScript, Express, Next.js 15, Vitest, Corepack pnpm, real `tsx` runtime, `opencode-go` OpenAI-compatible transport, browser-client UI automation, and the requested `ss_codex.py` screenshot utility.

**Spec:** User dispatch `DISPATCH — WORKER — REAL COMPREHENSIVE TEST (Luna)` and `D:\PAAX-Orchestration\00_projects\2026-08-17-command-room-worker-full-ai-agent\05_OWNER_AUTHORIZATION_RUNTIME.md`.

## Global Constraints

- Work only in `D:\paax-ai-command-room-worker`; never touch `D:\paax-ai-main`.
- Use the configured real model `mimo-v2.5` through `opencode-go`; do not print or persist secrets.
- Preserve the pre-existing `tool-executor.ts` working-tree fix and add regression evidence for sessions with and without `projectId`.
- Keep final numeric authority and tool results in the existing service/core-engine boundaries.
- Use tests before production changes, refresh affected Graphify output after code changes, and do not commit, push, branch, or open a PR.
- Produce `docs/ai-map/COMPREHENSIVE_TEST_REPORT.md` and at least 20 uniquely named screenshots.

### Task 1: Add the missing orchestrator API compatibility route

**Files:**
- Modify: `services/ai-orchestrator/src/index.ts:350-372`
- Create: `services/ai-orchestrator/tests/integration/api-chat-contract.test.ts`

**Interfaces:**
- Consumes: the existing `createChatHandler` and authenticated Express app composition.
- Produces: `POST /api/chat` with the same request/response behavior as `POST /chat`; malformed input remains HTTP 400 and missing Gemini remains the existing local fallback.

- [ ] Write an integration test that starts `createApp` with a temporary runtime, enables the existing internal-key compatibility auth, posts `{ message: "halo" }` to `/api/chat`, and asserts HTTP 200 plus the local fallback payload when no Gemini key is configured.
- [ ] Run `corepack pnpm --dir services/ai-orchestrator exec vitest run tests/integration/api-chat-contract.test.ts` and confirm it fails with 404 before implementation.
- [ ] Register `/api/chat` with the same middleware and handler as `/chat`.
- [ ] Re-run the focused test and then the existing orchestrator route/integration tests.

### Task 2: Align legacy web Chat receipts and direct model defaults with Mimo

**Files:**
- Modify: `apps/web/src/lib/paax-models.ts:4-90`
- Modify: `apps/web/src/lib/paax-models.test.ts`
- Modify: `apps/web/src/app/api/command-room/chat/route.ts:1-186,278-395,970-981`
- Modify: `apps/web/src/app/api/command-room/chat/route.test.ts`

**Interfaces:**
- Consumes: `apps/web/.env.local` profile `lucent -> provider opencode-go, model mimo-v2.5` and the existing Chat SSE/tool loop.
- Produces: Chat catalog receipts that identify `opencode-go / mimo-v2.5`, with direct provider payloads using the configured Mimo model while preserving aliases, tool loop, SSE, and graceful fallback behavior.

- [ ] Change model/route contract assertions to require `opencode-go` and `mimo-v2.5`; run the focused web tests and confirm the new assertions fail against the current DeepSeek metadata.
- [ ] Update the model provider type/definitions and provider/model resolution minimally; prefer the configured `PAAX_MODEL_PROFILES_JSON` model for Lucent and use `mimo-v2.5` as the safe default when the profile is absent.
- [ ] Add a route-level receipt test that calls `GET()` with a configured key and asserts the Lucent catalog entry exposes provider `opencode-go`, model `mimo-v2.5`, and `ready: true`.
- [ ] Run the focused web tests, typecheck, and route tests before live testing.

### Task 3: Verify the inherited tool-binding fix

**Files:**
- Modify: `services/ai-orchestrator/tests/agent/tool-executor.test.ts`
- Preserve unchanged: `services/ai-orchestrator/src/agent/tool-executor.ts` working-tree edit.

**Interfaces:**
- Consumes: the existing `ToolExecutor`, `TurnContext`, and `ProjectContextBinding` contracts.
- Produces: a regression assertion that an unbound turn (`context.projectId` absent) does not fail only because the executor binding has a project fallback, while a conflicting explicit project still returns `tool_binding_conflict`.

- [ ] Add the smallest two-case regression test using the existing real tool executor and context helpers.
- [ ] Run it against the current working-tree implementation and record both results.
- [ ] Run the full orchestrator test suite to detect regressions.

### Task 4: Execute and capture the real 20-case matrix

**Files:**
- Create: `docs/ai-map/COMPREHENSIVE_TEST_REPORT.md`
- Create: `docs/ai-map/comprehensive-screenshots/case-01-*.png` through `case-20-*.png`
- Runtime evidence: `.comprehensive-runtime/logs/*` (not a source contract)

**Interfaces:**
- Consumes: live orchestrator on `127.0.0.1:8082`, Next web app on `127.0.0.1:3000`, real Mimo provider credentials already configured in `apps/web/.env.local`, and browser/UI state.
- Produces: status/evidence for every required test, provider receipt, raw endpoint status/SSE evidence, 20 screenshot paths, severity-ranked bug list, and recommendations.

- [ ] Start/verify the orchestrator health endpoint and web readiness; record cold-start compile time separately from request failures.
- [ ] Verify prepare receipt alias `lucent`, provider `opencode-go`, model `mimo-v2.5`, transport `openai-compatible`.
- [ ] Run the UI Chat/Work/tab/session scenarios with real AI responses and capture one screenshot per case.
- [ ] Run tool calls with and without `projectId`, API prepare/stream, empty/invalid payloads, refresh/new-tab persistence, and the end-to-end workflow.
- [ ] Use the browser screenshot capability and invoke `python C:\Users\ajiwi\AppData\Local\hermes\profiles\iris\cache\ss_codex.py` for the required desktop screenshot evidence without replacing browser-target screenshots.
- [ ] Write the report only after fresh test output and screenshot file existence checks.

### Task 5: Refresh Graphify and verify before handoff

**Files:**
- Refresh: affected `apps/web/graphify-out/` and `services/ai-orchestrator/graphify-out/` outputs.
- Verify: report, focused tests, full relevant suites, and runtime evidence.

- [ ] Run Graphify code-only refresh for both modified modules and record freshness.
- [ ] Run fresh focused tests, orchestrator tests, web tests/typecheck, and live endpoint checks.
- [ ] Confirm the report has exactly 20 case rows and 20 existing screenshot paths, then hand off without VCS mutation.
