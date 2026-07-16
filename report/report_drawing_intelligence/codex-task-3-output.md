Status: DONE_WITH_CONCERNS

RED/GREEN:
- Python RED: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v` failed on missing new import from `app.transcription.models` (`ContinuationPatch`, same expected missing-model class of failure).
- Python GREEN: same command passed, `4 passed`.
- Jest RED: `cd packages/schemas && pnpm test` failed because `DocumentManifestSchema` / `ContinuationPatchSchema` were undefined exports.
- Jest GREEN: same command passed, `18 passed`.

Commit:
- `931893b feat(schemas): add DEM manifest + continuation patch schema (Pydantic + Zod parity)`

Files changed:
- `services/document-intelligence/app/transcription/models.py`
- `services/document-intelligence/tests/test_transcription_models.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Concerns:
- Manual `graphify update .` timed out twice, and `graphify update . --no-cluster` also timed out. The post-commit Graphify hook did log a rebuild, but later left long-running Python workers; I stopped those so no background processes remain.
- The repo still has unrelated pre-existing dirty/untracked files; I staged and committed only the four requested files.

No git push, PR, or merge was performed.