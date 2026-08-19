/**
 * PAAX Hooks System - Types
 * Codex-compatible lifecycle hooks for AI Agent execution stages.
 */

export type HookLifecycle =
  | "session_start"
  | "user_prompt_submit"
  | "pre_tool_use"
  | "post_tool_use"
  | "model_response"
  | "turn_complete"
  | "stop";

export type HookAction = "continue" | "modify" | "block";

export interface HookContext {
  readonly lifecycle: HookLifecycle;
  readonly runId?: string;
  readonly sessionId?: string;
  readonly actorId?: string;
  readonly toolName?: string;
  readonly toolArgs?: unknown;
  readonly toolResult?: unknown;
  readonly userPrompt?: string;
  readonly modelResponse?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HookResult {
  readonly action: HookAction;
  readonly data?: Record<string, unknown>;
  readonly reason?: string;
  readonly error?: Error;
}

export type HookHandler = (context: HookContext) => Promise<HookResult> | HookResult;

export interface HookDefinition {
  readonly id: string;
  readonly name: string;
  readonly lifecycle: HookLifecycle;
  readonly handler?: HookHandler;
  readonly command?: string;
  readonly matcher?: string | RegExp;
  readonly priority?: number;
  readonly trustedHash?: string;
  readonly description?: string;
}

export interface HookStateConfig {
  readonly trustedHash?: string;
  readonly enabled?: boolean;
}

export interface HooksJsonConfig {
  readonly hooks?: Partial<Record<string, Array<{
    readonly matcher?: string;
    readonly hooks?: Array<{
      readonly type: "command" | "function" | "script";
      readonly command?: string;
      readonly name?: string;
    }>;
  }>>>;
}
