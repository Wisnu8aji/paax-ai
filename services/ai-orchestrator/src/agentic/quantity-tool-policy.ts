export type QuantityPolicyStatus = 'allowed' | 'waiting_approval' | 'blocked';

export interface QuantityActionSpec {
  toolName: string;
  projectId: string;
  actorId?: string;
  actorRoles?: string[];
  input: Record<string, unknown>;
  riskTier?: 'low' | 'medium' | 'high' | 'critical' | 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
}

export interface ApprovalTokenContext {
  approvalId?: string;
  tokenId?: string;
  projectId: string;
  toolName: string;
  approvedBy: string;
  actorRoles?: string[];
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
}

export interface BudgetContext {
  maxToolCalls: number;
  maxTokens: number;
  maxCostUsd: number;
  maxDurationMs: number;
  usage: {
    toolCalls: number;
    tokens: number;
    costUsd: number;
    startedAtMs: number;
  };
}

export interface QuantityPolicyDecision {
  status: QuantityPolicyStatus;
  reason: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const AUTHORIZED_ROLES = new Set(['estimator', 'pm', 'admin', 'R3', 'R4', 'chief_estimator']);

const PROHIBITED_PAYLOAD_KEYS = new Set([
  'quantity',
  'final_quantity',
  'volume',
  'area',
  'length',
  'width',
  'depth',
  'height',
  'unitprice',
  'totalprice',
  'cost',
  'amount',
  'formula',
  'result',
  'total',
  'count',
  'value',
]);

export function validateQuantityPayloadInput(input: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, reason: 'Payload input must be an object' };
  }

  for (const key of Object.keys(input)) {
    const lowerKey = key.toLowerCase();
    if (PROHIBITED_PAYLOAD_KEYS.has(lowerKey)) {
      return {
        valid: false,
        reason: `Direct numeric payload or formula override is prohibited: key '${key}' is forbidden`,
      };
    }
  }

  const { projectId, measurementFactIds, idempotencyKey } = input;

  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { valid: false, reason: 'projectId is required and must be a non-empty string' };
  }

  if (!Array.isArray(measurementFactIds) || measurementFactIds.length === 0) {
    return { valid: false, reason: 'measurementFactIds is required and must be a non-empty array' };
  }

  for (const id of measurementFactIds) {
    if (typeof id !== 'string' || !id.trim()) {
      return { valid: false, reason: 'measurementFactIds elements must be non-empty strings' };
    }
  }

  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    return { valid: false, reason: 'idempotencyKey is required and must be a non-empty string' };
  }

  return { valid: true };
}

export function authorizeQuantityAction(
  action: QuantityActionSpec,
  approval?: ApprovalTokenContext,
  budget?: BudgetContext,
  nowMs = Date.now()
): QuantityPolicyDecision {
  const timestamp = new Date(nowMs).toISOString();
  const logDecision = (
    status: QuantityPolicyStatus,
    reason: string,
    extraData?: Record<string, unknown>
  ): QuantityPolicyDecision => ({
    status,
    reason,
    timestamp,
    data: {
      toolName: action.toolName,
      projectId: action.projectId,
      riskTier: action.riskTier ?? 'high',
      ...extraData,
    },
  });

  // 1. Budget Fail-Closed Check per Dimension
  if (budget) {
    const { maxToolCalls, maxTokens, maxCostUsd, maxDurationMs, usage } = budget;

    if (usage.toolCalls >= maxToolCalls) {
      return logDecision('blocked', 'Budget dimension exhausted: maxToolCalls', {
        dimension: 'maxToolCalls',
        limit: maxToolCalls,
        actual: usage.toolCalls,
      });
    }
    if (usage.tokens >= maxTokens) {
      return logDecision('blocked', 'Budget dimension exhausted: maxTokens', {
        dimension: 'maxTokens',
        limit: maxTokens,
        actual: usage.tokens,
      });
    }
    if (usage.costUsd >= maxCostUsd) {
      return logDecision('blocked', 'Budget dimension exhausted: maxCostUsd', {
        dimension: 'maxCostUsd',
        limit: maxCostUsd,
        actual: usage.costUsd,
      });
    }
    if (nowMs - usage.startedAtMs >= maxDurationMs) {
      return logDecision('blocked', 'Budget dimension exhausted: maxDurationMs', {
        dimension: 'maxDurationMs',
        limit: maxDurationMs,
        actual: nowMs - usage.startedAtMs,
      });
    }
  }

  // 2. Direct Numeric & Unknown Payload Rejection
  if (action.toolName === 'core_engine.calculate_measurement_facts') {
    const payloadValidation = validateQuantityPayloadInput(action.input);
    if (!payloadValidation.valid) {
      return logDecision('blocked', payloadValidation.reason ?? 'Invalid payload input');
    }
  }

  // 3. Approval Gate Requirement for High-Risk / Authoritative Actions
  const isHighRisk =
    action.toolName === 'core_engine.calculate_measurement_facts' ||
    ['high', 'critical', 'R3', 'R4'].includes(action.riskTier ?? 'high');

  if (isHighRisk) {
    if (!approval) {
      return logDecision(
        'waiting_approval',
        'Authoritative quantity calculation requires human approval'
      );
    }

    if (approval.status === 'pending') {
      return logDecision(
        'waiting_approval',
        'Approval request is pending human decision'
      );
    }

    if (approval.status === 'rejected') {
      return logDecision('blocked', 'Approval request was rejected');
    }

    if (approval.status === 'expired' || Date.parse(approval.expiresAt) <= nowMs) {
      return logDecision('blocked', 'Approval token is expired');
    }

    if (approval.projectId !== action.projectId) {
      return logDecision(
        'blocked',
        `Approval project binding mismatch: expected ${action.projectId}, got ${approval.projectId}`
      );
    }

    if (approval.toolName !== action.toolName) {
      return logDecision(
        'blocked',
        `Approval tool name mismatch: expected ${action.toolName}, got ${approval.toolName}`
      );
    }

    // Role / RBAC verification
    const roles = action.actorRoles ?? approval.actorRoles ?? [];
    if (roles.length > 0 && !roles.some((r) => AUTHORIZED_ROLES.has(r))) {
      return logDecision(
        'blocked',
        `Actor role '${roles.join(', ')}' is not authorized for high-risk quantity actions`
      );
    }
  }

  return logDecision('allowed', 'Quantity action authorized');
}
