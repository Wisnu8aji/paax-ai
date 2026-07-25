import { Router, type Request } from 'express';
import { resolve } from 'node:path';
import {
  AgentRunStore,
  MatureAreteOrchestrator,
  type MatureRunStatus,
  type ProjectContextBinding,
} from '../agentic/index';
import { AgentToolRegistry } from '../agentic/tool-contract';

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
    allowedToolScopes: Array.isArray(body.allowedToolScopes) ? body.allowedToolScopes : ['project_graph:read', 'core:calculate', 'rab:draft'],
    issuedAt: new Date().toISOString(),
  };
}

export function createAgentRunsRouter(): Router {
  const router = Router();
  const path = process.env.PAAX_AGENT_RUN_STORE || resolve(process.cwd(), '../../data/portable/agent-runs.json');
  const store = new AgentRunStore(path);
  const tools = new AgentToolRegistry();
  const orchestrator = new MatureAreteOrchestrator(store, tools);

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
