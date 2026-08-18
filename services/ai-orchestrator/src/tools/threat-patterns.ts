export type ToolThreatCode = "shell_metacharacter" | "shell_execution" | "path_traversal" | "absolute_path" | "argument_depth";

export interface ToolThreatFinding {
  readonly code: ToolThreatCode;
  readonly field: string;
}

const SHELL_META = /[;&|`$<>\r\n]/u;
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u;

function scanValue(value: unknown, field: string, depth: number, findings: ToolThreatFinding[]): void {
  if (depth > 8) {
    findings.push({ code: "argument_depth", field });
    return;
  }
  if (typeof value === "string") {
    if (SHELL_META.test(value)) findings.push({ code: "shell_metacharacter", field });
    if (ABSOLUTE_PATH.test(value)) findings.push({ code: "absolute_path", field });
    if (value.split(/[\\/]/u).some((part) => part === "..")) findings.push({ code: "path_traversal", field });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${field}[${index}]`, depth + 1, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childField = field ? `${field}.${key}` : key;
      if ((key === "shell" || key === "shellMode") && child === true) findings.push({ code: "shell_execution", field: childField });
      scanValue(child, childField, depth + 1, findings);
    }
  }
}

export function scanToolThreats(args: Record<string, unknown>): readonly ToolThreatFinding[] {
  const findings: ToolThreatFinding[] = [];
  scanValue(args, "", 0, findings);
  const unique = new Map<string, ToolThreatFinding>();
  for (const finding of findings) unique.set(`${finding.code}:${finding.field}`, finding);
  return Object.freeze([...unique.values()]);
}
