import { Router, type Request } from 'express';
import { resolve } from 'node:path';
import {
  AgentRunStore,
  MatureAreteOrchestrator,
  AgentExecutionLoop,
  registerDrawingIntelligenceTools,
  type MatureRunStatus,
  type ProjectContextBinding,
} from '../agentic/index';
import { AgentToolRegistry, type AgentApprovalToken } from '../agentic/tool-contract';
import type { SessionSource, SessionStore } from '../gateway/session';

export interface AgentRunsRouterOptions {
  sessionStore?: SessionStore;
  agentRunStore?: AgentRunStore;
}

function actor(req: Request): string { return String((req as any).user?.uid || process.env.PAAX_PORTABLE_ACTOR_ID || 'paax-web'); }

function buildBinding(req: Request): ProjectContextBinding {
  const body = req.body ?? {};
  const projectId = String(body.projectId || body.project_id || req.query.projectId || '').trim();
  const conversationId = String(body.conversationId || body.conversation_id || `agent-api-${projectId}`).trim();
  if (!projectId) throw new Error('projectId is required');
  return {
    tenantId: String(body.tenantId || 'portable-local'), projectId,
    snapshotId: body.snapshotId || undefined, documentRevisionId: body.documentRevisionId || undefined,
    actorId: actor(req), conversationId,
    allowedToolScopes: Array.isArray(body.allowedToolScopes) ? body.allowedToolScopes : ['project_graph:read', 'drawing:review', 'core:calculate', 'rab:draft'],
    issuedAt: new Date().toISOString(),
  };
}

