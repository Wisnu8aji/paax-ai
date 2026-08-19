import type { ActionRiskTier } from "./approval-service";

export type ApprovalPolicyMode = "never" | "user" | "auto" | "risk-based";
export type ApprovalsReviewer = "user" | "supervisor" | "automated";

export interface ApprovalPolicyConfig {
  readonly mode: ApprovalPolicyMode;
  readonly reviewer: ApprovalsReviewer;
  readonly autoApproveTiers?: readonly ActionRiskTier[];
  readonly requiredReviewTiers?: readonly ActionRiskTier[];
  readonly autoRejectTiers?: readonly ActionRiskTier[];
  readonly allowedActionsWithoutApproval?: readonly string[];
  readonly mandatoryApprovalActions?: readonly string[];
  readonly defaultTimeoutMs?: number;
}

export interface ApprovalPolicyEvaluation {
  readonly requiresApproval: boolean;
  readonly decision: "auto_approved" | "pending_review" | "auto_rejected" | "bypass";
  readonly reason: string;
  readonly riskTier: ActionRiskTier;
  readonly timeoutMs: number;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicyConfig = {
  mode: "risk-based",
  reviewer: "user",
  autoApproveTiers: ["R0", "R1"],
  requiredReviewTiers: ["R2", "R3"],
  autoRejectTiers: ["R4"],
  allowedActionsWithoutApproval: [
    "workspace_list",
    "file_read",
    "file_search",
    "query_rab",
    "query_schedule",
    "query_progress",
    "query_materials",
    "lookup_ahsp",
  ],
  mandatoryApprovalActions: [
    "export_rab_xlsx",
    "skill_manager",
    "delegate_task",
  ],
  defaultTimeoutMs: 15 * 60_000,
};

export class ApprovalPolicyEvaluator {
  private readonly config: ApprovalPolicyConfig;

  constructor(config: Partial<ApprovalPolicyConfig> = {}) {
    this.config = {
      ...DEFAULT_APPROVAL_POLICY,
      ...config,
    };
  }

  evaluate(
    action: string,
    riskTier: ActionRiskTier = "R1",
    options: { customTimeoutMs?: number } = {},
  ): ApprovalPolicyEvaluation {
    const timeoutMs = options.customTimeoutMs ?? this.config.defaultTimeoutMs ?? 15 * 60_000;

    // Policy Mode: never -> never require approval (all auto-approved)
    if (this.config.mode === "never") {
      return {
        requiresApproval: false,
        decision: "bypass",
        reason: "Approval policy is set to never require approvals",
        riskTier,
        timeoutMs,
      };
    }

    // Policy Mode: auto -> all operations auto-approved
    if (this.config.mode === "auto") {
      return {
        requiresApproval: false,
        decision: "auto_approved",
        reason: "Approval policy is set to auto-approve",
        riskTier,
        timeoutMs,
      };
    }

    // Explicit mandatory approval actions
    if (this.config.mandatoryApprovalActions?.includes(action)) {
      return {
        requiresApproval: true,
        decision: "pending_review",
        reason: `Action "${action}" is in mandatory approval list`,
        riskTier: riskTier === "R0" || riskTier === "R1" ? "R2" : riskTier,
        timeoutMs,
      };
    }

    // Policy Mode: user -> always require review for any non-whitelisted action
    if (this.config.mode === "user") {
      if (this.config.allowedActionsWithoutApproval?.includes(action)) {
        return {
          requiresApproval: false,
          decision: "auto_approved",
          reason: `Action "${action}" is allowlisted for automatic execution`,
          riskTier,
          timeoutMs,
        };
      }
      return {
        requiresApproval: true,
        decision: "pending_review",
        reason: `Approval policy "user" requires manual approval for action "${action}"`,
        riskTier,
        timeoutMs,
      };
    }

    // Policy Mode: risk-based (default)
    if (this.config.autoRejectTiers?.includes(riskTier)) {
      return {
        requiresApproval: false,
        decision: "auto_rejected",
        reason: `Risk tier ${riskTier} is configured for automatic rejection`,
        riskTier,
        timeoutMs,
      };
    }

    if (this.config.allowedActionsWithoutApproval?.includes(action) || this.config.autoApproveTiers?.includes(riskTier)) {
      return {
        requiresApproval: false,
        decision: "auto_approved",
        reason: `Risk tier ${riskTier} or action "${action}" is auto-approved`,
        riskTier,
        timeoutMs,
      };
    }

    return {
      requiresApproval: true,
      decision: "pending_review",
      reason: `Risk tier ${riskTier} requires human approval review`,
      riskTier,
      timeoutMs,
    };
  }
}

export function createApprovalPolicyEvaluator(config?: Partial<ApprovalPolicyConfig>): ApprovalPolicyEvaluator {
  return new ApprovalPolicyEvaluator(config);
}
