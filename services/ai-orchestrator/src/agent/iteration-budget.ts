// Iteration and resource budget boundary for one runtime turn.
// TODO(phase 3)
export type BudgetStopReason =
  | "completed"
  | "iteration_limit"
  | "model_attempt_limit"
  | "tool_limit"
  | "input_token_limit"
  | "output_token_limit"
  | "total_token_limit"
  | "duration_limit"
  | "aborted";

export interface IterationBudgetLimits {
  maxIterations: number;
  maxModelAttempts: number;
  maxToolCalls: number;
  maxDurationMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
}

export interface IterationBudgetInput {
  limits: IterationBudgetLimits;
  now?: () => number;
  signal?: AbortSignal;
}

export interface IterationBudgetRemaining {
  iterations: number;
  modelAttempts: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface IterationBudgetSnapshot {
  iterationCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  elapsedMs: number;
  limits: Readonly<Record<string, number | undefined>>;
}

interface Counters {
  iterations: number;
  modelAttempts: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`budget ${label} must be a non-negative integer`);
  return value;
}

export class IterationBudget {
  private readonly startedAt: number;
  private readonly now: () => number;
  private readonly signal?: AbortSignal;
  private readonly counters: Counters = { iterations: 0, modelAttempts: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private terminalReason: BudgetStopReason | undefined;

  constructor(private readonly input: IterationBudgetInput) {
    this.now = input.now ?? Date.now;
    this.startedAt = this.now();
    this.signal = input.signal;
    for (const [key, value] of Object.entries(input.limits)) nonNegativeInteger(value, key);
  }

  canRequestModel(inputTokens = 0): boolean {
    if (!this.ensureAvailable()) return false;
    if (inputTokens < 0 || !Number.isInteger(inputTokens)) throw new Error("budget input usage must be a non-negative integer");
    if (this.counters.inputTokens + inputTokens > this.input.limits.maxInputTokens) {
      this.stop("input_token_limit");
      return false;
    }
    return true;
  }

  consumeModelAttempt(): void {
    if (!this.canRequestModel()) throw new Error(`model request is not allowed: ${this.terminalReason ?? "budget"}`);
    if (this.counters.iterations >= this.input.limits.maxIterations) {
      this.stop("iteration_limit");
      throw new Error("iteration limit reached");
    }
    if (this.counters.modelAttempts >= this.input.limits.maxModelAttempts) {
      this.stop("model_attempt_limit");
      throw new Error("model attempt limit reached");
    }
    this.counters.iterations += 1;
    this.counters.modelAttempts += 1;
  }

  reserveToolCalls(count: number): boolean {
    nonNegativeInteger(count, "tool calls");
    if (!this.ensureAvailable()) return false;
    if (this.counters.toolCalls + count > this.input.limits.maxToolCalls) {
      this.stop("tool_limit");
      return false;
    }
    this.counters.toolCalls += count;
    return true;
  }

  recordUsage(usage: Partial<Pick<Counters, "inputTokens" | "outputTokens" | "totalTokens">>): void {
    const next = { ...this.counters };
    for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
      const value = usage[key];
      if (value === undefined) continue;
      next[key] += nonNegativeInteger(value, `${key} usage`);
    }
    this.counters.inputTokens = next.inputTokens;
    this.counters.outputTokens = next.outputTokens;
    this.counters.totalTokens = next.totalTokens;
    if (this.terminalReason) return;
    if (next.inputTokens > this.input.limits.maxInputTokens) this.stop("input_token_limit");
    else if (next.outputTokens > this.input.limits.maxOutputTokens) this.stop("output_token_limit");
    else if (next.totalTokens > this.input.limits.maxTotalTokens) this.stop("total_token_limit");
  }

  stopReason(): BudgetStopReason | undefined {
    this.ensureAvailable();
    return this.terminalReason;
  }

  /** Returns a limit reached while recording usage without turning an exact
   * final iteration into a stop merely because no further request is allowed. */
  terminalStopReason(): BudgetStopReason | undefined {
    return this.terminalReason;
  }

  snapshot(): IterationBudgetSnapshot {
    return Object.freeze({
      iterationCount: this.counters.iterations,
      toolCallCount: this.counters.toolCalls,
      inputTokens: this.counters.inputTokens,
      outputTokens: this.counters.outputTokens,
      totalTokens: this.counters.totalTokens,
      elapsedMs: Math.max(0, this.now() - this.startedAt),
      limits: Object.freeze({ ...this.input.limits }),
    });
  }

  remaining(): IterationBudgetRemaining {
    const durationMs = Math.max(0, this.now() - this.startedAt);
    return {
      iterations: Math.max(0, this.input.limits.maxIterations - this.counters.iterations),
      modelAttempts: Math.max(0, this.input.limits.maxModelAttempts - this.counters.modelAttempts),
      toolCalls: Math.max(0, this.input.limits.maxToolCalls - this.counters.toolCalls),
      inputTokens: Math.max(0, this.input.limits.maxInputTokens - this.counters.inputTokens),
      outputTokens: Math.max(0, this.input.limits.maxOutputTokens - this.counters.outputTokens),
      totalTokens: Math.max(0, this.input.limits.maxTotalTokens - this.counters.totalTokens),
      durationMs: Math.max(0, this.input.limits.maxDurationMs - durationMs),
    };
  }

  private ensureAvailable(): boolean {
    if (this.terminalReason) return false;
    if (this.signal?.aborted) return this.stop("aborted");
    if (this.now() - this.startedAt > this.input.limits.maxDurationMs) return this.stop("duration_limit");
    if (this.counters.iterations >= this.input.limits.maxIterations) return this.stop("iteration_limit");
    if (this.counters.modelAttempts >= this.input.limits.maxModelAttempts) return this.stop("model_attempt_limit");
    if (this.counters.inputTokens > this.input.limits.maxInputTokens) return this.stop("input_token_limit");
    if (this.counters.outputTokens > this.input.limits.maxOutputTokens) return this.stop("output_token_limit");
    if (this.counters.totalTokens > this.input.limits.maxTotalTokens) return this.stop("total_token_limit");
    return true;
  }

  private stop(reason: BudgetStopReason): false {
    this.terminalReason ??= reason;
    return false;
  }
}
