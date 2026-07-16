Status: DONE

`pnpm test`:
```text
PASS src/__tests__/schemas.test.ts
Test Suites: 1 passed, 1 total
Tests: 16 passed, 16 total
```

`pnpm run typecheck`:
```text
> tsc --noEmit
```
Exited 0 with no TypeScript errors.

Commit:
```text
05ed95ae6e837eb5db6a2d5db6ad3053a3fd7994
fix(schemas): loosen DEM Zod constraints to match Pydantic parity (next_cursor, DemSource numerics)
```

Self-review: committed only `packages/schemas/src/index.ts`, with only the requested `next_cursor` and `DemSourceSchema` Zod loosening changes. No git push, PR, or merge was performed.