import type { HooksRegistry } from "./hooks-registry";
import type {
  HookAction,
  HookContext,
  HookLifecycle,
  HookResult,
} from "./hooks-types";

export interface HooksEngineOptions {
  readonly registry: HooksRegistry;
  readonly commandRunner?: (command: string, context: HookContext) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class HooksEngine {
  private readonly registry: HooksRegistry;
  private readonly commandRunner?: (command: string, context: HookContext) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

  constructor(options: HooksEngineOptions) {
    this.registry = options.registry;
    this.commandRunner = options.commandRunner;
  }

  /**
   * Triggers a lifecycle event and runs all registered matching hooks.
   * If any hook blocks, execution halts and returns a blocked result.
   * If any hook modifies data, the modified data cascades to subsequent hooks.
   */
  async trigger(
    lifecycle: HookLifecycle,
    context: Omit<HookContext, "lifecycle">,
  ): Promise<HookResult> {
    const fullContext: HookContext = {
      ...context,
      lifecycle,
    };

    const matcher = fullContext.toolName ?? fullContext.userPrompt;
    const hooks = this.registry.getHooksForLifecycle(lifecycle, matcher);

    let currentData: Record<string, unknown> = {
      ...(fullContext.metadata ?? {}),
    };

    for (const hook of hooks) {
      try {
        let result: HookResult;

        if (hook.handler) {
          result = await hook.handler({
            ...fullContext,
            metadata: currentData,
          });
        } else if (hook.command && this.commandRunner) {
          const runRes = await this.commandRunner(hook.command, fullContext);
          if (runRes.exitCode !== 0) {
            result = {
              action: "block",
              reason: `Hook command "${hook.name}" failed with exit code ${runRes.exitCode}: ${runRes.stderr}`,
            };
          } else {
            result = {
              action: "continue",
              data: { stdout: runRes.stdout },
            };
          }
        } else {
          result = { action: "continue" };
        }

        if (result.action === "block") {
          return {
            action: "block",
            reason: result.reason ?? `Blocked by hook ${hook.name} (${hook.id})`,
            data: currentData,
          };
        }

        if (result.action === "modify" && result.data) {
          currentData = {
            ...currentData,
            ...result.data,
          };
        }
      } catch (error) {
        return {
          action: "block",
          reason: `Hook ${hook.name} threw an unexpected error`,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    return {
      action: "continue",
      data: currentData,
    };
  }
}

export function createHooksEngine(options: HooksEngineOptions): HooksEngine {
  return new HooksEngine(options);
}
