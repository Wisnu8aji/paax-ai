import { describe, expect, it } from "vitest";
import { createSandboxGuard, SandboxSecurityError } from "../../src/security/sandbox";
import { resolve } from "node:path";

describe("PAAX Sandbox Guard (paax-sandbox)", () => {
  const root = resolve(process.cwd());

  it("permits access to valid internal workspace paths in full-access mode", () => {
    const sandbox = createSandboxGuard({
      mode: "full-access",
      workspaceRoot: root,
    });

    const safePath = sandbox.assertSafePath("package.json", "read");
    expect(safePath).toContain("package.json");
  });

  it("blocks directory traversal escaping workspace root", () => {
    const sandbox = createSandboxGuard({
      mode: "full-access",
      workspaceRoot: root,
    });

    expect(() => sandbox.assertSafePath("../../Windows/System32/calc.exe", "read"))
      .toThrow(SandboxSecurityError);
  });

  it("blocks write operations in read-only mode", () => {
    const sandbox = createSandboxGuard({
      mode: "read-only",
      workspaceRoot: root,
    });

    expect(() => sandbox.assertSafePath("new_file.txt", "write"))
      .toThrow(SandboxSecurityError);
  });

  it("blocks protected files like .env and .git credentials", () => {
    const sandbox = createSandboxGuard({
      mode: "full-access",
      workspaceRoot: root,
    });

    expect(() => sandbox.assertSafePath(".env", "read"))
      .toThrow(SandboxSecurityError);
    expect(() => sandbox.assertSafePath(".env.local", "read"))
      .toThrow(SandboxSecurityError);
  });

  it("blocks elevated commands according to sandbox policy", () => {
    const sandbox = createSandboxGuard({
      mode: "elevated-deny",
      workspaceRoot: root,
    });

    expect(() => sandbox.assertSafeCommand("powershell.exe -Verb RunAs"))
      .toThrow(SandboxSecurityError);
    expect(() => sandbox.assertSafeCommand("format C:"))
      .toThrow(SandboxSecurityError);
  });
});
