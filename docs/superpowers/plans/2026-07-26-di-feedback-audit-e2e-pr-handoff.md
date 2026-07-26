# Drawing Intelligence Feedback Audit, E2E and PR Handoff Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently verify every Feedback 1 requirement with real service/browser evidence and prepare a reviewable branch/PR without merging main.

**Architecture:** Test in layers: offline deterministic units/contracts, real local service integration, actual browser E2E and visual inspection, then a separately approved bounded live-AI comparison. An audit report maps P2-P62 to durable evidence paths and honest limitations.

**Tech Stack:** pytest, Vitest, Playwright, PowerShell, Markdown/JSON reports.

## Global Constraints

* Preserve the dirty worktree; create a new `codex/` branch only after owner approves implementation.
* Every calculation test asserts Core Engine origin and `sourceAuthority`; no mock-only success is sufficient for E2E.
* Browser viewer/sheet E2E uses `G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf` (53 pages). Quantity/engine E2E uses existing PLHUT PDF plus DEM/PCKM artifacts read-only; it never invokes their 88-page transcription/extraction pipeline.
* Live model benchmark is last, cap 30, and its result is advisoryâ€”not an automatic production routing change.

---

### Task 1: Offline matrix and fixture integrity

**Files:**
- Create: `scripts/quality/feedback1_matrix.py`
- Create: `scripts/quality/feedback1_matrix.json`
- Create: `scripts/quality/run_feedback1_offline.ps1`
- Create: `services/document-intelligence/tests/test_feedback1_offline_contracts.py`
- Create: `services/core-engine/tests/test_feedback1_engine_authority.py`
- Create: `apps/web/src/components/drawing-intelligence/workspace/__tests__/feedback1-ui-contracts.test.tsx`

**Interfaces:**
- Produces `FeedbackEvidence { paragraph, requirement, command, artifact, status, limitation }` for P2 through P62, including paragraph ranges P9-P27, P28-P48 and P49-P57.
- Offline runner returns nonzero when an expected mapping, command or artifact is missing.

- [ ] Write failing matrix validation tests requiring all paragraphs 2..62, no duplicate paragraph, explicit real-browser evidence for P2-P8/P59-P61, engine authority for P5/P7/P60, and benchmark ledger fields for P62.
- [ ] Run `python scripts/quality/feedback1_matrix.py --check`; expected red because matrix files are new.
- [ ] Implement static matrix and offline runner invoking focused pytest/Vitest/schema/typecheck commands with network disabled.
- [ ] Run offline runner; expected green before any browser/live-AI task. Commit as `test(di): add Feedback 1 offline audit matrix`.

### Task 2: Real service and browser quality gate

**Files:**
- Create: `scripts/live_test/start_feedback1_stack.ps1`
- Create: `apps/web/e2e/feedback1-real-stack.spec.ts`
- Create: `apps/web/e2e/feedback1-visual-checklist.md`
- Modify: `package.json`
- Modify: `apps/web/package.json`

**Interfaces:**
- `start_feedback1_stack.ps1` starts Core Engine, document-intelligence and web with fixture-only config, health-checks each port, and writes process IDs to a task-local report.
- Playwright asserts backend network responses and page states, not screenshots alone.

- [ ] Write E2E assertions for original PDF response range headers, real 53-page navigator thumbnails and three sheet views; separately load read-only PLHUT DEM/PCKM artifacts for lossless candidate inventory, formula-free quantity source labels, review reason, handoff rejection/approval and an actual local Core Engine calculation response.
- [ ] Run the suite before implementation; expected red only for unimplemented acceptance conditions, with failures retained as baseline.
- [ ] Add scripts and package commands `test:e2e:feedback1` and `test:visual:feedback1` that never include a provider key.
- [ ] Run real-stack E2E after all subsystem plans are green, then inspect the viewer/sheets/takeoff/quantities/mission/handoff screens at 1440px and 390px following the checklist. Fail if an E2E test substitutes a fake Engine for final quantity authority.
- [ ] Attach trace, screenshot and response-log references to the matrix. Commit as `test(di): verify Feedback 1 in real browser`.

### Task 3: Controlled live benchmark, final audit and PR handoff

**Files:**
- Create: `report/report_drawing_intelligence/FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md`
- Create: `report/report_drawing_intelligence/FEEDBACK1_AI_BENCHMARK_2026-07-26.json`
- Modify: `docs/ai-map/STATE_CURRENT.md`
- Modify: `README.md`

**Interfaces:**
- Final report has one row per P2-P62: implemented behaviour, automated evidence, visual evidence, current status and limitation.
- Benchmark JSON has exactly 30 non-secret ledger records with model, case, prompt_version, token fields, cost, latency, proposal, deterministic_validation and outcome.

- [ ] Validate report schema against the feedback matrix; fail if any P2-P62 item lacks evidence or is reported as complete while its test failed.
- [ ] Run controlled benchmark after offline/browser gates are green; stop immediately on cap, timeout or DI-key absence and record the reason.
- [ ] Write the report using actual commands/results only; list unsupported formula categories as blocked/review and never claim universal calculation coverage without an engine contract.
- [ ] Run `graphify update .`, re-run complete affected suites, inspect `git diff --check`, and verify no secrets/generated artifacts are staged.
- [ ] Create branch `codex/drawing-intelligence-feedback1-remediation`, commit scoped changes, push, open draft PR, and stop for owner/Claude review; do not merge main.


