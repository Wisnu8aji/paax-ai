> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# PCKM Phases 3-6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic PCKM synthesis, project-scoped retrieval, grounded Command Room integration, and production hardening from the existing 88-page DEM fixture without rerunning image extraction.

**Architecture:** DEM JSON remains immutable input. Document Intelligence builds and validates PCKM snapshots, the database stores immutable snapshots and activates one atomically, the orchestrator performs vocabulary-bound retrieval, and Command Room only explains retrieved facts with citations. RAB and schedule computations remain exclusively in Core Engine; Phase 7 stays gated until the owner confirms Phase 5 stability.

**Tech Stack:** Python 3.13, Pydantic 2, FastAPI, SQLAlchemy/Alembic, PostgreSQL/SQLite tests, TypeScript, Zod, Jest/Vitest, Next.js, Graphify.

## Global Constraints

- Never rerun the 88 page images or call the vision provider for the PLHUT fixture; read the stored JSON files only.
- No LLM or TypeScript code may calculate RAB, BoQ, HSP, volume, duration, schedule, or scenario numbers.
- Pydantic and Zod schema changes must be committed together.
- PCKM snapshots are immutable; activation is atomic and preserves superseded snapshots.
- Retrieval is always project-scoped and may expand only to vocabulary or aliases present in the active graph.
- Ambiguous links remain `POSSIBLY_SAME_AS` with `AMBIGUOUS` confidence and require review.
- Every factual Command Room answer carries sheet/page citations; missing graph data yields `ungrounded` or `not_ready`.
- Existing Command Room files are modified in place only; none are removed or moved.
- The real fixture anchors are J2 pages 21/22/27, BV1 pages 21/22/23, RB3 pages 44/54/55/56, and the dimension conflict on page 81.
- The relation allowlist uses schema relation `SERVES`; the source document's `SERVED_BY` example is represented by reverse traversal of `SERVES`.
- Provider usage capture is required from the first DeepSeek call and must include prompt, completion, cached, and reasoning token counts when supplied.
- No secret or API-key value may be logged, committed, or included in reports.
- Commit messages and newly committed file content must not contain prohibited model/tool attribution terms requested by the owner.

---

### Task 1: Fixture Audit, Discipline Normalization, and Risk Calibration

**Files:**
- Create: `services/document-intelligence/app/project_graph/fixture_audit.py`
- Create: `services/document-intelligence/app/project_graph/normalizer.py`
- Create: `services/document-intelligence/tests/test_project_graph_fixture_audit.py`
- Create: `report/report_drawing_intelligence/PCKM_FASE_3_FIXTURE_AUDIT_2026-07-15.md`

**Interfaces:**
- Produces: `normalize_discipline(value: str) -> str`, `normalize_element_code(value: str) -> str`, `audit_fixture(paths: Iterable[Path]) -> FixtureAudit`, and `score_resolution_risk(signals: ResolutionRiskSignals) -> ResolutionRisk`.
- Produces standard disciplines: `architecture`, `structure`, `mep`, `site`, `general`.

- [ ] Write failing tests that enumerate all 88 discipline values, prove every observed value maps to a standard discipline or an explicit unresolved bucket, and assert the known J2/BV1/RB3 normalization examples.
- [ ] Write failing tests that count dangling references by top-level section and reproduce `839 / 3807` across `47 / 88` pages without modifying fixture JSON.
- [ ] Write failing tests for risk weights `ambiguity=0.30`, `conflict=0.30`, `fanout=0.15`, `cross_discipline=0.15`, and `low_evidence=0.10`; explicit escalation conditions remain authoritative.
- [ ] Run `python -m pytest tests/test_project_graph_fixture_audit.py -q` and record RED output.
- [ ] Implement structured JSON traversal, full discipline dictionary coverage, code normalization, and risk-distribution reporting.
- [ ] Generate the audit report with discipline mapping, dangling-reference distribution by observation category, merge candidate counts, risk-score distribution, and escalation percentage.
- [ ] Run the focused test and the full document-intelligence suite; record GREEN output.
- [ ] Commit only Task 1 files with subject `feat(doc-intel): add PCKM fixture audit and normalization`.

### Task 2: Sheet Knowledge Patch and Provider Contracts

