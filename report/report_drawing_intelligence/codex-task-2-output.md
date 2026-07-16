**Status: DONE_WITH_CONCERNS**

Implemented and committed Task 2 on `feat/command-room-model-overhaul`.

RED/GREEN verification:
- Python RED: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v`
  Outcome: failed as expected with `ModuleNotFoundError: No module named 'app.transcription'`.
- Python GREEN: same command
  Outcome: passed, `2 passed`.
- Jest RED: `cd packages/schemas && pnpm test`
  Outcome: failed because `DrawingEvidenceSheetSchema` was missing at runtime (`undefined.parse`), equivalent missing-export condition.
- Jest GREEN: same command
  Outcome: passed, `16 passed`.

Commit:
- SHA: `6b18bb2`
- Message: `feat(schemas): add DEM sheet schema (Pydantic + Zod parity)`

Files changed:
- Created: `services/document-intelligence/app/transcription/__init__.py`
- Created: `services/document-intelligence/app/transcription/models.py`
- Created: `services/document-intelligence/tests/test_transcription_models.py`
- Modified: `packages/schemas/src/index.ts`
- Modified: `packages/schemas/src/__tests__/schemas.test.ts`

Concerns/deviations:
- `graphify update .` timed out twice, including once with `--no-cluster`. The post-commit Graphify hook also kept running without new completion output, so I stopped its background Python processes to avoid leaving a runaway rebuild. The commit itself contains only the task files.
- No schema-shape deviations: Pydantic and Zod field names/defaults match the brief.

No git push, PR, or merge was performed.