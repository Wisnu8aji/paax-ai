---
trigger: always_on
description: Consult the relevant module Graphify knowledge graph for codebase and architecture questions.
---

## graphify

This project has persistent Graphify knowledge graphs per active module:
`services/document-intelligence`, `services/core-engine`,
`services/ai-orchestrator`, and `apps/web`. **Mandatory, not optional** — use
the relevant module graph as the default first step for any code/architecture task in this repo.

Rules:
- For codebase or architecture questions, first enter the relevant module and, when its `graphify-out/graph.json` exists, run `graphify query "<question>"` (CLI) or `query_graph` (MCP). Use `graphify path "<A>" "<B>"` / `shortest_path` for relationships and `graphify explain "<concept>"` / `get_node` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- Read the module `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code files, refresh the affected module graph. When no approved semantic backend exists, use `graphify <module> --code-only --no-viz` and then `graphify cluster-only <module> --no-viz`; a code graph does not prove Markdown semantics.
