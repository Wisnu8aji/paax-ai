# PAAX State Management & Storage Layer

This module provides durable SQLite-backed state persistence for sessions, run histories, event streaming, persistent memories, and goal tracking.

## Architecture

```
services/ai-orchestrator/src/state/
├── goal-store.ts     # Persistent goal tracking (tasks, milestones, progress)
├── memory-store.ts   # Persistent memory store (knowledge, preferences, constraints)
├── schema.ts         # SQLite schema definitions & migrations
├── search.ts         # Full-text search (FTS5) over session state
├── session-db.ts     # Core durable SessionDB implementation
├── turn-journal.ts   # Agent turn journaling & replay
└── work-events.ts    # Durable work event streaming store
```

## Persistent Memories (`paax-memory`)
Memories capture persistent project knowledge and user constraints across sessions:
- `project_knowledge`: Specifications, material grades, unit prices.
- `user_preference`: User preferences (finishing style, export formats).
- `task_note`: Operational scratchpad notes.
- `constraint`: Critical architectural and structural constraints.
- `decision`: Logged approvals and change order agreements.

## Goals System (`paax-goals`)
Goals track multi-turn and cross-session project objectives:
- Priority levels: `low`, `medium`, `high`, `critical`.
- Lifecycle statuses: `pending`, `in_progress`, `completed`, `blocked`, `cancelled`.
- Progress tracking (0 - 100%) with timestamped audit notes.
