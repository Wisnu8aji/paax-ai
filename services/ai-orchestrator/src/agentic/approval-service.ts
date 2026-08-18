import { randomUUID } from 'node:crypto';
import type { ProjectContextBinding } from './types';
import { redactText } from '../security/redaction';

export type ActionRiskTier = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export interface ApprovalRequest {
  approvalId: string;
  tenantId?: string;
  projectId: string;
  actorId?: string;
  conversationId?: string;
  runId: string;
  taskId: string;
  action: string;
  riskTier: ActionRiskTier;
  requiredRoles: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  expiresAt: string;
  argumentsHash?: string;
  bindingFingerprint?: string;
  decidedBy?: string;
  decisionNote?: string;
}

export interface ApprovalDecisionScope {
  tenantId: string;
  projectId: string;
  conversationId: string;
  runId: string;
  argumentsHash?: string;
  bindingFingerprint?: string;
}

export interface ApprovalServiceOptions {
  onReceipt?: (receipt: ApprovalRequest) => void;
}

interface ApprovalWaiter {
  resolve: (request: ApprovalRequest) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
  timer: ReturnType<typeof setTimeout>;
}

function copy(request: ApprovalRequest): ApprovalRequest {
  return { ...request, requiredRoles: [...request.requiredRoles], ...(request.decisionNote ? { decisionNote: redactText(request.decisionNote) } : {}) };
}

function bindingMatches(request: ApprovalRequest, binding: ProjectContextBinding): boolean {
  return request.tenantId === binding.tenantId
    && request.projectId === binding.projectId
    && request.actorId === binding.actorId
    && request.conversationId === binding.conversationId;
}

export class ApprovalService {
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly waiters = new Map<string, Set<ApprovalWaiter>>();

  constructor(private readonly options: ApprovalServiceOptions = {}) {}

  request(binding: ProjectContextBinding, runId: string, taskId: string, action: string,
          riskTier: ActionRiskTier, requiredRoles: readonly string[], ttlMs = 30 * 60_000,
          options: { argumentsHash?: string; bindingFingerprint?: string } = {}): ApprovalRequest {
    if ((riskTier === 'R3' || riskTier === 'R4') && !requiredRoles.length) throw new Error('high-risk approval requires role');
    const now = Date.now();
    const request: ApprovalRequest = {
      approvalId: `approval-${randomUUID()}`, tenantId: binding.tenantId, projectId: binding.projectId,
      actorId: binding.actorId, conversationId: binding.conversationId, runId, taskId, action,
      riskTier, requiredRoles: [...requiredRoles], status: 'pending', requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + Math.max(1, Math.min(ttlMs, 10 * 60 * 60_000))).toISOString(),
      ...(options.argumentsHash ? { argumentsHash: options.argumentsHash } : {}),
      ...(options.bindingFingerprint ? { bindingFingerprint: options.bindingFingerprint } : {}),
    };
    this.approvals.set(request.approvalId, request);
    this.emitReceipt(request);
    return copy(request);
  }

  decide(approvalId: string, actorId: string, actorRoles: readonly string[], decision: 'approved' | 'rejected', note?: string, scope?: ApprovalDecisionScope): ApprovalRequest {
    return this.decideScoped(approvalId, actorId, actorRoles, decision, note, scope);
  }

  decideScoped(approvalId: string, actorId: string, actorRoles: readonly string[], decision: 'approved' | 'rejected', note?: string, scope?: ApprovalDecisionScope): ApprovalRequest {
    const request = this.approvals.get(approvalId);
    if (!request) throw new Error(`approval not found: ${approvalId}`);
    if (request.status !== 'pending') throw new Error(`approval is not pending: ${approvalId}`);
    if (scope && (request.tenantId !== scope.tenantId || request.projectId !== scope.projectId || request.conversationId !== scope.conversationId || request.runId !== scope.runId)) {
      throw new Error('approval binding mismatch');
    }
    if (scope?.argumentsHash && request.argumentsHash && scope.argumentsHash !== request.argumentsHash) throw new Error('approval arguments hash mismatch');
    if (scope?.bindingFingerprint && request.bindingFingerprint && scope.bindingFingerprint !== request.bindingFingerprint) throw new Error('approval binding fingerprint mismatch');
    if (Date.parse(request.expiresAt) <= Date.now()) { request.status = 'expired'; this.resolveWaiters(request); throw new Error(`approval expired: ${approvalId}`); }
    if (request.requiredRoles.length && !request.requiredRoles.some((role) => actorRoles.includes(role))) throw new Error('actor lacks required approval role');
    request.status = decision; request.decidedBy = actorId; request.decisionNote = note?.slice(0, 2_000);
    this.emitReceipt(request);
    this.resolveWaiters(request);
    return copy(request);
  }

  waitForDecision(approvalId: string, binding: ProjectContextBinding, signal?: AbortSignal): Promise<ApprovalRequest> {
    const request = this.approvals.get(approvalId);
    if (!request) return Promise.reject(new Error('approval not found'));
    if (!bindingMatches(request, binding)) return Promise.reject(new Error('approval binding mismatch'));
    if (request.status !== 'pending') return Promise.resolve(copy(request));
    if (Date.parse(request.expiresAt) <= Date.now()) {
      request.status = 'expired';
      return Promise.resolve(copy(request));
    }
    if (signal?.aborted) return Promise.reject(this.abortError());

    return new Promise<ApprovalRequest>((resolve, reject) => {
      const timer = setTimeout(() => {
        const current = this.approvals.get(approvalId);
        if (current?.status === 'pending') current.status = 'expired';
        this.removeWaiter(approvalId, waiter);
        const expired = this.approvals.get(approvalId);
        if (expired) resolve(copy(expired));
      }, Math.max(0, Date.parse(request.expiresAt) - Date.now()));
      if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
      const waiter: ApprovalWaiter = { resolve, reject, signal, timer };
      const abort = () => {
        this.removeWaiter(approvalId, waiter);
        reject(this.abortError());
      };
      waiter.abort = abort;
      signal?.addEventListener('abort', abort, { once: true });
      const waiters = this.waiters.get(approvalId) ?? new Set<ApprovalWaiter>();
      waiters.add(waiter);
      this.waiters.set(approvalId, waiters);
    });
  }

  get(approvalId: string): ApprovalRequest | undefined {
    const request = this.approvals.get(approvalId);
    return request ? copy(request) : undefined;
  }

  private removeWaiter(approvalId: string, waiter: ApprovalWaiter): void {
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.abort!);
    const waiters = this.waiters.get(approvalId);
    waiters?.delete(waiter);
    if (waiters && waiters.size === 0) this.waiters.delete(approvalId);
  }

  private resolveWaiters(request: ApprovalRequest): void {
    const waiters = this.waiters.get(request.approvalId);
    if (!waiters) return;
    this.waiters.delete(request.approvalId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener('abort', waiter.abort!);
      waiter.resolve(copy(request));
    }
  }

  private abortError(): Error {
    const error = new Error('approval wait aborted');
    error.name = 'AbortError';
    return error;
  }

  private emitReceipt(request: ApprovalRequest): void {
    try { this.options.onReceipt?.(copy(request)); } catch { /* receipt observers cannot change approval authority */ }
  }
}
