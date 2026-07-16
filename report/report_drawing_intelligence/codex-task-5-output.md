Status: DONE

RED/GREEN commands and outcomes:
- RED Python: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v` failed with `ImportError: cannot import name 'ProjectGraphEdge'`.
- GREEN Python: same command passed, 5 tests.
- RED Jest: `cd packages/schemas && pnpm test` failed because `ProjectGraphEdgeSchema` was not exported.
- GREEN Jest: same command passed, 22 tests.

Commit SHA and message:
- `d5dc2f9 feat(schemas): add PCKM graph edge schema + LOCATED_ON containment invariant`

Files changed:
- `services/document-intelligence/app/project_graph/models.py`
- `services/document-intelligence/tests/test_project_graph_models.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Concerns:
- The invariant error message is exactly `"{node_id} has {count} active LOCATED_ON edges"`.

No git push, PR, or merge was performed.
