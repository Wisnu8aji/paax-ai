# Drawing Intelligence — AI Assist and Vision Boundaries

> **Product & Technical Documentation for Drawing Intelligence AI Architecture**
>
> **Status:** Approved Contract for Bounded AI Assist & Vision Machine Learning Integration.

---

## 1. OCR vs Native PDF Text Parsing

In PAAX Drawing Intelligence:
- **Native PDF Text Parsing (PyMuPDF Fast-Path)** is the primary, deterministic fast-path for vector/digital engineering drawings. It extracts exact character strings, font metrics, and bounding boxes (`bbox`) directly from vector PDF streams with near-zero latency and 100% accuracy.
- **OCR (Optical Character Recognition)** is a fallback extraction mechanism used **only** when reading raster scanned images or un-searchable drawing streams.
- **Rule:** LLMs and AI assist routines do **not** perform OCR or image parsing; they receive pre-extracted text strings and coordinates already normalized by the deterministic PyMuPDF / PaddleOCR pipelines.

---

## 2. Bounding Box (BBox) vs Quantity

- A **Bounding Box (`bbox`)** represents spatial coordinates `[x, y, w, h]` on a drawing canvas used to highlight and cite exact evidence locations.
- **A bbox is NOT a physical quantity.** A bounding box around a column callout (e.g. `K1 200x300`) proves where the label appears on the sheet; it does **not** constitute a physical concrete volume, rebar weight, or formwork area.
- **Rule:** Bounding box coordinates are evidence references (`evidence_refs`), never engine inputs or calculated totals.

---

## 3. Annotation Strategy and Detection Gaps

- Supervised machine learning models require human-labelled bounding box and polygon annotations for fine-tuning.
- PAAX enforces a **gap-driven annotation strategy**: custom dataset labelling is performed **only** after measurable performance gaps are identified in deterministic text/coordinate rules.
- **Rule:** Pre-emptive dataset labelling without an evidenced detection gap is prohibited.

---

## 4. YOLO vs DETR Machine Learning Vision Models and Deferral Decision

- **YOLO (You Only Look Once)**: A real-time convolutional object detection family optimized for rapid bounding box detection of visual symbols and structural components.
- **DETR (DEtection TRansformer)**: A end-to-end transformer-based object detection architecture capable of capturing long-range spatial relationships across drawing sheets.
- **Deferral Decision:** Training and deploying YOLO or DETR models is **explicitly deferred** for Phase 07 because:
  1. Phase 07 focuses strictly on bounded text + bbox classification fallback where deterministic PyMuPDF extraction handles >95% of engineering drawings.
  2. No labelled, object-level detection gap currently exists that justifies the cost and complexity of training custom vision detection models.

---

## 5. Bounded AI Assist vs Core Engine Numeric Authority

- **LLMs and AI Assist Services**:
  - Activated **only** when deterministic rules return `abstain` or `ambiguous`.
  - Assist in classifying drawing titles, binding ambiguous schedules, or resolving unassigned zones.
  - Return proposals with confidence scores and citations.
  - **CANNOT** write final quantities, compute RAB formulas, or set `sourceAuthority: core_engine`.
- **Core Engine (`services/core-engine`, Python)**:
  - The **SOLE authority** for calculating RAB cost, HSP breakdown, physical volume, rebar weight, formwork area, and S-Curve scheduling.
  - Generates `sourceAuthority: core_engine` outputs.
  - LLMs and TypeScript UI components **never** compute or fabricate final engineering quantities.

---

## 6. Mandatory Human Approval & Audit Boundaries

1. **No Auto-Commit**: AI proposals remain strictly in `needs_review` state (`approval_state: unapproved`) until reviewed by a authorized human user (`estimator`, `pm`, or `admin`).
2. **Append-Only Audit Ledger**: Every AI proposal, deterministic validation result, and human approval decision is recorded in an immutable, append-only JSONL hash-chain ledger (`AppendOnlyProposalAuditLog`).
3. **Manual Fallback**: If an AI proposal is rejected or fails validation, the user can manually enter or correct drawing metadata without blocking the workflow.
