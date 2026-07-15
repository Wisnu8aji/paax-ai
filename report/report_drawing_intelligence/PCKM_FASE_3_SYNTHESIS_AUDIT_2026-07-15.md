# PCKM Phase 3 Synthesis Audit - 2026-07-15

## Scope

- Input: 88 stored `DrawingEvidenceSheet` JSON files from the PLHUT fixture.
- No source JSON, rendered image, or provider response was modified.
- Synthesis only normalizes and links extracted facts. It does not calculate RAB, BoQ, HSP, volume, duration, or schedule values.

## Deterministic Output

| Metric | Observed value |
| --- | ---: |
| Consumed pages | 88 |
| Graph nodes | 4,365 |
| Graph edges | 4,547 |
| Communities | 4 |
| Canonical element types | 222 |
| Cross-sheet merged element types | 41 |
| Element occurrences with explicit context | 81 |
| Merged physical occurrences | 0 |
| `POSSIBLY_SAME_AS` review links | 8 |
| Escalation candidates | 78 |
| Explicit conflict nodes | 1 |
| Missing-information records | 329 |

The zero physical-occurrence merge count is intentional. No repeated label had sufficiently matching explicit level and spatial context to prove that it was the same physical object. The resolver keeps the shared type, creates distinct contextual occurrences where available, and leaves uncertain identity as review data instead of forcing a merge.

## Required Anchors

| Anchor | Result |
| --- | --- |
| J2 | One canonical type with source pages 21, 22, and 27 |
| BV1 | One canonical type with source pages 21, 22, and 23 |
| RB3 | One canonical type with source pages 44, 54, 55, and 56 |
| Page 81 dimensions | One conflict node with `CONFLICTS_WITH` links to the observed `20250` and `20000` dimension facts |

## Resolver Rules

- Canonical element type identity is normalized `(project_id, discipline, code)`.
- An occurrence is merged only when type, explicit level, and explicit spatial context agree.
- An explicit level can come from a level fact or an unambiguous level stated in the sheet title.
- When several explicit space labels exist, a label is associated only with a unique nearest extracted bbox; an equal-distance tie remains missing information.
- Each occurrence has at most one `LOCATED_ON` edge and its target must be a `level`. Alternate contextual candidates use `POSSIBLY_SAME_AS` with ambiguous confidence.
- Equal room names are scoped to their canonical level, so a room on one level cannot merge with the same display name on another level.
- Provider output has a strict decision and rationale contract. Only `possibly_same` and `requires_review` create auditable ambiguous review edges; no provider decision mutates canonical entities or calculated values.
- The default synthesis path has no provider and performs no network access. Provider input, model, prompt version, output, usage, and rationale remain in the synthesis audit result when explicitly supplied.

## Verification

- Focused project-graph suite: `80 passed`.
- Full document-intelligence suite: `400 passed, 5 skipped, 2 warnings`.
- Graph refresh: `graphify update . --force` completed successfully (`5,599` nodes, `10,786` edges, `385` communities).

The full suite emitted two dependency warnings: the Starlette TestClient deprecation and the absence of ccache for Paddle extension compilation.

## Fixture Availability

The 88-page source dataset is an intentionally local audit artifact and is not tracked by Git. The fixture-audit and real-fixture benchmark modules therefore skip only when `dem_extraction_88pages/pages/page-0000.json` is unavailable in a checkout. In a workspace that contains the dataset, their full anchor assertions run and must pass; the local verification recorded above used all 88 pages.
