# Phase 0 Baseline Manifest

- **Base Commit Hash**: `e3fa46312f596407bb9ccd0d5a6c9af5e7974c84` (git merge-base feat/drawing-intelligence-truth-rebuild main)
- **Services Inventory**:
  - `services/document-intelligence`: Python service for drawing parsing, layout analysis, and symbol extraction.
  - `services/db`: Database gateway and schema migrations (PostgreSQL/Supabase).
  - `services/core-engine`: Determines deterministic calculations for BoQ, Kurva S, and RAB.
  - `services/ai-orchestrator`: Routing and model handling for Command Room (chat/orchestration).
  - `services/site-agent`: Automated field and site inspection coordination engine.
  - `apps/web`: Next.js workspace frontend for project dashboards, Command Room, and Drawing Intelligence.

- **Feature Flags**:
  - `DI_ENABLE_RAB_MATERIALIZATION` (default: `False`)
  - `DI_ENABLE_PHYSICAL_QUANTITY` (default: `False`)
  - `DI_ENABLE_MOCK_FALLBACK` (default: `False`)
  - `DI_ENABLE_LIVE_AI_TESTS` (default: `False`)

- **Test Suite Metrics**:
  - `services/document-intelligence`: 521 tests collected (including layout extraction, symbol geometry, filename safety validation, and boundary verification).
  - `apps/web` (Drawing Intelligence Workspace): 86 unit and component tests passed.

- **Known Stale Documentation**:
  - The TKG (Truth Knowledge Graph) builder is kept as a legacy pathway (has not been removed yet; deletion/migration postponed to Phase 2.0).