**Files:**
- Create: `services/document-intelligence/app/project_graph/synthesis_types.py`
- Create: `services/document-intelligence/app/project_graph/page_patch.py`
- Create: `services/document-intelligence/app/project_graph/providers/__init__.py`
- Create: `services/document-intelligence/app/project_graph/providers/base.py`
- Create: `services/document-intelligence/app/project_graph/providers/deepseek.py`
- Create: `services/document-intelligence/tests/test_project_graph_page_patch.py`
- Create: `services/document-intelligence/tests/test_project_graph_providers.py`

**Interfaces:**
- Consumes: `normalize_discipline()` and `normalize_element_code()` from Task 1.
- Produces: `build_sheet_patch(sheet: DrawingEvidenceSheet) -> SheetKnowledgePatch`.
- Produces: `PckmProviderResult(payload: dict, usage: ModelUsage, model: str, latency_ms: int)` and `PckmSynthesisProvider.resolve(candidate: ResolutionCandidate) -> PckmProviderResult`.

- [ ] Write failing tests proving patches retain facts whose evidence references are dangling, while `NodeSourceRef.evidence_refs` keeps only evidence IDs present on that sheet.
- [ ] Write failing tests proving element labels, dimensions, materials, grids, levels, spaces, symbols, tables, sheet identity, conflicts, and unresolved references are represented.
- [ ] Write provider contract tests using mocked HTTP responses with and without `usage`, including retryable 429/5xx and permanent 4xx classification.
- [ ] Run focused tests and record RED output.
- [ ] Implement focused internal models, deterministic patch building, provider routing aliases `deepseek-v4-flash` and `deepseek-v4-pro`, bounded exponential backoff, and usage capture.
- [ ] Run focused tests and the full document-intelligence suite; record GREEN output.
- [ ] Commit only Task 2 files with subject `feat(doc-intel): add PCKM sheet patches and provider contracts`.

### Task 3: Deterministic Resolver, Conflict Registry, and Snapshot Builder

