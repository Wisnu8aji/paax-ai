# ADR 0002: Deterministic RAB Calculation Engine

## Status
Accepted

## Context
The core value proposition of PAAX AI is accelerating the creation of Bill of Quantities (Rencana Anggaran Biaya / RAB). Given the recent advancements in Large Language Models (LLMs), there is a temptation to let the LLM generate the final RAB outputs or do the math directly.

However, in civil engineering and construction, RAB calculations are legal and financial documents. They require:
- **Absolute precision**: $1.00 + $2.00 must always equal $3.00.
- **Auditability**: Every rate must be traceable to a specific AHSP (Analisa Harga Satuan Pekerjaan) standard.
- **Repeatability**: Given the same inputs, the system must produce the exact same outputs.

LLMs are probabilistic. They frequently hallucinate numbers, struggle with complex arithmetic over large datasets, and cannot easily provide auditable traces of standard rates without massive context bloat.

## Decision
We will enforce a strict separation between **understanding** and **calculation**.

1. **AI (Probabilistic / Agentic)**: Used for unstructured data extraction (parsing PDFs, understanding drawings), Vision, evidence reconciliation, classification, planning, review, and engineering chat. Its outputs remain attributed proposals or structured facts; they are not final numeric results.
2. **Core Engine (Deterministic)**: A Python/FastAPI engine that handles all actual math, database lookups for AHSP rates, and schedule scenario calculations.

The AI Orchestrator may extract, reconcile, and review "Quantity Candidates" and "Task Descriptions", but the Core Engine alone executes formulas and produces final quantities from approved, scoped facts and verified AHSP rates.

## Consequences

### Positive
- **Trust**: Users can trust the math 100%.
- **Auditability**: We can provide exact Excel formulas in our exports because the engine knows the exact operands.
- **Performance**: Standard arithmetic in Python is orders of magnitude faster and cheaper than running math through LLM tokens.
- **Safety**: Prevents "hallucinated" costs that could bankrupt a project if relied upon.

### Negative
- **Integration Overhead**: The AI needs strict JSON schemas to pass structured data to the deterministic engine, requiring rigid API boundaries.
- **Less "Magic"**: The AI cannot simply "rewrite" an entire RAB if the math doesn't work out; it must call specific tools or endpoints to recalculate.
