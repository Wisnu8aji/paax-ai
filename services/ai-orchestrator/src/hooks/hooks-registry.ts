import { createHash } from "node:crypto";
import type {
  HookDefinition,
  HookLifecycle,
  HooksJsonConfig,
  HookStateConfig,
} from "./hooks-types";

export class HooksRegistryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "HooksRegistryError";
  }
}

export class HooksRegistry {
  private readonly hooks = new Map<string, HookDefinition>();
  private readonly stateConfigs = new Map<string, HookStateConfig>();

  register(hook: HookDefinition): this {
    if (!hook.id || !hook.name || !hook.lifecycle) {
      throw new HooksRegistryError("invalid_hook_definition", "Hook id, name, and lifecycle are required");
    }

    if (hook.trustedHash) {
      const state = this.stateConfigs.get(hook.id);
      if (state?.trustedHash && state.trustedHash !== hook.trustedHash) {
        throw new HooksRegistryError(
          "untrusted_hook_hash",
          `Hook ${hook.id} hash ${hook.trustedHash} does not match trusted state hash ${state.trustedHash}`,
        );
      }
    }

    this.hooks.set(hook.id, hook);
    return this;
  }

  unregister(hookId: string): boolean {
    return this.hooks.delete(hookId);
  }

  get(hookId: string): HookDefinition | undefined {
    return this.hooks.get(hookId);
  }

  list(): readonly HookDefinition[] {
    return Object.freeze(Array.from(this.hooks.values()));
  }

  setHookState(hookId: string, state: HookStateConfig): this {
    this.stateConfigs.set(hookId, state);
    return this;
  }

  getHooksForLifecycle(
    lifecycle: HookLifecycle,
    filterMatcher?: string,
  ): readonly HookDefinition[] {
    const matching: HookDefinition[] = [];

    for (const hook of this.hooks.values()) {
      if (hook.lifecycle !== lifecycle) continue;

      if (hook.matcher) {
        if (!filterMatcher) continue;
        if (hook.matcher instanceof RegExp) {
          if (!hook.matcher.test(filterMatcher)) continue;
        } else if (typeof hook.matcher === "string") {
          if (hook.matcher.toLowerCase() !== filterMatcher.toLowerCase()) continue;
        }
      }

      matching.push(hook);
    }

    // Sort by priority (descending)
    return Object.freeze(
      matching.sort((a, b) => (b.priority ?? 10) - (a.priority ?? 10)),
    );
  }

  loadFromJsonConfig(config: HooksJsonConfig, sourcePrefix = "json"): void {
    if (!config.hooks || typeof config.hooks !== "object") return;

    for (const [lifecycleKey, matchersList] of Object.entries(config.hooks)) {
      const lifecycle = normalizeLifecycle(lifecycleKey);
      if (!lifecycle || !Array.isArray(matchersList)) continue;

      for (let mIdx = 0; mIdx < matchersList.length; mIdx++) {
        const item = matchersList[mIdx];
        const matcher = item.matcher;
        const subHooks = item.hooks;
        if (!Array.isArray(subHooks)) continue;

        for (let hIdx = 0; hIdx < subHooks.length; hIdx++) {
          const sub = subHooks[hIdx];
          const hookId = `${sourcePrefix}:${lifecycleKey}:${mIdx}:${hIdx}`;
          const commandStr = sub.command ?? "";
          const hash = commandStr
            ? `sha256:${createHash("sha256").update(commandStr, "utf8").digest("hex")}`
            : undefined;

          this.register({
            id: hookId,
            name: sub.name ?? `Command Hook (${commandStr.slice(0, 30)})`,
            lifecycle,
            matcher,
            command: sub.command,
            trustedHash: hash,
            priority: 10,
          });
        }
      }
    }
  }
}

function normalizeLifecycle(key: string): HookLifecycle | null {
  const clean = key.replace(/[-_]/g, "").toLowerCase();
  switch (clean) {
    case "sessionstart":
      return "session_start";
    case "userpromptsubmit":
      return "user_prompt_submit";
    case "pretooluse":
      return "pre_tool_use";
    case "posttooluse":
      return "post_tool_use";
    case "modelresponse":
      return "model_response";
    case "turncomplete":
      return "turn_complete";
    case "stop":
      return "stop";
    default:
      return null;
  }
}

export function createHooksRegistry(): HooksRegistry {
  return new HooksRegistry();
}
