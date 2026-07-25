export interface RunBudget {
  maxToolCalls: number;
  maxTokens: number;
  maxCostUsd: number;
  maxDurationMs: number;
}

export interface BudgetUsage {
  toolCalls: number;
  tokens: number;
  costUsd: number;
  startedAtMs: number;
}

export class AgentBudgetManager {
  private usage: BudgetUsage;
  constructor(readonly budget: RunBudget, startedAtMs = Date.now()) {
    if (budget.maxToolCalls <= 0 || budget.maxTokens <= 0 || budget.maxCostUsd < 0 || budget.maxDurationMs <= 0) {
      throw new Error('invalid run budget');
    }
    this.usage = { toolCalls: 0, tokens: 0, costUsd: 0, startedAtMs };
  }

  consume(input: { toolCalls?: number; tokens?: number; costUsd?: number }, nowMs = Date.now()): BudgetUsage {
    const next = {
      ...this.usage,
      toolCalls: this.usage.toolCalls + (input.toolCalls ?? 0),
      tokens: this.usage.tokens + (input.tokens ?? 0),
      costUsd: this.usage.costUsd + (input.costUsd ?? 0),
    };
    if (next.toolCalls > this.budget.maxToolCalls) throw new Error('budget exhausted: tool calls');
    if (next.tokens > this.budget.maxTokens) throw new Error('budget exhausted: tokens');
    if (next.costUsd > this.budget.maxCostUsd) throw new Error('budget exhausted: cost');
    if (nowMs - next.startedAtMs > this.budget.maxDurationMs) throw new Error('budget exhausted: duration');
    this.usage = next;
    return { ...this.usage };
  }

  snapshot(): BudgetUsage { return { ...this.usage }; }
}

export interface SandboxPolicy {
  allowedExecutables: string[];
  allowNetwork: boolean;
  allowSecrets: boolean;
  maxOutputBytes: number;
}

export interface SandboxCommand {
  executable: string;
  args: string[];
  requestsNetwork?: boolean;
  requestsSecrets?: boolean;
  expectedOutputBytes?: number;
}

export function validateSandboxCommand(command: SandboxCommand, policy: SandboxPolicy): void {
  if (!policy.allowedExecutables.includes(command.executable)) throw new Error(`sandbox executable blocked: ${command.executable}`);
  if (command.requestsNetwork && !policy.allowNetwork) throw new Error('sandbox network access blocked');
  if (command.requestsSecrets && !policy.allowSecrets) throw new Error('sandbox secret access blocked');
  if ((command.expectedOutputBytes ?? 0) > policy.maxOutputBytes) throw new Error('sandbox output limit exceeded');
  const joined = command.args.join(' ').toLowerCase();
  if (/\b(?:rm\s+-rf|format|shutdown|reboot)\b/.test(joined)) throw new Error('sandbox destructive command blocked');
}

export interface RetryPolicy { maxAttempts: number; retryableErrors: string[]; baseDelayMs: number; }
export function shouldRetry(policy: RetryPolicy, attempt: number, errorCode: string): boolean {
  return attempt < policy.maxAttempts && policy.retryableErrors.includes(errorCode);
}
