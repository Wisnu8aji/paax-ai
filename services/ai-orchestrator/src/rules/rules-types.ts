/**
 * PAAX Rules System - Types
 * Codex-compatible pattern-based rule definitions and evaluation interfaces.
 */

export type RuleDecision = "allow" | "deny" | "ask";

export type RuleType = "prefix" | "exact" | "regex" | "glob";

export interface RuleDefinition {
  readonly id: string;
  readonly type: RuleType;
  readonly pattern: readonly string[] | string | RegExp;
  readonly decision: RuleDecision;
  readonly priority?: number;
  readonly reason?: string;
  readonly description?: string;
}

export interface RuleEvaluationContext {
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly actorId?: string;
  readonly runId?: string;
}

export interface RuleMatchResult {
  readonly matched: boolean;
  readonly decision: RuleDecision;
  readonly rule?: RuleDefinition;
  readonly reason?: string;
}

export interface RulesEngineOptions {
  readonly defaultDecision?: RuleDecision;
  readonly initialRules?: readonly RuleDefinition[];
}
