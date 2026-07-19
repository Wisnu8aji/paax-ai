# Fase 20 — Legacy Candidate Evidence Matrix

Graphify-first scoped pass. This is an evidence record, not an authorization to delete code.

| Candidate | Evidence / import path | Decision | Production prohibition |
|---|---|---|---|
| Hardcoded classifier | `perception` classifier tests and extraction pipeline remain graph-reachable | Retain | Never turn a heuristic classification into a physical quantity or Core Engine result. |
| localStorage persistence | `apps/web/src/lib/local-storage.ts` is consumed by project/UI repositories | Retain as client UX persistence | It is not authority for DEM, PCKM, Measurement Facts, RAB, or review approval. |
| In-memory job registry | `api/dem_routes.py` reaches `durable_jobs.py` / `durable_worker.py`; local in-memory implementation supports deterministic tests | Retain | Production routes use durable DB/object-storage workflow; test/local adapter must not become production authority. |
| Demo/mock provider | `transcription/providers/mock.py` is fixture/provider test support | Retain | Mock provider is test-only; it must not be selected by production configuration. |
| Duplicate route | Scoped Graphify/import scan found no unreachable duplicate route | No deletion | Any future deletion requires graph path, import search, and route test proof. |
| Stale mock mapping | Project repositories and drawing workspace are reachable UI compatibility paths | Retain pending explicit migration | Mock/contextual UI values must not become physical quantity, approved fact, or engine output. |
| Command Room/history | Protected paths under `apps/web/src/app/(dashboard)/command-room`, `components/command-room`, `lib/chat`, route/model/orchestrator | Explicitly retained | No deletion or move without required Graphify path, import, and test evidence. |
