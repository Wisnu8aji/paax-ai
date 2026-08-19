import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { RuleDefinition, RuleDecision, RuleType } from "./rules-types";

export class RulesLoadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RulesLoadError";
  }
}

/**
 * Parses Codex-style DSL rule definitions from a string.
 *
 * Supported formats:
 * - prefix_rule(pattern=["git", "status"], decision="allow")
 * - exact_rule(pattern=["pwd"], decision="allow")
 * - regex_rule(pattern="rm\\s+-rf", decision="deny")
 * - deny_rule(pattern=["rm", "-rf"], reason="destructive")
 * - allow_rule(pattern=["pnpm", "test"])
 */
export function parseRulesContent(content: string, sourceName = "rules"): RuleDefinition[] {
  const lines = content.split(/\r?\n/u);
  const rules: RuleDefinition[] = [];
  let lineNum = 0;

  for (const rawLine of lines) {
    lineNum++;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) {
      continue;
    }

    try {
      const parsed = parseRuleLine(line, `${sourceName}:${lineNum}`);
      if (parsed) {
        rules.push(parsed);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new RulesLoadError("syntax_error", `Error parsing rules at ${sourceName}:${lineNum}: ${message}`);
    }
  }

  return rules;
}

function parseRuleLine(line: string, ruleId: string): RuleDefinition | null {
  // prefix_rule(pattern=[...], decision="allow")
  const funcMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)\s*$/u.exec(line);
  if (!funcMatch) {
    throw new Error(`Invalid rule syntax: "${line}"`);
  }

  const funcName = funcMatch[1].toLowerCase();
  const argsString = funcMatch[2].trim();

  let ruleType: RuleType = "prefix";
  let defaultDecision: RuleDecision = "allow";

  if (funcName === "prefix_rule") {
    ruleType = "prefix";
  } else if (funcName === "exact_rule") {
    ruleType = "exact";
  } else if (funcName === "regex_rule") {
    ruleType = "regex";
  } else if (funcName === "deny_rule") {
    ruleType = "prefix";
    defaultDecision = "deny";
  } else if (funcName === "allow_rule") {
    ruleType = "prefix";
    defaultDecision = "allow";
  } else if (funcName === "ask_rule") {
    ruleType = "prefix";
    defaultDecision = "ask";
  } else {
    throw new Error(`Unknown rule function "${funcName}"`);
  }

  const parsedArgs = parseNamedArguments(argsString);

  let pattern: readonly string[] | string | RegExp;
  if (ruleType === "regex") {
    if (typeof parsedArgs.pattern !== "string") {
      throw new Error(`regex_rule requires string pattern, got ${typeof parsedArgs.pattern}`);
    }
    pattern = new RegExp(parsedArgs.pattern, "u");
  } else if (Array.isArray(parsedArgs.pattern)) {
    pattern = Object.freeze(parsedArgs.pattern.map((item) => String(item)));
  } else if (typeof parsedArgs.pattern === "string") {
    pattern = Object.freeze([parsedArgs.pattern]);
  } else {
    throw new Error(`Missing or invalid pattern parameter in rule`);
  }

  const decision: RuleDecision =
    typeof parsedArgs.decision === "string" && ["allow", "deny", "ask"].includes(parsedArgs.decision.toLowerCase())
      ? (parsedArgs.decision.toLowerCase() as RuleDecision)
      : defaultDecision;

  const priority = typeof parsedArgs.priority === "number" ? parsedArgs.priority : decision === "deny" ? 50 : 10;
  const reason = typeof parsedArgs.reason === "string" ? parsedArgs.reason : undefined;
  const description = typeof parsedArgs.description === "string" ? parsedArgs.description : undefined;

  return {
    id: `rule-${ruleId.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
    type: ruleType,
    pattern,
    decision,
    priority,
    reason,
    description,
  };
}

function parseNamedArguments(argsString: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Simple JSON-like key=value parser
  // Matches key = value, where value can be [...], "...", '...', or number/boolean
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\[[^\]]*\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,]+)(?:,|$)/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(argsString)) !== null) {
    const key = match[1];
    const rawVal = match[2].trim();

    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      // JSON array
      try {
        result[key] = JSON.parse(rawVal);
      } catch {
        // Fallback: split by comma, clean quotes
        result[key] = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }
    } else if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
      try {
        result[key] = JSON.parse(rawVal.startsWith("'") ? `"${rawVal.slice(1, -1).replace(/"/g, '\\"')}"` : rawVal);
      } catch {
        result[key] = rawVal.slice(1, -1);
      }
    } else if (!Number.isNaN(Number(rawVal))) {
      result[key] = Number(rawVal);
    } else if (rawVal === "true") {
      result[key] = true;
    } else if (rawVal === "false") {
      result[key] = false;
    } else {
      result[key] = rawVal;
    }
  }

  return result;
}

/**
 * Loads rules from a `.rules` file path.
 */
export async function loadRulesFromFile(filePath: string): Promise<RuleDefinition[]> {
  const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  try {
    const content = await readFile(resolved, "utf8");
    return parseRulesContent(content, resolved);
  } catch (err) {
    if (err instanceof RulesLoadError) throw err;
    throw new RulesLoadError("file_read_error", `Could not read rules file ${resolved}: ${err}`);
  }
}
