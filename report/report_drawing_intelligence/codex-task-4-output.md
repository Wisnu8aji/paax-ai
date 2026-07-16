Status: DONE

RED/GREEN commands and outcomes:
- RED Python: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v` failed with `ModuleNotFoundError: No module named 'app.project_graph'`.
- GREEN Python: same command passed, 2 tests.
- RED Jest: `cd packages/schemas && pnpm test` failed because `ProjectGraphNodeSchema` was not exported.
- GREEN Jest: same command passed, 20 tests.

Commit SHA and message:
- `80e2a63 feat(schemas): add PCKM graph node schema (Pydantic + Zod parity)`

Files changed:
- `services/document-intelligence/app/project_graph/__init__.py`
- `services/document-intelligence/app/project_graph/models.py`
- `services/document-intelligence/tests/test_project_graph_models.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Concerns:
- None.

No git push, PR, or merge was performed.
