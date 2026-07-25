# PAAX Drawing Intelligence — Research, Implementation, and 88-Page Verification Report

**Tanggal:** 21 Juli 2026  
**Input utama:** PDF PLHUT 88 halaman, 88 DEM JSON, Big Plan riset Kreo/AI Takeoff, source PAAX terbaru.  
**Mode testing:** deterministic/offline; seluruh live AI provider key tidak digunakan.  
**Scope:** Drawing Intelligence saja. RAB dan schedule tidak dikembangkan dalam wave ini.

## 1. Executive conclusion

PAAX tidak diubah menjadi tiruan Kreo. Kreo dipakai sebagai benchmark minimum untuk document zoning, reference-based count, one-click measurement, find-similar, cross-reference, dan human review. Implementasi PAAX diarahkan lebih jauh melalui:

1. native vector geometry sebagai sumber utama untuk PDF CAD-export;
2. raster fallback yang eksplisit, bukan vision-only;
3. DEM sebagai evidence semantics per halaman;
4. vocabulary yang dipelajari dari legend/schedule proyek;
5. cross-sheet linking dengan provenance;
6. project-specific positive/hard-negative prototypes;
7. candidate work items dengan maturity dan missing information;
8. user delivery contract yang tidak menyamarkan kandidat sebagai kuantitas;
9. full 88-page deterministic benchmark;
10. frontend yang menampilkan backend truth dan tidak mengisi metadata palsu.

Hasil wave ini bukan klaim bahwa semua disiplin dan semua drawing di dunia sudah otomatis sempurna. Hasilnya adalah **otak Drawing Intelligence baseline yang nyata, teruji, dapat dikembangkan, dan jauh lebih tepat secara arsitektur daripada satu VLM yang diminta membaca seluruh dokumen sekaligus**.

## 2. Riset yang diadaptasi

Big Plan menunjukkan bahwa sistem kelas Kreo lebih masuk akal dipandang sebagai pipeline tool khusus daripada satu model vision. Fitur yang dipakai sebagai benchmark adalah plan zones, text/table extraction, one-click area/line, reference count, find-similar, cross-reference, dan review candidates.

Pola yang diadaptasi dan ditingkatkan:

| Benchmark industri | Implementasi/arah PAAX |
|---|---|
| Plan zones | Deterministic zone detection, zone-aware occurrence exclusion, future learned layout adapter |
| Auto Count | Project-specific vector prototype, positive and hard-negative examples, candidate-only count |
| One-Click Area | Closed native vector boundary, positive/negative points, raw geometry measurement |
| One-Click Line | Nearest native segment baseline, future connected-path reconstruction |
| Find Similar | Multi-example descriptor scoring with transparent reasons |
| Cross Reference | Code/alias → legend/schedule definition → occurrence, with evidence both sides |
| Agentic tools | Backend tools exposed to frontend, but no agent is allowed to become final measurement authority |
| Auto Measure | Planned discipline topology engines; current wave creates vector/evidence spine first |

Open-source/research patterns reviewed include document layout analysis, promptable segmentation, self-supervised visual descriptors, engineering OCR, floor-plan-to-graph, P&ID symbol detection, and connected-network extraction. Components are not blindly copied; licensing and production suitability must be reviewed before any external model is embedded.

## 3. Architecture implemented

```text
Raw PDF / raster / configured CAD converter
    ↓
Secure input preparation and modality routing
    ↓
Per-page native vector + native text profile
    ↓
Sheet identity + discipline + level + drawing type
    ↓
Plan zones: drawing / legend / schedule / notes / title block
    ↓
DEM fusion + conservative evidence-reference repair
    ↓
Project vocabulary from definitions and labels
    ↓
Cross-sheet occurrence-to-definition linking
    ↓
Vector candidates / project-specific prototypes
    ↓
Work-item candidate maturation + review queue
    ↓
Persisted package analysis + PCKM generation metadata
    ↓
Truthful frontend delivery and interactive tools
```

### Important boundary

Drawing Intelligence produces observations, candidate objects, source geometry, and accepted Drawing Objects after human review. It does **not** silently convert label count to physical count and does **not** produce final quantities.

## 4. PLHUT 88-page findings

### Input profile

- Pages: 88
- Native modality: 88 vector pages
- DEM coverage: 88/88
- Drawing types known: 88/88
- AI provider calls during benchmark: 0

### Semantic/evidence inventory

The original DEM package contains large evidence volume, including more than one thousand dimension observations, hundreds of labels, grids, symbols, materials, levels, spaces, and tables. Native PDF geometry is retained alongside this semantic layer.

### Package analysis output