**Files:**
- Create: `services/document-intelligence/app/project_graph/alias_resolver.py`
- Create: `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
- Create: `services/document-intelligence/app/project_graph/conflict_resolver.py`
- Create: `services/document-intelligence/app/project_graph/community_builder.py`
- Create: `services/document-intelligence/app/project_graph/summary_builder.py`
- Create: `services/document-intelligence/app/project_graph/validator.py`
- Create: `services/document-intelligence/app/project_graph/synthesis.py`
- Create: `services/document-intelligence/tests/test_project_graph_synthesis.py`
- Create: `services/document-intelligence/tests/test_project_graph_real_fixture.py`

**Interfaces:**
- Consumes: `SheetKnowledgePatch` and provider contracts from Task 2.
- Produces: `synthesize_project_graph(sheets: Sequence[DrawingEvidenceSheet], provider: PckmSynthesisProvider | None = None) -> SynthesisResult`.
- Produces one type node per discipline-normalized code; occurrence nodes merge only when type, explicit level, and explicit spatial context all agree.

- [ ] Write failing unit tests for type-versus-occurrence identity, conservative occurrence merging, `SAME_AS`, `POSSIBLY_SAME_AS`, resolver audit metadata, and stable deterministic IDs.
- [ ] Write failing tests proving multiple plausible locations do not abort a snapshot: keep one active `LOCATED_ON`, preserve alternate candidates as ambiguous review links, and register missing information.
- [ ] Write real-fixture failing tests asserting one J2 node with pages 21/22/27, one BV1 node with pages 21/22/23, one RB3 node with pages 44/54/55/56, and a page-81 conflict node with `CONFLICTS_WITH`.
- [ ] Run focused tests and record RED output.
- [ ] Implement community merge, exact/alias candidate resolution, conservative occurrence handling, risk escalation decisions, conflict lifting, summary views, and final invariant validation.
- [ ] Run synthesis over all stored JSON pages, save only derived audit statistics, and assert merge/escalation distributions are not degenerate.
- [ ] Run focused tests and the full document-intelligence suite; record GREEN output.
- [ ] Commit only Task 3 files with subject `feat(doc-intel): add deterministic PCKM synthesis`.

### Task 4: PCKM Persistence, Atomic Activation, and Build API

**Files:**
- Create: `services/db/alembic/versions/0009_project_graph.py`
- Modify: `services/db/src/paax_db/models.py`
- Modify: `services/db/src/paax_db/schemas.py`
- Modify: `services/db/src/paax_db/main.py`
- Create: `services/db/tests/test_project_graph.py`
- Create: `services/document-intelligence/app/project_graph/db_client.py`
- Create: `services/document-intelligence/app/project_graph/service.py`
- Create: `services/document-intelligence/app/api/project_graph_routes.py`
- Modify: `services/document-intelligence/app/main.py`
- Create: `services/document-intelligence/tests/test_project_graph_db_client.py`
- Create: `services/document-intelligence/tests/test_project_graph_routes.py`

**Interfaces:**
- Produces immutable snapshot, node, edge, evidence, node-evidence, edge-evidence, alias, community, and query-log storage.
- Produces `POST /projects/{project_id}/graph/build`, `GET /projects/{project_id}/graph/status`, `GET /projects/{project_id}/graph/snapshots`, and `POST /projects/{project_id}/graph/snapshots/{snapshot_id}/activate`.

- [ ] Write failing migration/model tests for all tables, foreign keys, uniqueness, project indexes, and SQLite-compatible JSON behavior.
- [ ] Write failing repository tests proving build writes an inactive complete snapshot, validation precedes activation, activation supersedes the previous current snapshot in one transaction, and rollback preserves the old active snapshot.
- [ ] Write failing route/client tests proving project scope, auth headers, active snapshot lookup, and build from existing DEM page results without invoking extraction.
- [ ] Run focused tests and record RED output.
- [ ] Implement migration, persistence schemas/routes, document-intelligence client/service/routes, and response models.
- [ ] Run both service suites plus Alembic migration tests; record GREEN output.
- [ ] Commit Task 4 files with subject `feat(db): add immutable PCKM snapshot storage`.

### Task 5: Project-Scoped Retrieval Engine and Benchmark

**Files:**
- Create: `services/ai-orchestrator/src/project-graph/types.ts`
- Create: `services/ai-orchestrator/src/project-graph/repository.ts`
- Create: `services/ai-orchestrator/src/project-graph/query-planner.ts`
- Create: `services/ai-orchestrator/src/project-graph/query-expander.ts`
- Create: `services/ai-orchestrator/src/project-graph/seed-scorer.ts`
- Create: `services/ai-orchestrator/src/project-graph/traversal.ts`
- Create: `services/ai-orchestrator/src/project-graph/evidence-hydrator.ts`
- Create: `services/ai-orchestrator/src/project-graph/context-budget.ts`
- Create: `services/ai-orchestrator/src/project-graph/retrieval.ts`
- Create: `services/ai-orchestrator/tests/project-graph/retrieval.test.ts`
- Create: `services/ai-orchestrator/tests/project-graph/plhut-benchmark.test.ts`

**Interfaces:**
- Consumes active graph records from Task 4.
- Produces `retrieveProjectGraph(request: RetrievalRequest, repository: ProjectGraphRepository) -> Promise<RetrievalResult>`.
- Produces bounded expansion audit `{original_terms, expanded_terms, expansion_sources}` and exact traversal modes `bfs`, `dfs`, `shortest_path`, `direct_lookup`.

- [ ] Write failing tests for all intent classes, vocabulary-bound expansion, canonical seed deduplication, explicit scoring terms, and project isolation.
- [ ] Write failing traversal tests for intent-specific relation allowlists, including reverse `SERVES` semantics for space queries.
- [ ] Write failing evidence hydration tests that normalize pixel bboxes using sheet dimensions and fetch evidence only after node selection.
- [ ] Write failing budget tests preserving the required priority order and rejecting full-graph context injection.
- [ ] Write PLHUT benchmark tests for J2/BV1/RB3/page-81 and `not_ready` RAB/schedule intents.
- [ ] Run focused tests and record RED output.
- [ ] Implement repository, query planning, expansion, scoring, traversal, hydration, pruning, trace, and query logging.
- [ ] Run orchestrator typecheck/tests and record GREEN output.
- [ ] Commit Task 5 files with subject `feat(orchestrator): add project graph retrieval`.

### Task 6: Command Room Project-Graph Tools

**Files:**
- Create: `services/ai-orchestrator/src/project-graph/tools.ts`
- Modify: `services/ai-orchestrator/src/tools/registry.ts`
- Modify: `services/ai-orchestrator/src/tools-entry.ts`
- Modify: `services/ai-orchestrator/src/tools/types.ts`
- Create: `services/ai-orchestrator/tests/tools/project_graph.test.ts`
- Modify: `apps/web/src/app/api/command-room/chat/tools.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces tools `get_project_overview`, `search_project_graph`, `get_graph_node`, `expand_graph_neighbors`, `find_graph_path`, `get_graph_evidence`, and `get_project_conflicts`.
- All tools require `project_id`, use authenticated server-side fetch, and return structured not-ready results when no active snapshot exists.

