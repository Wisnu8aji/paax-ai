# Bounded AI Assist, Model Router and Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI a deterministic-validation fallback and run a separately authorised, auditable 15+15 model comparison without re-analysing PLHUT.

**Architecture:** Rule-based classification/evidence extraction returns a decision first. Only `abstain`/`ambiguous` creates a bounded proposal request. A provider-neutral router records every response in a ledger; validation is local and human approval remains required. Live benchmark inputs are a locked, small, pre-extracted text/coordinate fixture set.

**Tech Stack:** Python/Pydantic/httpx, existing `ai_assist` clients, pytest, local JSON fixtures.

## Global Constraints

* Normal tests run offline with fake clients and outbound-network guard.
* The benchmark total is exactly 30 attempts: 15 `deepseek-v4-pro` and 15 `qwen3.7-plus`; the ledger refuses attempt 31.
* API key is read only at runtime from `DRAWING_INTELLIGENCE_API_KEY`; no key/value appears in source, fixture, report or test output. This scope must reject `GEMINI_API_KEY`, NVIDIA keys and all Command Room provider keys rather than falling back to them.
* No image/pixel/88-page PLHUT analysis: requests use locked already-extracted text+bbox cases only.

---

### Task 1: Deterministic abstention and proposal audit contract

**Files:**
- Modify: `services/document-intelligence/app/perception/ai_assist/client.py`
- Create: `services/document-intelligence/app/perception/ai_assist/contracts.py`
- Create: `services/document-intelligence/app/perception/ai_assist/audit_ledger.py`
- Create: `services/document-intelligence/tests/test_ai_assist_abstention_and_audit.py`
- Modify: `services/document-intelligence/tests/test_perception_ai_assist.py`

**Interfaces:**
- Produces `AiAssistDecision { trigger: 'abstain'|'ambiguous', deterministic_reason, allowed_fields, evidence_refs }` and `AiProposalAudit { model, prompt_version, case_id, tokens, cost_usd, latency_ms, proposal, validation, outcome }`.
- Existing assist functions accept only pre-extracted text/coordinates and return `None` when fast-path rules are sufficient.

- [ ] Write failing tests for no provider invocation on deterministic success, missing evidence rejection, out-of-range/source-text rejection, immutable audit append, and user approval required before any candidate state changes.
- [ ] Run `cd services/document-intelligence; python -m pytest tests/test_ai_assist_abstention_and_audit.py tests/test_perception_ai_assist.py -q`; expected red.
- [ ] Implement contracts/audit ledger and adapt existing clients without changing their deterministic validators.
- [ ] Run focused tests with socket blocking; expected green. Commit as `feat(di): audit bounded AI proposals`.

### Task 2: Provider-neutral router and controlled 30-call benchmark

**Files:**
- Create: `services/document-intelligence/app/perception/ai_assist/model_router.py`
- Create: `services/document-intelligence/app/perception/ai_assist/benchmark_runner.py`
- Create: `services/document-intelligence/tests/fixtures/ai_assist/benchmark_cases.json`
- Create: `services/document-intelligence/tests/test_ai_assist_benchmark_runner.py`
- Create: `services/document-intelligence/scripts/run_ai_assist_benchmark.py`
- Modify: `.env.example`
- Create: `services/document-intelligence/tests/test_ai_assist_key_isolation.py`

**Interfaces:**
- Produces `run_benchmark(cases, router, ledger, max_attempts=30) -> BenchmarkSummary`; expected model allocation is exactly `{ deepseek-v4-pro: 15, qwen3.7-plus: 15 }`.
- Each case has `case_id`, extracted text/bboxes, task kind, expected deterministic validation result and no PDF/image path.

- [ ] Write failing offline tests for allocation, rejection after 30, per-model 15 cap, provider exception ledger entry, token/cost/latency persistence, and PLHUT path rejection.
- [ ] Write failing key-isolation tests that DI router construction fails when only `GEMINI_API_KEY`, NVIDIA or Command Room keys are present, succeeds only with injected `DRAWING_INTELLIGENCE_API_KEY`, and never passes an unrelated key into legacy client constructors.
- [ ] Run focused pytest; expected red because router/runner do not exist.
- [ ] Implement DI-only configuration injection and migrate/isolate legacy client construction behind that adapter; update `.env.example` with the DI variable name and no value. Do not change Command Room routing.
- [ ] Run offline suite; expected green and no HTTP traffic.
- [ ] After owner approval, execute the script once with the supplied environment only; preserve a redacted JSON/Markdown scorecard containing all ledger fields and no secret. Commit code/fixtures only as `feat(di): add controlled model benchmark`; do not commit the runtime ledger unless owner requests it.

### Task 3: Explainability and review visibility

**Files:**
- Modify: `apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/inspector/ai-proposal-review.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/inspector/ai-proposal-review.test.tsx`
- Create: `docs/drawing-intelligence/AI_ASSIST_AND_VISION_BOUNDARIES.md`

**Interfaces:**
- Review panel renders trigger, model, prompt version, evidence refs, deterministic validation and approve/reject action; it never renders a proposal as an engine quantity.

- [ ] Write failing tests for hidden proposal before abstention, validation failure, human approval controls, and no numeric total authority from a proposal.
- [ ] Implement panel and documentation explaining OCR, bbox, annotation, and why YOLO/DETR are deferred pending a labelled, measured gap.
- [ ] Run focused Vitest and browser inspection of review UI. Commit as `docs(di): explain bounded vision and AI review`.


