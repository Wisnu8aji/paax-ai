# Phase 4 CR2B1 — Stage 2A Receipt Foundation

## Delivered scope

- Alembic `0039_calculation_receipts` adds immutable calculation receipts and receipt audits.
- `RabMaterializationMapping.revision` is introduced with baseline `1`; mapping-audit rows now carry `revision_before` and `revision_after`.
- The canonical DB service loads the project-scoped, human-approved mapping, its exact matching approval audit event, and active human-verified facts. It constructs the engine request itself and persists `complete`, `blocked`, or `needs_input` receipts.
- The receipt records ordered fact lineage, evidence, exact decimal inputs as strings, units, formula inputs, mapping revision, approval event, canonical SHA-256 input hash, engine provenance, and requester identity.
- Retries are idempotent. Changed approved mapping revisions form a new receipt and explicitly supersede the prior active receipt while preserving its decimal result and lineage.
- ORM, Pydantic, and Zod contracts are aligned. The web contract represents receipt decimals as strings so JavaScript cannot silently lose precision.

## Explicit Stage 2A boundary

No HTTP route, RAB materialization handler, quantity/handoff reader, or PLHUT data was changed. Existing transient calculation routes remain intentionally untouched until the next wiring stage. `advance_mapping_revision` is the shared mutation primitive that those human mapping routes must call when Stage 2B wires accepted pending edits and approval/rejection transitions.

## Verification

- `pytest services/db/tests/test_calculation_receipts.py services/db/tests/test_rab_materialize.py services/db/tests/test_migration_graph_static.py -q` — 13 passed.
- `pnpm --filter @paax/schemas test` — 37 passed.
- `python -m compileall -q services/db/src/paax_db` — passed.
- `pnpm --filter @paax/schemas exec tsc --noEmit` — passed.
- `graphify update .` completed after code changes.

The migration preservation test applies the migration to a pre-revision SQLite mapping record and verifies it remains present with revision `1`.