- [ ] Use Graphify path and import search to prove protected tool-registry dependencies before editing.
- [ ] Write failing tool tests for declaration schemas, project scope, auth propagation, bounded outputs, unavailable graph behavior, and error handling.
- [ ] Run focused tests and record RED output.
- [ ] Implement tool definitions and registry wiring without removing existing Command Room tools.
- [ ] Update `.env.example` with placeholder-only graph service configuration.
- [ ] Run orchestrator tests/typecheck and protected Command Room route tests; record GREEN output.
- [ ] Commit Task 6 files with subject `feat(command-room): add project graph tools`.

### Task 7: Grounded Command Room Request, Context, Memory, Citations, and Sources UI

**Files:**
- Modify: `apps/web/src/app/api/command-room/chat/route.ts`
- Modify: `apps/web/src/app/api/command-room/chat/tools.ts`
- Modify: `apps/web/src/app/api/command-room/chat/route.test.ts`
- Create: `apps/web/src/lib/ai/retrieved-project-context.ts`
- Create: `apps/web/src/lib/ai/retrieved-project-context.test.ts`
- Modify: `apps/web/src/lib/chat/chat-run-store.ts`
- Modify: `apps/web/src/lib/chat/chat-stream-events.ts`
- Modify: `apps/web/src/lib/chat/use-chat-runs.ts`
- Modify: `apps/web/src/components/command-room/command-room-ui.ts`
- Modify: `apps/web/src/components/command-room/command-room-ui.test.ts`
- Modify: `apps/web/src/components/command-room/command-room.css`

**Interfaces:**
- Request adds `message` plus `retrieval: {mode, maxContextTokens, includeEvidence}` while retaining existing `messages` compatibility.
- SSE emits `retrieval_started`, `query_planned`, `graph_searched`, `evidence_loaded`, `context_ready`, `sources`, and existing content/done events.
- Conversation memory keeps 4-8 recent messages, structured summary, and `active_node_ids` only.

- [ ] Use Graphify path and import search before editing every protected Command Room surface.
- [ ] Write failing route tests for request compatibility, project scope, graph-not-ready, citation emission, context budget, and absence of full graph/TKG/RAB injection.
- [ ] Write failing store/event tests for retrieval phases, citations, trace, project ID, and snapshot ID.
- [ ] Write failing UI tests for source cards, page links, graph readiness, partial/ungrounded states, and non-overlapping responsive layout.
- [ ] Run focused tests and record RED output.
- [ ] Implement grounded context building, tool orchestration, memory window, SSE events, audit trace, and source UI with existing icon/design conventions.
- [ ] Run web typecheck/tests and Playwright or equivalent browser verification at desktop/mobile widths; record GREEN evidence.
- [ ] Commit Task 7 files with subject `feat(command-room): ground answers in project graph`.

### Task 8: Provider Usage, Rate Limits, Metrics, and Security Hardening

**Files:**
- Modify: `services/document-intelligence/app/transcription/models.py`
- Modify: `services/document-intelligence/app/transcription/providers/base.py`
- Modify: `services/document-intelligence/app/transcription/providers/qwen.py`
- Modify: `services/document-intelligence/app/transcription/page_loop.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`
- Modify: `services/document-intelligence/tests/test_dem_providers.py`
- Modify: `services/document-intelligence/tests/test_page_loop.py`
- Create: `services/document-intelligence/app/project_graph/metrics.py`
- Create: `services/document-intelligence/tests/test_project_graph_metrics.py`
- Modify: `services/db/src/paax_db/auth.py`
- Modify: `services/db/src/paax_db/main.py`
- Modify: `services/db/tests/test_project_graph.py`

