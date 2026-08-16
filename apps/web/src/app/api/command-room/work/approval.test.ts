import { describe, expect, it } from "vitest";
import { createWorkApproval, resolveWorkApproval } from "./approval";

describe("Work approval gate", () => {
  it("blocks until the matching session approval is resolved", async () => {
    const gate = createWorkApproval({
      approvalId: "approval-1",
      sessionId: "session-1",
      runId: "run-1",
      action: "terminal_run",
      reason: "Perintah tidak termasuk allowlist baca-saja.",
      args: { command: "Write-Output test" },
    });

    let settled = false;
    const result = gate.promise.then((approved) => { settled = true; return approved; });
    await Promise.resolve();
    expect(settled).toBe(false);

    expect(resolveWorkApproval("approval-1", "session-1", "approved")).toBe(true);
    await expect(result).resolves.toBe(true);
  });

  it("rejects an approval response routed to another session", async () => {
    const gate = createWorkApproval({
      approvalId: "approval-2",
      sessionId: "session-1",
      runId: "run-1",
      action: "terminal_run",
      reason: "approval",
      args: {},
    });

    expect(resolveWorkApproval("approval-2", "session-2", "approved")).toBe(false);
    expect(resolveWorkApproval("approval-2", "session-1", "denied")).toBe(true);
    await expect(gate.promise).resolves.toBe(false);
  });
});
