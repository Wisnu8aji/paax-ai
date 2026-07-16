Status: DONE

RED/GREEN commands and outcomes:
- RED Python: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v` failed with missing query/answer model imports.
- GREEN Python: same command passed, 9 tests.
- Full document-intelligence suite: `cd services/document-intelligence && python -m pytest -q` passed, 309 passed, 5 skipped, 2 warnings.
- RED Jest: `cd packages/schemas && pnpm test` failed because `GraphQueryPlanSchema` and `GroundedAnswerSchema` were not exported.
- GREEN Jest: same command passed, 26 tests.
- Typecheck: `cd packages/schemas && pnpm run typecheck` passed with zero TypeScript errors.

Commit SHA and message:
- `ab4ea90 feat(schemas): add Command Room query plan + grounded answer schema (Pydantic + Zod parity)`

Files changed:
- `services/document-intelligence/app/project_graph/models.py`
- `services/document-intelligence/tests/test_project_graph_models.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Concerns:
- None.

No git push, PR, or merge was performed.