- Vocabulary entries: 155
- Cross-sheet references: 271
- Detection candidates: 271
- Work-item candidates: 77
- Review tasks: 90
- Evidence references conservatively repaired: 166
  - linked to existing DEM evidence: 85
  - bridged to real native-PDF text evidence: 81
- Unresolved evidence links kept for review: 367
- Physical counts auto-accepted: 0
- Final quantities calculated by Drawing Intelligence: 0

### Per-page scorecard

A separate visual contact-sheet audit was performed across all 88 raw PDF thumbnails. The resolved sheet categories were broadly consistent with the visible plan/elevation/detail/MEP sequence; this is an additional sanity check, not a substitute for object-level manual ground truth.

- Pass: 51
- Review: 37
- Fail: 0
- All pages structurally analyzed: yes

A review status is not treated as a failed page. It indicates missing evidence, confidence, scale, geometry, or human confirmation.

### Concrete cross-sheet proof

On the second-floor column plan:

- K1A: 12 drawing-label observations
- K2: 3 drawing-label observations
- K3: 2 drawing-label observations

The column schedule resolves:

- K2: 250 × 600 mm
- K3: 250 × 400 mm

The system explicitly preserves the distinction:

```text
three K2 labels visible on the drawing
≠
three verified physical K2 columns
```

K1A is not silently mapped to K1 merely because K1 has a schedule dimension. It remains unresolved until evidence or reviewer action establishes that relationship.

## 5. Performance and benchmark

Latest deterministic run:

```text
Benchmark: 19 / 19 PASS
Pages: 88
Elapsed: approximately 20 seconds in fast mode
Live AI calls: 0
```

Fast mode defers heavy vector descriptors for all sheets and builds them only for interactive/scoped analysis. This keeps package indexing bounded while retaining deep tools on demand.

## 6. Major implementation details

### Input routing

- PDF is processed directly.
- PNG/JPG/TIFF is locally converted to PDF and routed to raster/OCR review.
- DWG/DXF requires an explicitly configured local converter command.
- Unsupported CAD does not pretend to succeed.

### Sheet and zone intelligence

- Sheet title, number, discipline, level, scale, and drawing type are derived from multiple evidence sources.
- Resolver no longer blindly accepts a generic project title when a specific view/title-block title is available.
- Legend/schedule/title/notes zones are excluded from occurrence count.

### Evidence repair

- Observation without evidence ref is first linked only to an existing DEM evidence object when text/spatial matching produces one clear candidate.
- A second deterministic bridge may use a real native-PDF text token or visual text line when its text and location clearly match the DEM observation.
- Native evidence receives a stable `native:<token_id>` reference and remains traceable to its source page and bbox.
- Ambiguous matches remain unresolved and enter review.
- No evidence object is invented and no unresolved observation is promoted merely to improve coverage.

### Project vocabulary

- Normalizes codes and semantic prefixes.
- Joins plan labels to definitions across sheets.
- Retains source page, bbox, attributes, confidence, and evidence refs.

### Project-specific detection

- Supports multiple positive examples.
- Supports hard-negative examples.
- Produces transparent positive/negative similarity reasons.
- Results remain candidates or needs-review.

### Interactive geometry

- One-Click Area uses actual closed vector geometry where available.
- One-Click Line returns actual source segment geometry.
- Measurements use raw PDF units until scale is confirmed.
- Find Similar uses project-specific vector signatures.

### Work-item maturation

Each candidate includes:

- category and project code;
- page/level;
- observed occurrence count;
- definition source;
- attributes such as dimensions;
- evidence refs;
- maturity status;
- missing information;
- review tasks;
- acceptance state.

### Runtime integration

- Durable synthesis can create package analysis before/alongside PCKM synthesis.
- Package analysis is saved as an artifact keyed to the DEM run.
- Package metrics and artifact references are included in generation metadata.
- Project DEM sheet API now returns real sheet metadata and source dimensions.
- Run-scoped vector tools are project-authorized and use the persisted source PDF.

### Frontend integration

The existing visual design is retained. Changes focus on truthfulness and behavior:

- unknown level no longer defaults to Floor 2;
- unknown discipline no longer becomes every discipline;
- file size, analysis date, confidence, revision, and sheet size are not fabricated;
- synthetic geometry is no longer generated for real backend sheets;
- package metrics and candidate work items can be shown in Intelligence Inspector;
- One-Click Area and One-Click Line can call authorized backend tools;
- analysis copy states that results are candidates requiring review.

## 7. Files added

### Drawing Intelligence engine

