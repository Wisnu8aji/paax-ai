# Mature Agentic Runner Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current agentic run skeleton into an auditable, idempotent, approval-gated assistant that can prepare evidence proposals but cannot calculate or silently mutate quantities.

**Architecture:** Extend existing `MatureAreteOrchestrator`, runtime types/store, budget manager and approval service with a persisted step execution loop. Registered scoped tools carry idempotency/audit records; an approved Engine adapter accepts MeasurementFact IDs and invokes Core Engine once per idempotency key, preserving `core_engine` authority.

**Tech Stack:** TypeScript, existing `@paax/ai-orchestrator`, Vitest, FastAPI contract tests.

## Global Constraints

* No agent tool calculates quantities or writes a final number.
* High-risk or mutation/tool actions wait for authorised human approval; retry is idempotent.
* Budget, token/cost, duration and tool-call limits fail closed and are recorded.
* Command Room protected files are not removed/moved; Graphify path/import evidence precedes changes.

---

### Task 1: Runtime transition, registered tools and idempotency records

**Files:**
- Modify: `services/ai-orchestrator/src/agentic/runtime-types.ts`
- Modify: `services/ai-orchestrator/src/agentic/state-machine.ts`
- Modify: `services/ai-orchestrator/src/agentic/runtime-store.ts`
- Create: `services/ai-orchestrator/src/agentic/idempotency.ts`
- Create: `services/ai-orchestrator/src/agentic/scoped-tools.ts`
- Create: `services/ai-orchestrator/src/agentic/core-engine-tool.ts`
- Create: `services/ai-orchestrator/tests/agentic/runtime-governance.test.ts`

**Interfaces:**
- Adds `AgentActionRecord { actionId, idempotencyKey, riskTier, approvalId?, budgetBefore, budgetAfter, inputHash, outputHash, status }` to `MatureAgentRun`.
- Produces `claimIdempotency(key, inputHash): 'new'|'replay'|'conflict'` and legal state transitions only.
- Produces registered `project_graph.read_active_sheet`, `drawing.review_proposal`, and `core_engine.calculate_measurement_facts` tools; only the latter has authoritative side effect and it accepts `{ projectId, measurementFactIds, idempotencyKey }`.

- [ ] Write failing tests for queuedâ†’planningâ†’waiting_approvalâ†’runningâ†’completed, invalid transitions, replay no-op, same key/different input conflict, append-only audit events, duplicate tool rejection, and registered-tool project scope.
- [ ] Run `pnpm --filter @paax/ai-orchestrator test -- runtime-governance.test.ts`; expected red.
- [ ] Implement transition guard, idempotency registry, scoped tool registration, and Core Engine adapter that forwards only measurement fact references; it must not deserialize/model-generate numeric engine inputs.
- [ ] Run focused tests and orchestrator typecheck; expected green. Commit as `feat(agentic): govern run transitions and replays`.

### Task 2: Persisted execution loop and step/run API

**Files:**
- Create: `services/ai-orchestrator/src/agentic/execution-loop.ts`
- Modify: `services/ai-orchestrator/src/agentic/mature-orchestrator.ts`
- Modify: `services/ai-orchestrator/src/routes/agent-runs.ts`
- Create: `services/ai-orchestrator/tests/agentic/execution-loop.test.ts`
- Create: `services/ai-orchestrator/tests/routes/agent-runs-step.test.ts`

**Interfaces:**
- Produces `executeNextStep(runId: string, expectedVersion: number): Promise<MatureAgentRun>` and `POST /agent-runs/:runId/step`.
- Each attempt appends `ToolInvocationRecord` before execution, persists running/succeeded/failed status, consumes budget, waits for approval for authoritative tools, and replays the stored result for identical idempotency input.

- [ ] Write failing loop tests for a read tool completion, a calculation step waiting for approval, approved calculation calling the adapter once, restart after persisted `waiting_tool`, timeout/failure record, and same idempotency key replay without a second Core Engine request.
- [ ] Run focused tests; expected red because routes currently create/transition runs but execute no plan step and register no tools.
- [ ] Implement one-task-at-a-time plan execution, persisted invocation events and step endpoint; reject arbitrary tool name/input from the browser.
- [ ] Run focused route/agentic tests and typecheck; expected green. Commit as `feat(agentic): execute persisted scoped run steps`.

### Task 3: Approval, budget and Engine-bound tool policy

**Files:**
- Modify: `services/ai-orchestrator/src/agentic/mature-orchestrator.ts`
- Modify: `services/ai-orchestrator/src/agentic/approval-service.ts`
- Modify: `services/ai-orchestrator/src/agentic/budget-sandbox.ts`
- Modify: `services/ai-orchestrator/src/agentic/tool-contract.ts`
- Create: `services/ai-orchestrator/src/agentic/quantity-tool-policy.ts`
- Create: `services/ai-orchestrator/tests/agentic/quantity-tool-policy.test.ts`

**Interfaces:**
- Produces `authorizeQuantityAction(action, approval, budget) -> 'allowed'|'waiting_approval'|'blocked'`.
- A permitted quantity tool accepts only `MeasurementFact` references and returns an Engine response tagged `sourceAuthority: 'core_engine'`; it cannot accept LLM numeric text.

- [ ] Write failing tests for R3/R4 role requirement, expired/rejected approval, each exhausted budget dimension, prohibited direct number payload, and engine result authority.
- [ ] Run focused tests; expected red.
- [ ] Implement tool policy and wire it before tool execution in the mature orchestrator; log every decision, including denial.
- [ ] Run all agentic tests and `pnpm --filter @paax/ai-orchestrator exec tsc --noEmit`; expected green. Commit as `feat(agentic): gate quantity tools by approval`.

### Task 4: Mission UI and end-to-end governed run

**Files:**
- Modify: `services/ai-orchestrator/src/routes/agent-runs.ts`
- Modify: `apps/web/src/app/api/agent-runs/route.ts`
- Modify: `apps/web/src/app/api/agent-runs/[runId]/route.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/agentic/mission-control.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/agentic/mission-control.test.tsx`
- Create: `apps/web/e2e/drawing-intelligence-agentic-approval.spec.ts`

**Interfaces:**
- Mission UI renders run state, remaining budget, audit timeline, approval request and retry/replay result.
- API accepts/returns `MatureAgentRun`; browser approval requires an allowed role from the test fixture.

- [ ] Write failing route/UI tests for backend error recovery, waiting-approval state, audit timeline, denied approval, and replay badge.
- [ ] Implement routes/UI without exposing tool secret input or unredacted prompt data.
- [ ] Run Playwright using real web/orchestrator routes and a fake Engine service: proposal waits, approval releases one call, replay performs no second call, and final UI shows `core_engine` authority.
- [ ] Visually inspect Mission state transitions. Commit as `feat(agentic): connect governed mission control`.