**Interfaces:**
- `DemGeneration` gains optional integer fields `prompt_tokens`, `completion_tokens`, `cached_tokens`, and `reasoning_tokens` with matching Zod fields.
- Produces project-scoped metrics for synthesis, retrieval, citations, latency, and model usage without exposing secrets.

- [ ] Write failing Pydantic/Zod parity tests for all usage fields and zero/default behavior.
- [ ] Write failing provider/page-loop tests proving usage survives into stored DEM results without any real provider call.
- [ ] Write failing metrics tests for synthesis/retrieval counters and latency, and security tests for cross-project denial, malformed filters, and protected correction routes.
- [ ] Run focused tests and record RED output.
- [ ] Implement concurrency-safe provider result handling, token capture, metrics aggregation, sanitization, project access checks, and bounded rate limits/backoff.
- [ ] Run document-intelligence, database, schema, orchestrator, and web tests; record GREEN output.
- [ ] Commit Task 8 files with subject `feat(pckm): add usage metrics and security hardening`.

### Task 9: Human Correction and Immutable Graph Correction Workflow

**Files:**
- Create: `services/db/alembic/versions/0010_project_graph_corrections.py`
- Modify: `services/db/src/paax_db/models.py`
- Modify: `services/db/src/paax_db/schemas.py`
- Modify: `services/db/src/paax_db/main.py`
- Modify: `services/db/tests/test_project_graph.py`
- Create: `services/document-intelligence/app/project_graph/corrections.py`
- Create: `services/document-intelligence/tests/test_project_graph_corrections.py`
- Modify: `services/document-intelligence/app/api/project_graph_routes.py`

**Interfaces:**
- Produces append-only correction records and `apply_graph_correction(project_id, active_snapshot_id, correction) -> new_snapshot_id`.
- Corrections require estimator/PM/owner authorization and produce a new validated snapshot; they never mutate the active snapshot in place.

- [ ] Write failing tests for approve/reject correction decisions, role checks, stale snapshot rejection, correction audit data, and immutable clone/activate behavior.
- [ ] Run focused tests and record RED output.
- [ ] Implement correction persistence, deterministic patch application, full snapshot validation, and atomic activation.
- [ ] Run database and document-intelligence suites; record GREEN output.
- [ ] Commit Task 9 files with subject `feat(pckm): add immutable graph corrections`.

### Task 10: Continuous Benchmarks, Completion Audit, and Phase 7 Gate

**Files:**
- Create: `services/document-intelligence/tests/test_project_graph_88page_smoke.py`
- Create: `services/ai-orchestrator/tests/project-graph/accuracy-benchmark.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ai-map/STATE_CURRENT.md`
- Create: `report/report_drawing_intelligence/PCKM_FASE_3_SAMPAI_6_REPORT_2026-07-15.md`

**Interfaces:**
- CI runs deterministic fixture synthesis and retrieval benchmarks without provider/network/image calls.
- Phase 7 remains disabled until an explicit owner stability decision after Phase 5 evidence is reviewed.

- [ ] Write the 88-page smoke test proving every stored page is consumed once, a snapshot forms, anchors resolve, conflicts persist, and active snapshot queries succeed.
- [ ] Write the retrieval accuracy benchmark with expected node/source results, forbidden unrelated nodes, and explicit context budgets.
- [ ] Add deterministic benchmark commands to CI without secrets or external APIs.
- [ ] Run all affected service suites, typechecks, migration tests, and browser checks from a clean process state.
- [ ] Run `graphify update .` and verify hook health; do not stage Graphify outputs.
- [ ] Audit all local commits and changed committed file content for prohibited attribution terms, secrets, unrelated files, and accidental generated artifacts.
- [ ] Write the final report with requirements-to-evidence matrix, test counts, known limitations, Phase 7 gate state, commit list, and no unsupported completion claims.
- [ ] Commit Task 10 files with subject `test(pckm): add continuous graph benchmarks`.
