# PAAX Gateway & Session Management Layer

This layer coordinates platform runtimes, turn execution, SSE streaming, and persistent session management.

## Architecture

```
services/ai-orchestrator/src/gateway/
├── config.ts           # Gateway configuration schema & parser
├── platforms/          # Execution platform adapters (in-process, docker)
├── run.ts              # Gateway turn runner & Express router
├── session.ts          # Core SessionStore & binding validation
├── session-index.ts    # JSONL session indexing (Codex session_index.jsonl pattern)
├── session-manager.ts  # Session resume and archival management
├── stream-consumer.ts  # SSE stream consumer with event replay
└── work-events.ts      # Gateway work event emitter & typed events
```

## Features
- **Session Indexing (`session_index.jsonl`)**: Fast lookup and querying of historical sessions across projects and channels.
- **Session Resume**: Seamless reconstruction of message history, turn state, and active runs for continuity after interruption.
- **Session Archiving**: Safe serialization of completed sessions for compliance and cold storage.
