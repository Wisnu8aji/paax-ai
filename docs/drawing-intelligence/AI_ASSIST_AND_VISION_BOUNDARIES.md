# Drawing Intelligence — AI Assist and Vision Boundaries

## Authority boundary

PAAX uses a deterministic-first pipeline. Vector text, embedded PDF text, OCR output, title blocks, schedules, cross-references, geometry, and existing DEM/PCKM evidence are inventoried before any model is considered. AI is called only when deterministic processing returns `abstain` or `ambiguous`.

AI may propose structured metadata such as a sheet category, evidence binding, or candidate interpretation. It may not calculate or authorize a final area, volume, length, count, mass, cost, duration, weight, RAB, BoQ, HSP, or schedule value. Final construction quantities come only from Python Core Engine and must carry `sourceAuthority = core_engine`.

## Inputs allowed for AI assist

A bounded request contains only:

- extracted text fragments;
- page index and detected title metadata;
- evidence identifiers;
- bounding-box identifiers or numeric coordinates already extracted by deterministic tooling;
- a closed set of allowed fields/categories;
- deterministic reason for abstention.

Normal tests and the controlled model benchmark do not send a PDF, image, source path, or the 88-page PLHUT document to a provider.

## Validation and review

Every proposal is checked deterministically against the supplied text, evidence IDs, bounding boxes, allowed fields, category vocabulary, and range rules. A valid proposal remains `needs_review`. It is written to an append-only audit ledger with model, prompt version, case ID, token usage, cost, latency, validation, and outcome. A human approves or rejects reusable metadata. When AI is unavailable or rejected, the same field remains editable through the manual review path.

## OCR and bounding boxes

OCR is used only where native PDF text is missing or unusable. Native vector/text extraction remains preferred because it preserves source coordinates and avoids unnecessary raster loss. Bounding boxes are evidence pointers and overlay geometry; they are not quantities by themselves. New annotation is required only when a measured detector gap has been demonstrated and a representative labelled dataset is available.

## YOLO and DETR

YOLO and DETR are object detectors. They can propose class labels and boxes for repeated raster symbols, but neither understands drawing scale, construction authority, evidence precedence, or a quantity formula. Feedback 1 does not introduce a YOLO/DETR training programme. A learned detector may be considered later only when:

1. a repeatable pixel-only gap remains after vector, text, OCR, schedule, cross-reference, and deterministic methods;
2. the class ontology is stable across multiple projects;
3. legal, representative annotations can be produced with project-level train/validation/test separation;
4. precision, recall, false-positive cost, and missed-quantity risk are defined;
5. detector output remains a reviewable evidence proposal;
6. Core Engine authority and human approval remain mandatory.

Use box annotations for discrete symbols. Use segmentation or polylines only when measured geometry—not presence—is the actual problem.

## Agentic boundary

The governed runner may call only registered, project-scoped tools. It persists an invocation before execution, enforces approval, role, budget, timeout, and idempotency rules, and rejects direct numeric quantity payloads from a model. The authoritative quantity tool accepts trusted Measurement Fact IDs and returns Core Engine output unchanged. Agent reasoning never becomes a final quantity.

## Controlled benchmark

The live comparison is capped at exactly 30 attempts: 15 DeepSeek V4 Pro and 15 Qwen 3.7 Plus. Attempt 31 is rejected. The runner reads only `DRAWING_INTELLIGENCE_API_KEY` at runtime. Each provider error still consumes an attempt and is recorded. The benchmark is advisory and cannot automatically change production routing.
