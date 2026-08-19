# PAAX Hooks System (`paax-hooks`)

The PAAX Hooks System provides lifecycle extension points mirroring OpenAI Codex hooks, enabling plugins, safety monitors, and workflow tools to intercept agent turns and tool execution.

## Supported Lifecycle Events
1. `session_start` - Triggered when a new agent session is initialized.
2. `user_prompt_submit` - Triggered before user input is processed.
3. `pre_tool_use` - Triggered before an authorized tool is executed.
4. `post_tool_use` - Triggered after a tool returns results.
5. `model_response` - Triggered after a model output chunk/turn completes.
6. `turn_complete` - Triggered when a turn finishes finalization.
7. `stop` - Triggered when a turn or session is cancelled/terminated.

## Hook Actions
- `continue`: Execution proceeds normally.
- `modify`: Modifies the contextual payload passed down the pipeline.
- `block`: Immediately halts execution with a reason or error.

## Example Usage
```typescript
import { createHooksRegistry, createHooksEngine } from "@paax/ai-orchestrator/hooks";

const registry = createHooksRegistry();
registry.register({
  id: "security-check",
  name: "Security Check",
  lifecycle: "pre_tool_use",
  matcher: "terminal_run",
  handler: async (ctx) => {
    // Check or block
    return { action: "continue" };
  },
});

const engine = createHooksEngine({ registry });
const result = await engine.trigger("pre_tool_use", { toolName: "terminal_run" });
```
