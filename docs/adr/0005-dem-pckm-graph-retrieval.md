# ADR 0005: Drawing Evidence Model (DEM) and Project Construction Knowledge Model (PCKM)

## Status
Accepted

## Context
PAAX's Drawing Intelligence pipeline today produces a single `ConsolidatedExtraction`
(`services/document-intelligence/app/perception/consolidated_models.py`) per document —
one flat registry of elements with no per-page evidence trail and no graph-native
relationships between sheets. Vision extraction is also gated: `is_raster_sheet()`
(`app/perception/ingest/raster_detector.py`) only calls vision AI for sheets proven to
be scanned/photographed; vector-native PDFs (the majority of real drawing sets,
including the PLHUT fixture) go through PyMuPDF vector + regex/grammar only, so vision
AI currently has no role in the primary extraction path for most real drawings.

The owner wants Command Room to answer project questions grounded in evidence that
traces back to a specific sheet/page/bbox, using a Graphify-style scoped retrieval
(BFS/DFS/path/explain, seed scoring, token budget) instead of injecting entire project
context into every chat turn — while keeping the Golden Rule (`CLAUDE.md` §1) intact:
AI never computes final RAB/BOQ/volume numbers, only classifies/extracts/links.

## Decision
Introduce two new data models, evidence-backed and graph-native from the start:

1. **Drawing Evidence Model (DEM)** — one record per drawing sheet/page, `schema_version:
   "paax.dem.sheet.v1"`. Raw transcript only: no cross-page merging, no computed
   quantities, every fact carries `evidence_refs` + `confidence` + `status`
   (`extracted | ai_interpreted | ambiguous | conflicting | missing | human_verified`).
2. **Project Construction Knowledge Model (PCKM)** — project-level graph
   (`schema_version: "paax.pckm.graph.v1"`) built by normalizing/linking DEM records:
   nodes (project/spatial/construction/information taxonomy), edges (`CONTAINS`,
   `LOCATED_ON`, `INSTANCE_OF`, etc.), aliases, conflicts, immutable snapshots.

Both models are defined once in Pydantic (`services/document-intelligence/app/
transcription/models.py` for DEM, `app/project_graph/models.py` for PCKM) and mirrored
in Zod (`packages/schemas/src/index.ts`), following the same pairing convention already
used for TKG. This phase (Phase 0+1 of the larger DEM/PCKM plan) ships schemas only —
no model/provider wiring, no DB persistence, no Command Room integration yet. Full
rationale, node/edge taxonomy, retrieval architecture, and 8-phase rollout are in
`docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`.

## Consequences

### Positive
- DEM's evidence-first design makes every AI claim auditable back to a page/bbox,
  satisfying `CLAUDE.md` §1.1's audit trail requirement before any vision-extraction
  code is written.
- PCKM's graph-native shape (nodes/edges, not one big document) lets Command Room
  retrieval stay scoped and token-cheap from day one, instead of retrofitting graph
  structure onto a flat model later.
- Schema-first sequencing (this phase) means Phase 2 (DEM job orchestrator) and Phase 3
  (PCKM synthesis engine) both build against a frozen contract instead of guessing at
  shapes while the pipeline is also being built.

### Negative
- Two more Pydantic/Zod pairs to keep in sync going forward (existing pattern, but more
  surface area — TKG + RAB/HSP/CPM + DEM + PCKM).
- DEM/PCKM do not replace `ConsolidatedExtraction`/`TkgDocument` in this phase — until
  Phase 6/7 migration work lands, the codebase carries three overlapping "what did we
  extract from this drawing" shapes (`ConsolidatedExtraction`, `TkgDocument`, DEM). This
  is accepted short-term technical debt, not silently ignored: Phase 3's exit criteria
  explicitly includes a legacy TKG export path, and Phase 6/7 own retiring the older
  shapes.
