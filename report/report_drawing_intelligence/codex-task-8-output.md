Status: DONE

Full `pnpm test` output summary:
- `test:core`: passed, 281 tests, 1 warning.
- `test:doc-intel`: passed, 309 passed, 5 skipped, 2 warnings.
- `test:schemas`: passed, 26 Jest tests.

Commit SHA and message:
- `018d450 test(core): authenticate protected API TestClient requests`
- `00b07fc chore: wire document-intelligence pytest into root pnpm test`

Notes:
- The first `pnpm test` run exposed an existing core-engine auth test gap: protected API tests were missing `X-Internal-Key`. Fixed with a test-only prerequisite commit before the Task 8 package wiring commit.

No git push, PR, or merge was performed.
