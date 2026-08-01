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

## Stage 2B route wiring

- The internal agent calculation endpoint now accepts only `mapping_id`, ordered fact IDs, and an idempotency key, and returns the persisted `CalculationReceipt` contract.
- RAB Bridge materialization and the internal agent endpoint both call the same `calculate_receipt` service. RAB lines retain only the persisted receipt reference and its engine provenance; no transient engine result is returned as authority.
- Pending mapping edits and approval/rejection transitions increment mapping revision and write before/after revisions to the mapping audit. Approved mappings remain non-editable through the pending-edit endpoint.
- The civil-work-items ledger reads `engine_verified` only from active `complete` receipts whose exact approval audit revision remains valid. Associated human facts are not duplicated; blocked, needs-input, superseded, or invalid-lineage receipts are excluded. The XLSX export includes only these active engine-verified receipt lines.
- `migrate_portable_schema.py` now detects the verified historical state where the 0038 recommendation table exists but Alembic is still stamped 0037. It validates the table shape before stamping 0038 and applying 0039; unknown partial states fail closed.

Portable-copy proof: a copy of `G:\PAAX-Data\db\portable.sqlite` migrated from the verified partial-0038 state to `0039_calculation_receipts`, retained its project row, and gained both `calculation_receipts` and mapping `revision`.
