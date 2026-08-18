# Drawing Intelligence — AI Assist and Vision Boundaries

> **Product & Technical Documentation for Drawing Intelligence AI Architecture**
>
> **Status:** Approved Contract for Bounded AI Assist & Vision Machine Learning Integration.

---

## 1. Native PDF, OCR, and Agentic Vision

In PAAX Drawing Intelligence:
- **Native PDF Text Parsing (PyMuPDF Fast-Path)** is the first deterministic evidence path for vector/digital drawings. It extracts character strings, font metrics, and bounding boxes (`bbox`) directly from vector PDF streams; outputs still require validation because source drawings can be incomplete or inconsistent.
- **OCR** complements native parsing for raster, scanned, or unsearchable drawing content.
- **Agentic Vision** may inspect rendered pages plus extracted evidence when visual structure, symbols, or cross-sheet context needs interpretation. The target live provider is MiMo v2.5 when configured. It returns cited observations, confidence, and abstention—not final quantities.
- **Rule:** Security checks, artifact provenance, and evidence references precede any provider call. Vision output is a reviewable proposal and does not bypass Core Engine authority.

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

## 4. Vision Provider and Object-Model Policy

- **YOLO (You Only Look Once)**: A real-time convolutional object detection family optimized for rapid bounding box detection of visual symbols and structural components.
- **DETR (DEtection TRansformer)**: A end-to-end transformer-based object detection architecture capable of capturing long-range spatial relationships across drawing sheets.
- **MiMo v2.5** is the target general Vision agent for rendered-page interpretation and evidence-grounded review; it does not require PAAX to train a custom detector.
- **YOLO/DETR** remain optional, measurable extensions. Train or deploy them only after an evidenced object-level detection gap and a labelled-dataset plan justify their operating cost.

---

## 5. Bounded AI Assist vs Core Engine Numeric Authority

- **LLMs and AI Assist Services**:
  - May perform Vision, extraction, classification, evidence reconciliation, planning, and review; deterministic fast paths remain preferred when they provide sufficient evidence.
  - Assist in classifying drawing titles, binding schedules, resolving zones, and reviewing cross-sheet inconsistencies.
  - Return proposals with confidence, citations, provider/model identity, and an abstention state when evidence is insufficient.
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
