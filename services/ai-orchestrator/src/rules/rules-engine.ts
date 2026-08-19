import { DEFAULT_RULES } from "./default.rules";
import type {
  RuleDefinition,
  RuleDecision,
  RuleEvaluationContext,
  RuleMatchResult,
  RulesEngineOptions,
} from "./rules-types";

export class RulesEngine {
  private rules: RuleDefinition[] = [];
  private readonly defaultDecision: RuleDecision;

  constructor(options: RulesEngineOptions = {}) {
    this.defaultDecision = options.defaultDecision ?? "ask";
    if (options.initialRules && options.initialRules.length > 0) {
      this.addRules(options.initialRules);
    } else {
      this.addRules(DEFAULT_RULES);
    }
  }

  addRule(rule: RuleDefinition): this {
    this.rules.push(rule);
    this.sortRules();
    return this;
  }

  addRules(rules: readonly RuleDefinition[]): this {
    this.rules.push(...rules);
    this.sortRules();
    return this;
  }

  clearRules(): this {
    this.rules = [];
    return this;
  }

  getRules(): readonly RuleDefinition[] {
    return Object.freeze([...this.rules]);
  }

  /**
   * Evaluates a command (string or token array) against active rules.
   */
  evaluate(
    commandInput: string | readonly string[],
    context: RuleEvaluationContext = {},
  ): RuleMatchResult {
    const tokens = normalizeCommandTokens(commandInput, context.args);
    if (tokens.length === 0) {
      return {
        matched: false,
        decision: this.defaultDecision,
        reason: "Empty command string",
      };
    }

    const fullCommandStr = tokens.join(" ");

    // Check rules in order of priority (highest priority first)
    for (const rule of this.rules) {
      if (this.matchesRule(rule, tokens, fullCommandStr)) {
        return {
          matched: true,
          decision: rule.decision,
          rule,
          reason: rule.reason ?? `Matched rule ${rule.id} (${rule.type})`,
        };
      }
    }

    // Default fallback
    return {
      matched: false,
      decision: this.defaultDecision,
      reason: `No matching rule found, applying default decision "${this.defaultDecision}"`,
    };
  }

  isAllowed(commandInput: string | readonly string[], context: RuleEvaluationContext = {}): boolean {
    return this.evaluate(commandInput, context).decision === "allow";
  }

  isDenied(commandInput: string | readonly string[], context: RuleEvaluationContext = {}): boolean {
    return this.evaluate(commandInput, context).decision === "deny";
  }

  private matchesRule(
    rule: RuleDefinition,
    tokens: readonly string[],
    fullCommandStr: string,
  ): boolean {
    switch (rule.type) {
      case "prefix": {
        if (!Array.isArray(rule.pattern)) return false;
        const patternArr = rule.pattern as readonly string[];
        if (patternArr.length > tokens.length) return false;
        return patternArr.every((patternPart, index) => {
          const token = tokens[index];
          return token.localeCompare(patternPart, undefined, { sensitivity: "accent" }) === 0 ||
                 token.toLowerCase() === patternPart.toLowerCase();
        });
      }

      case "exact": {
        if (!Array.isArray(rule.pattern)) {
          if (typeof rule.pattern === "string") {
            return fullCommandStr.toLowerCase() === (rule.pattern as string).toLowerCase();
          }
          return false;
        }
        const patternArr = rule.pattern as readonly string[];
        if (patternArr.length !== tokens.length) return false;
        return patternArr.every((patternPart, index) => {
          return tokens[index].toLowerCase() === patternPart.toLowerCase();
        });
      }

      case "regex": {
        let regex: RegExp;
        if (rule.pattern instanceof RegExp) {
          regex = rule.pattern;
        } else if (typeof rule.pattern === "string") {
          regex = new RegExp(rule.pattern, "ui");
        } else {
          return false;
        }
        return regex.test(fullCommandStr);
      }

      case "glob": {
        if (typeof rule.pattern === "string") {
          const regexStr = "^" + escapeRegex(rule.pattern).replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
          return new RegExp(regexStr, "i").test(fullCommandStr);
        }
        return false;
      }

      default:
        return false;
    }
  }

  private sortRules(): void {
    // Sort descending by priority (higher priority evaluated first)
    this.rules.sort((a, b) => {
      const pA = a.priority ?? (a.decision === "deny" ? 50 : 10);
      const pB = b.priority ?? (b.decision === "deny" ? 50 : 10);
      return pB - pA;
    });
  }
}

function normalizeCommandTokens(
  commandInput: string | readonly string[],
  extraArgs?: readonly string[],
): string[] {
  if (Array.isArray(commandInput)) {
    const combined = [...commandInput, ...(extraArgs ?? [])];
    return combined.map((s) => String(s).trim()).filter(Boolean);
  }

  const str = String(commandInput || "").trim();
  if (!str) return [];

  // Simple token splitter respecting quotes
  const tokens: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      tokens.push(match[0]);
    }
  }

  if (extraArgs && extraArgs.length > 0) {
    tokens.push(...extraArgs.map((s) => String(s).trim()).filter(Boolean));
  }

  return tokens;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createRulesEngine(options?: RulesEngineOptions): RulesEngine {
  return new RulesEngine(options);
}