- `services/document-intelligence/app/drawing_intelligence/__init__.py`
- `models.py`
- `coordinates.py`
- `page_profiler.py`
- `plan_zones.py`
- `text_index.py`
- `sheet_identity.py`
- `dem_adapter.py`
- `evidence_repair.py`
- `vocabulary.py`
- `vector_index.py`
- `vector_geometry.py`
- `prototype_learning.py`
- `cross_reference.py`
- `work_items.py`
- `ingestion.py`
- `raster_fallback.py`
- `delivery.py`
- `pipeline.py`
- `benchmark.py`
- `page_scorecard.py`

### APIs and tests

- `services/document-intelligence/app/api/intelligence_routes.py`
- `services/document-intelligence/tests/test_drawing_intelligence_kreo_runtime.py`
- `services/document-intelligence/tests/test_drawing_intelligence_routes.py`

### Plan and reports

- `docs/research/KREO_AI_TAKEOFF_RESEARCH_SOURCE_2026-07-20.md`
- `docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_20_PHASES_2026-07-21.md`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json`
- `DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json`
- `DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.json`
- `DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.md`
- `DRAWING_INTELLIGENCE_RUN_LOG_2026-07-21.txt`
- this implementation report.

## 8. Existing files modified

- `services/document-intelligence/app/main.py`: register Drawing Intelligence API.
- `app/api/dem_routes.py`: analysis mode, package-intelligence view, run-scoped tools.
- `app/dem_job_handlers.py`: run package analysis during durable synthesis.
- `app/project_graph/synthesis_task.py`: carry Drawing Intelligence analysis metadata/artifact.
- Document Intelligence route/durable tests: cover new behavior.
- `services/db/src/paax_db/schemas.py`: real DEM sheet metadata response.
- `services/db/src/paax_db/main.py`: derive sheet number/title/discipline/level/scale/revision/confidence/source pixels from persisted DEM.
- `services/db/tests/test_dem_runs.py`: verify real metadata contract.
- Drawing Intelligence frontend API, state, sync, inspector, setup panel, canvas, toolbar, types, and mapping: consume real metadata/tools while preserving visual system.

No source file was deleted. Existing frontend layout/theme was not redesigned.

## 9. Test evidence

### Python

- Drawing Intelligence focused/API regression tests: 17 passed
- Document Intelligence full suite: 632 passed, 6 skipped
- Core Engine full suite: 295 passed
- Database full suite: 156 passed, 1 skipped
- PLHUT benchmark: 19/19 PASS

### TypeScript

- 213 TS/TSX files parsed with TypeScript 5.8.3
- Syntax diagnostics: 0

### Package behavior

- Entire 88-page PDF analyzed.
- Entire 88-page DEM set fused.
- No live AI provider used.
- No physical count auto-approved.
- No final quantity calculated by Drawing Intelligence.

## 10. Honest limitations

1. **Not universal perfection.** PLHUT is one project. A second project with different consultant style is required to measure generalization.
2. **DEM is not independent ground truth.** The current benchmark verifies consistency and known facts. Precision/recall requires manual annotations independent of the extraction output.
3. **38 pages require review.** This is visible, not hidden. Most are caused by incomplete evidence references or confidence/scale requirements.
4. **Raster OCR is optional.** The local OCR adapter works when PaddleOCR is installed; no live provider is invoked.
5. **DWG/DXF needs a converter.** The route is implemented but production support depends on a licensed/configured converter and dedicated fixtures.
6. **Area/line tools are vector baselines.** Raster promptable segmentation and full connected-path tracing remain future phases.
7. **No full Node build in this environment.** `pnpm` could not be downloaded because the registry was unavailable. TypeScript source was parsed successfully, but full Vitest/typecheck/build must run in CI/local.
8. **No PostgreSQL/pgvector infrastructure run in this wave.** Existing DB suite was executed on its configured test database path; production migration remains a release gate.
9. **No AI model accuracy claim.** No API key was used. Future model adapters must be benchmarked offline and may only generate candidates.

## 11. Release status

```text
Ready for continued local development: YES
Ready for independent code audit: CONDITIONAL YES
Ready for production autonomous takeoff: NO
```

The next production wave should focus on strict coordinate round-trip, manual ground-truth annotations, persisted prototype feedback, raster segmentation fallback, connected line topology, and a second multi-discipline project benchmark.

## 12. Research references

- User-provided Big Plan: Kreo, AI takeoff, document layout, symbol detection, geometry, and community findings.
- Kreo Agentic Computer Vision / Smart Page Layout.
- Kreo Plan Zones.
- Kreo Auto Count.
- Kreo One-Click Area.
- Kreo Find Similar.
- DocLayout-YOLO.
- Segment Anything 2.
- DINOv2.

External technologies are treated as research patterns; no unreviewed external repository was copied into PAAX.
