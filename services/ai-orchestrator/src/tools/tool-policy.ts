import type { ToolDefinition, ToolPolicyMetadata } from "./types";

const FAIL_CLOSED_POLICY: ToolPolicyMetadata = Object.freeze({
  available: false,
  riskTier: "critical",
  sideEffect: "external",
  approval: "always",
  concurrency: "sequential",
});

/** Missing metadata is a policy failure, never an implicit grant. */
export function getToolPolicy(tool: ToolDefinition): ToolPolicyMetadata {
  return tool.policy ?? FAIL_CLOSED_POLICY;
}

export function withToolPolicy(tool: ToolDefinition, policy: ToolPolicyMetadata): ToolDefinition {
  return { ...tool, policy: Object.freeze({ ...policy }) };
}

function isReadOnlyTerminalCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  const clean = command.trim();
  if (!clean || /[;&|`$<>]/.test(clean) || /(^|\s)(\.\.|[A-Za-z]:\\)/.test(clean)) return false;
  return /^(pwd|Get-Location|Get-ChildItem(?:\s+[\w./\\-]+)*|Get-Content\s+[\w./\\-]+|rg\s+[\w*?.:/\\-]+(?:\s+[\w./\\-]+)*|git\s+(?:status|branch|log)(?:\s+[\w./\\-]+)*|node\s+--version|pnpm\s+--version|npm\s+--version)$/i.test(clean);
}

export function toolRequiresApproval(tool: ToolDefinition, args: Record<string, unknown>): boolean {
  const policy = getToolPolicy(tool);
  if (!policy.available) return true;
  if (policy.requiresApproval === true) return true;
  if (policy.requiresApproval === false && policy.approval === "never") return false;
  if (policy.approval === "always") return true;
  if (policy.approval === "never") return false;
  if (tool.declaration.name === "terminal_run") return !isReadOnlyTerminalCommand(args.command);
  return true;
}
