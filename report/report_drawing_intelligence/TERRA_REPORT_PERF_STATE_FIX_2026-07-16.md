# TERRA Report — Performance and State Fix (2026-07-16)

## Scope

Fixed the post-F1/F7 regression in `services/document-intelligence` only:

- `DeepSeekLevelProvider.from_env()` now needs both a non-empty
  `DRAWING_INTELLIGENCE_API_KEY` and
  `DRAWING_INTELLIGENCE_LEVEL_PROVIDER` set to `1` or `true`
  (case-insensitive).
- `scripts/smoke_level_provider.py` sets that live-only flag itself.
- Added regression tests for key-without-flag (inactive) and key-with-flag
  (active proposal through a stubbed, no-network transport).

## Profiled root cause

The requested 20-page cProfile comparison found that deterministic synthesis is
not the bottleneck:

| Process state | 20-page elapsed | Primary cumulative cost |
| --- | ---: | --- |
| No `app.main` import / no loaded key | 0.284 s | `canonicalize_levels`: 0.014 s |
| `app.main` imported first | 239.837 s | 21 `DeepSeekLevelProvider.propose` calls: 239.546 s |

In the reproduced slow state, `complete_json` and `_request_with_retry` consumed
239.545 s; SSL socket reads alone consumed 238.207 s. This is direct profiler
evidence that the 472.37 s full-fixture regression was live provider I/O, not
per-source deterministic title canonicalization.

`app.main` calls `load_repo_env_local()`, which loads the local Drawing
Intelligence key into the process-global `os.environ`. Before this change,
`DeepSeekLevelProvider.from_env()` treated that key alone as activation. There
is no module cache, `lru_cache`, or registry in the level canonicalizer/provider
path. The cross-test mutable state was the process environment loaded by the
earlier application import; the fixture did not itself create a cache. Once
active, live semantic responses could merge the qualified roof candidate and
cause the following synthesis test to report `cross_sheet_inferred` instead of
`ambiguous`.

The explicit opt-in gate makes ordinary synthesis deterministic even after
`app.main` has loaded `.env.local`; only the dedicated smoke script or an
operator-set flag can enable live review.

## Fixture anchor

The observed failing value was 1016 versus the deterministic anchor 1014.
The two-entry delta was live semantic-provider review output caused by the
implicit activation above, not a fixture graph delta. The assertion remains
`1014` and its comment now records the composition: 774 quarantined records +
240 deterministic A2/A3 review findings. This preserves a strict deterministic
assertion rather than accepting provider-dependent output.

## Verification

Using `PYTHONUTF8=1` and
`C:\Users\Nothing\AppData\Local\Programs\Python\Python313\python.exe`:

| Check | Result |
| --- | --- |
| `services/document-intelligence`: `python -m pytest -q --durations=5` run 1 | 441 passed, 5 skipped, 17.37 s; 88-page fixture 1.56 s |
| Same command run 2 | 441 passed, 5 skipped, 19.48 s; 88-page fixture 2.16 s |
| `services/db`: `python -m pytest -q` | 61 passed, 1 skipped, 21.54 s |
| `services/db`: `python tests/run_pckm_benchmark.py` | 13/13 PASS |
| `graphify update .` | completed; 6170 nodes, 12169 edges |

The Document Intelligence full suite is below the required two-minute ceiling
on both consecutive runs, and the qualified-roof test remains stable after the
environment-loading reproduction.
