# PAAX Rules System (`paax-rules`)

The PAAX Rules System implements an OpenAI Codex-compatible declarative rules engine for command and tool authorization.

## Features
- **Codex DSL Syntax Support**: Supports `prefix_rule`, `exact_rule`, `regex_rule`, `deny_rule`, `allow_rule`, and `ask_rule`.
- **Priority-Based Evaluation**: Allows high-priority security guardrails (e.g. blocking destructive disk commands) to override broader prefixes.
- **Dynamic Rules Loading**: Parse rules from `.rules` files, configuration strings, or programmatic APIs.
- **Evaluation Decisions**:
  - `allow`: Command is permitted to execute automatically.
  - `deny`: Command is forbidden and blocked immediately.
  - `ask`: Command requires explicit user approval before execution.

## Example Rules
```python
prefix_rule(pattern=["pnpm", "install"], decision="allow")
prefix_rule(pattern=["git", "status"], decision="allow")
regex_rule(pattern="rm\\s+(-rf|-fr)\\s+[\\/\\\\]", decision="deny", reason="Destructive root deletion")
```

## Usage
```typescript
import { createRulesEngine, parseRulesContent } from "@paax/ai-orchestrator/rules";

const engine = createRulesEngine();
const result = engine.evaluate("pnpm test");
console.log(result.decision); // "allow"
```
