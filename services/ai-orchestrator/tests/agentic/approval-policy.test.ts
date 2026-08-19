import { describe, expect, it } from "vitest";
import {
  createApprovalPolicyEvaluator,
  DEFAULT_APPROVAL_POLICY,
} from "../../src/agentic/approval-policy";

describe("PAAX Approval Policy Evaluator (paax-approval)", () => {
  it("auto-approves low-risk read actions under risk-based policy", () => {
    const evaluator = createApprovalPolicyEvaluator({ mode: "risk-based" });
    const result = evaluator.evaluate("query_rab", "R0");
    expect(result.requiresApproval).toBe(false);
    expect(result.decision).toBe("auto_approved");
  });

  it("requires review for medium/high risk actions under risk-based policy", () => {
    const evaluator = createApprovalPolicyEvaluator({ mode: "risk-based" });
    const result = evaluator.evaluate("export_rab_xlsx", "R2");
    expect(result.requiresApproval).toBe(true);
    expect(result.decision).toBe("pending_review");
  });

  it("auto-rejects critical tier (R4) under risk-based policy", () => {
    const evaluator = createApprovalPolicyEvaluator({ mode: "risk-based" });
    const result = evaluator.evaluate("drop_production_db", "R4");
    expect(result.requiresApproval).toBe(false);
    expect(result.decision).toBe("auto_rejected");
  });

  it("bypasses all approvals when mode is never", () => {
    const evaluator = createApprovalPolicyEvaluator({ mode: "never" });
    const result = evaluator.evaluate("export_rab_xlsx", "R3");
    expect(result.requiresApproval).toBe(false);
    expect(result.decision).toBe("bypass");
  });

  it("requires review for any unwhitelisted action when mode is user", () => {
    const evaluator = createApprovalPolicyEvaluator({ mode: "user" });
    const result1 = evaluator.evaluate("query_rab", "R0");
    expect(result1.requiresApproval).toBe(false); // in allowedActionsWithoutApproval

    const result2 = evaluator.evaluate("custom_mutation", "R0");
    expect(result2.requiresApproval).toBe(true);
    expect(result2.decision).toBe("pending_review");
  });
});
