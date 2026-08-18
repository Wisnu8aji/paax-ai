export type LoopHookStage =
  | "turn_started"
  | "before_model"
  | "after_model"
  | "before_tools"
  | "after_tool"
  | "turn_stopped"
  | "turn_failed"
  | "turn_finalized";

export const ALL_LOOP_HOOK_STAGES = Object.freeze([
  "turn_started",
  "before_model",
  "after_model",
  "before_tools",
  "after_tool",
  "turn_stopped",
  "turn_failed",
  "turn_finalized",
] as const satisfies readonly LoopHookStage[]);

type LoopHookPrimitive = string | number | boolean;

export interface LoopHookContext {
  readonly runId: string;
  readonly turnId: string;
  readonly iteration: number;
  readonly stage: LoopHookStage;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly stopReason?: string;
  readonly metadata: Readonly<Record<string, LoopHookPrimitive>>;
}

export interface LoopHook {
  readonly name: string;
  readonly stages: readonly LoopHookStage[];
  onStage(context: LoopHookContext): void | Promise<void>;
}

export interface LoopHookFailure {
  readonly hookName: string;
  readonly stage: LoopHookStage | "unknown";
  readonly errorCode: "hook_failed" | "invalid_context";
}

export type LoopHookFailureObserver = (failure: LoopHookFailure) => void | Promise<void>;

export interface ComposeLoopHooksOptions {
  readonly onFailure?: LoopHookFailureObserver;
}

export function isLoopHookStage(value: unknown): value is LoopHookStage {
  return typeof value === "string" && (ALL_LOOP_HOOK_STAGES as readonly string[]).includes(value);
}

function isPrimitive(value: unknown): value is LoopHookPrimitive {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLoopHookContext(value: unknown): value is LoopHookContext {
  if (!isRecord(value) || typeof value.runId !== "string" || !value.runId || typeof value.turnId !== "string" || !value.turnId) return false;
  const iteration = value.iteration;
  if (typeof iteration !== "number" || !Number.isInteger(iteration) || iteration < 0 || !isLoopHookStage(value.stage) || !isRecord(value.metadata)) return false;
  return Object.values(value.metadata).every(isPrimitive)
    && [value.toolCallId, value.toolName, value.stopReason].every((item) => item === undefined || typeof item === "string");
}

function safeHookName(value: string): string {
  return value.trim().slice(0, 96) || "unnamed-hook";
}

async function reportFailure(observer: LoopHookFailureObserver | undefined, failure: LoopHookFailure): Promise<void> {
  try {
    await observer?.(failure);
  } catch {
    // A failure observer is also non-authoritative.
  }
}

export function composeLoopHooks(hooks: readonly LoopHook[], options: ComposeLoopHooksOptions = {}): LoopHook {
  const registered = Object.freeze(hooks.map((hook) => Object.freeze({
    name: safeHookName(hook.name),
    stages: Object.freeze(hook.stages.filter(isLoopHookStage)),
    onStage: hook.onStage,
  })));

  return {
    name: "composed-loop-hooks",
    stages: ALL_LOOP_HOOK_STAGES,
    async onStage(context: LoopHookContext): Promise<void> {
      if (!isLoopHookContext(context)) {
        await reportFailure(options.onFailure, { hookName: "composed-loop-hooks", stage: "unknown", errorCode: "invalid_context" });
        return;
      }
      for (const hook of registered) {
        if (!hook.stages.includes(context.stage)) continue;
        try {
          await hook.onStage(context);
        } catch {
          await reportFailure(options.onFailure, { hookName: hook.name, stage: context.stage, errorCode: "hook_failed" });
        }
      }
    },
  };
}
