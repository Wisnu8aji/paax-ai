---
name: graphify
description: Turn any folder of files into a navigable knowledge graph
---

# Workflow: graphify

Follow the project-installed Graphify skill under `.agents/skills/graphify/SKILL.md`.

For PAAX code and architecture work, query the relevant module graph first:
`services/document-intelligence`, `services/core-engine`,
`services/ai-orchestrator`, or `apps/web`. If its graph is absent and no
approved semantic backend is configured, build the local code graph with
`graphify <module> --code-only --no-viz`, then run
`graphify cluster-only <module> --no-viz`.

If no path argument is given, use `.` (current directory).
