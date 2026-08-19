import type { RuleDefinition } from "./rules-types";

/**
 * Default rules for PAAX AI Agent workspace operations.
 * Mirrors OpenAI Codex rule semantics (prefix, regex, exact, deny).
 */
export const DEFAULT_RULES: readonly RuleDefinition[] = Object.freeze([
  // Explicit Deny Rules (Critical / Destructive)
  {
    id: "deny-rm-root",
    type: "regex",
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-f[a-zA-Z]*r[a-zA-Z]*)\s+[\/\\]/i,
    decision: "deny",
    priority: 100,
    reason: "Destructive root filesystem deletion is forbidden",
  },
  {
    id: "deny-destructive-disk",
    type: "regex",
    pattern: /(format\s+[a-z]:|mkfs\b|diskpart\b|dd\s+if=)/i,
    decision: "deny",
    priority: 100,
    reason: "Disk formatting and low-level disk operations are forbidden",
  },
  {
    id: "deny-powershell-admin",
    type: "regex",
    pattern: /powershell.*-verb\s+runas|start-process.*-verb\s+runas/i,
    decision: "deny",
    priority: 95,
    reason: "Elevated administrative execution is forbidden",
  },
  {
    id: "deny-secret-exposure",
    type: "regex",
    pattern: /cat\s+.*\.env(\.local)?\b|type\s+.*\.env(\.local)?\b|Get-Content\s+.*\.env(\.local)?\b/i,
    decision: "ask",
    priority: 90,
    reason: "Reading environment secret files requires explicit user confirmation",
  },

  // Safe Prefix Rules (Allowlist for daily construction / software tasks)
  {
    id: "allow-pnpm",
    type: "prefix",
    pattern: ["pnpm"],
    decision: "allow",
    priority: 10,
    description: "Allow pnpm package manager commands",
  },
  {
    id: "allow-npm",
    type: "prefix",
    pattern: ["npm"],
    decision: "allow",
    priority: 10,
    description: "Allow npm package manager commands",
  },
  {
    id: "allow-npx",
    type: "prefix",
    pattern: ["npx"],
    decision: "allow",
    priority: 10,
    description: "Allow npx package runner commands",
  },
  {
    id: "allow-python",
    type: "prefix",
    pattern: ["python"],
    decision: "allow",
    priority: 10,
    description: "Allow python runtime commands",
  },
  {
    id: "allow-uv",
    type: "prefix",
    pattern: ["uv"],
    decision: "allow",
    priority: 10,
    description: "Allow uv Python package manager commands",
  },
  {
    id: "allow-pytest",
    type: "prefix",
    pattern: ["pytest"],
    decision: "allow",
    priority: 10,
    description: "Allow pytest testing commands",
  },
  {
    id: "allow-node",
    type: "prefix",
    pattern: ["node"],
    decision: "allow",
    priority: 10,
    description: "Allow node runtime commands",
  },
  {
    id: "allow-git-status-log",
    type: "prefix",
    pattern: ["git", "status"],
    decision: "allow",
    priority: 15,
  },
  {
    id: "allow-git-diff",
    type: "prefix",
    pattern: ["git", "diff"],
    decision: "allow",
    priority: 15,
  },
  {
    id: "allow-git-log",
    type: "prefix",
    pattern: ["git", "log"],
    decision: "allow",
    priority: 15,
  },
  {
    id: "allow-powershell-get-childitem",
    type: "prefix",
    pattern: ["Get-ChildItem"],
    decision: "allow",
    priority: 10,
  },
  {
    id: "allow-powershell-get-location",
    type: "prefix",
    pattern: ["Get-Location"],
    decision: "allow",
    priority: 10,
  },
  {
    id: "allow-powershell-get-content",
    type: "prefix",
    pattern: ["Get-Content"],
    decision: "allow",
    priority: 10,
  },
]);

/**
 * Text representation of default rules in Codex .rules DSL syntax.
 */
export const DEFAULT_RULES_TEXT = `
# PAAX Default Rules Definition
prefix_rule(pattern=["pnpm"], decision="allow")
prefix_rule(pattern=["npm"], decision="allow")
prefix_rule(pattern=["npx"], decision="allow")
prefix_rule(pattern=["python"], decision="allow")
prefix_rule(pattern=["uv"], decision="allow")
prefix_rule(pattern=["pytest"], decision="allow")
prefix_rule(pattern=["node"], decision="allow")
prefix_rule(pattern=["Get-ChildItem"], decision="allow")
prefix_rule(pattern=["Get-Location"], decision="allow")
prefix_rule(pattern=["Get-Content"], decision="allow")
prefix_rule(pattern=["git", "status"], decision="allow")
prefix_rule(pattern=["git", "diff"], decision="allow")
prefix_rule(pattern=["git", "log"], decision="allow")

# Destructive Guardrails
regex_rule(pattern="rm\\\\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-f[a-zA-Z]*r[a-zA-Z]*)\\\\s+[\\\\/\\\\\\\\]", decision="deny")
regex_rule(pattern="(format\\\\s+[a-z]:|mkfs\\\\b|diskpart\\\\b)", decision="deny")
`.trim();