export function createAgentRunsRouter(options: AgentRunsRouterOptions = {}): Router {
  const router = Router();
  const path = process.env.PAAX_AGENT_RUN_STORE || resolve(process.cwd(), '../../data/portable/agent-runs.json');
  const store = options.agentRunStore ?? new AgentRunStore(path);
  const tools = registerDrawingIntelligenceTools(new AgentToolRegistry(), {
    async readActiveSheet(input) {
      const base = (process.env.PAAX_DOCUMENT_INTELLIGENCE_URL || process.env.DOCUMENT_INTELLIGENCE_URL || '').replace(/\/$/, '');
      const key = process.env.INTERNAL_SERVICE_KEY;
      if (!base || !key) throw new Error('Document Intelligence service configuration (URL/Key) is required');
      const runId = String(input?.runId || (input as any)?.demRunId || '').trim();
      if (!runId) throw new Error('demRunId is required for readActiveSheet');
      const response = await fetch(`${base}/drawings/dem/${encodeURIComponent(runId)}/intelligence/pages/${input?.pageIndex ?? 0}/context`, {
        headers: { 'X-Internal-Key': key, 'X-User-Id': 'paax-web' }
      });
      if (!response.ok) throw new Error(`read active sheet context failed: HTTP ${response.status}`);
      return await response.json();
    },
    async reviewProposal(input) {
      const base = (process.env.PAAX_DB_SERVICE_URL || process.env.DB_API_URL || '').replace(/\/$/, '');
      const key = process.env.INTERNAL_SERVICE_KEY;
      if (!base || !key) throw new Error('DB service configuration (URL/Key) is required');
      const snapshotId = String((input as any).snapshotId || '').trim();
      const idempotencyKey = String((input as any).idempotencyKey || '').trim();
      if (!snapshotId || !idempotencyKey) throw new Error('snapshotId and idempotencyKey are required for review recommendation');
      const response = await fetch(`${base}/projects/${encodeURIComponent(input.projectId)}/project-graph/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key, 'X-User-Id': 'paax-web' },
        body: JSON.stringify({ snapshot_id: snapshotId, target_type: 'project_graph_correction', target_id: input.proposalId,
          recommendation: input.decision === 'approve' ? 'recommend_accept' : 'recommend_reject', rationale: input.note || 'Agent recommendation; human review required', evidence_refs: [], agent_run_id: (input as any).agentRunId || null, tool_call_id: (input as any).toolCallId || null, metadata: {}, idempotency_key: idempotencyKey })
      });
      if (response.ok) return await response.json();
      throw new Error(`review recommendation failed: HTTP ${response.status}`);
    },
    async calculateMeasurementFacts(input) {
      const base = (process.env.PAAX_DB_SERVICE_URL || process.env.DB_API_URL || '').replace(/\/$/, '');
      const key = process.env.INTERNAL_SERVICE_KEY;
      if (!base || !key) throw new Error('DB service configuration (URL/Key) is required');
      const response = await fetch(`${base}/internal/projects/${encodeURIComponent(input.projectId)}/agentic/measurement-facts/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key, 'X-User-Id': 'paax-web', 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({ measurement_fact_ids: input.measurementFactIds, idempotency_key: input.idempotencyKey })
      });
      if (!response.ok) throw new Error(`authoritative measurement calculation failed: HTTP ${response.status}`);
      return await response.json();
    },
  });
  const orchestrator = new MatureAreteOrchestrator(store, tools);
  const executionLoop = new AgentExecutionLoop(store, tools);

  router.get('/', async (req, res) => {
    const projectId = String(req.query.projectId || '').trim();
    const runs = await store.list();
    res.json(projectId ? runs.filter((run) => run.goalSpec.binding.projectId === projectId) : runs);
  });

  router.post('/', async (req, res) => {
    try {
      const binding = buildBinding(req);
      const request = String(req.body?.goal || req.body?.request || '').trim();
      if (!request) return res.status(422).json({ error: 'goal is required' });
      const run = await orchestrator.createRun(request, binding, {
        constraints: Array.isArray(req.body?.constraints) ? req.body.constraints : [],
        deliverables: Array.isArray(req.body?.deliverables) ? req.body.deliverables : [],
        assumptions: Array.isArray(req.body?.assumptions) ? req.body.assumptions : [],
        riskTier: req.body?.riskTier || 'medium',
        completionCriteria: Array.isArray(req.body?.completionCriteria) ? req.body.completionCriteria : undefined,
      });
      if (options.sessionStore) {
        const source: SessionSource = {
          channel: 'agent_runs',
          tenantId: binding.tenantId,
          actorId: binding.actorId,
          conversationId: binding.conversationId,
          projectId: binding.projectId,
          ...(binding.snapshotId ? { snapshotId: binding.snapshotId } : {}),
          ...(binding.documentRevisionId ? { documentRevisionId: binding.documentRevisionId } : {}),
        };
        const session = await options.sessionStore.resolve(source);
        await options.sessionStore.attachRun(session.sessionId, run.runId);
      }
      return res.status(201).json(run);
    } catch (error: any) { return res.status(422).json({ error: error.message }); }
  });

  router.get('/:runId', async (req, res) => {
    const run = await store.get(req.params.runId);
    if (!run) return res.status(404).json({ error: 'agent run not found' });
    const projectId = String(req.query.projectId || '').trim();
    if (projectId && run.goalSpec.binding.projectId !== projectId) return res.status(403).json({ error: 'project scope mismatch' });
    return res.json(run);
  });

  router.post('/:runId/step', async (req, res) => {
    try {
      const run = await store.get(req.params.runId);
      if (!run) return res.status(404).json({ error: 'agent run not found' });
      const projectId = String(req.body?.projectId || '').trim();
      if (!projectId || run.goalSpec.binding.projectId !== projectId) return res.status(403).json({ error: 'project scope mismatch' });
      const approvalToken = req.body?.approvalToken as AgentApprovalToken | undefined;
      const next = await executionLoop.executeNextStep(req.params.runId, Number(req.body?.expectedVersion), {
        toolInput: req.body?.toolInput && typeof req.body.toolInput === 'object' ? req.body.toolInput : undefined,
        approvalToken,
        idempotencyKey: req.body?.idempotencyKey,
        tokens: Number(req.body?.tokens || 0),
        costUsd: Number(req.body?.costUsd || 0),
      });
      return res.json(next);
    } catch (error: any) { return res.status(409).json({ error: error.message }); }
  });

  router.post('/:runId/approve', async (req, res) => {
    try {
      const run = await store.get(req.params.runId);
      if (!run) return res.status(404).json({ error: 'agent run not found' });
      const projectId = String(req.body?.projectId || '').trim();
      if (!projectId || run.goalSpec.binding.projectId !== projectId) return res.status(403).json({ error: 'project scope mismatch' });
      const approvalToken = req.body?.approvalToken as AgentApprovalToken | undefined;
      const next = await executionLoop.executeNextStep(req.params.runId, Number(req.body?.expectedVersion || run.version), {
        toolInput: req.body?.toolInput && typeof req.body.toolInput === 'object' ? req.body.toolInput : undefined,
        approvalToken,
        idempotencyKey: req.body?.idempotencyKey,
      });
      return res.json(next);
    } catch (error: any) { return res.status(409).json({ error: error.message }); }
  });

  router.post('/:runId/transition', async (req, res) => {
    try {
      const run = await store.get(req.params.runId);
      if (!run) return res.status(404).json({ error: 'agent run not found' });
      const projectId = String(req.body?.projectId || '').trim();
      if (!projectId || run.goalSpec.binding.projectId !== projectId) return res.status(403).json({ error: 'project scope mismatch' });
      const next = await store.transition(req.params.runId, String(req.body?.status) as MatureRunStatus, Number(req.body?.expectedVersion), req.body?.failure);
      return res.json(next);
    } catch (error: any) { return res.status(409).json({ error: error.message }); }
  });

  router.post('/:runId/branch', async (req, res) => {
    try {
      const source = await store.get(req.params.runId);
      if (!source) return res.status(404).json({ error: 'agent run not found' });
      if (source.goalSpec.binding.projectId !== String(req.body?.projectId || '')) return res.status(403).json({ error: 'project scope mismatch' });
      const branch = await store.branch(req.params.runId, String(req.body?.newRunId || `run-${Date.now()}`));
      return res.status(201).json(branch);
    } catch (error: any) { return res.status(409).json({ error: error.message }); }
  });

  return router;
}
