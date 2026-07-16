Status: DONE

RED/GREEN commands and outcomes:
- RED Python: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v` failed with `ImportError: cannot import name 'ProjectGraphSnapshot'`.
- GREEN Python: same command passed, 7 tests.
- RED Jest: `cd packages/schemas && pnpm test` failed because `ProjectGraphSnapshotSchema` was not exported.
- GREEN Jest: same command passed, 24 tests.

Commit SHA and message:
- `cbbb525 feat(schemas): add PCKM graph snapshot schema with containment invariant validator`

Files changed:
- `services/document-intelligence/app/project_graph/models.py`
- `services/document-intelligence/tests/test_project_graph_models.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Concerns:
- Zod intentionally does not enforce the cross-field `LOCATED_ON` invariant; the documented asymmetry is covered by Jest.

No git push, PR, or merge was performed.
