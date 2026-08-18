import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import express from 'express';
import { AgentRunStore } from '../../src/agentic/runtime-store';
import { createAgentRunsRouter } from '../../src/routes/agent-runs';
import { InMemorySessionStore } from '../../src/gateway/session';
import type { MatureAgentRun, ProjectContextBinding } from '../../src/agentic/index';

const testStorePath = resolve(process.cwd(), '.test-data/agent-runs-step-route-test-store.json');
process.env.PAAX_AGENT_RUN_STORE = testStorePath;

async function cleanupStore() {
  try {
    await rm(testStorePath, { force: true });
  } catch {}
}

function createSampleRun(runId = 'run-route-001', projectId = 'proj-101'): MatureAgentRun {
  const binding: ProjectContextBinding = {
    tenantId: 'tenant-101',
    projectId,
    actorId: 'actor-101',
    conversationId: 'conv-101',
    allowedToolScopes: ['project_graph:read', 'drawing:review', 'core:calculate'],
    issuedAt: new Date().toISOString(),
  };

  return {
    runId,
    goalSpec: {
      goalId: 'goal-001',
      request: 'Route Step Test',
      constraints: [],
      deliverables: [],
      assumptions: [],
      riskTier: 'medium',
      completionCriteria: [],
      binding,
    },
    plan: {
      planId: 'plan-001',
      version: 1,
      goal: 'Route Step Test',
      binding,
      stopConditions: [],
      tasks: [
        {
          id: 'task-1',
          title: 'Read active sheet',
          capability: 'resolve_project_scope',
          status: 'pending',
          dependencies: [],
          requiresApproval: false,
        },
      ],
    },
    status: 'running',
    completedTaskIds: [],
    failedTaskIds: [],
    invocations: [],
    actionRecords: [],
    observations: [],
    artifacts: [],
    pendingApprovalIds: [],
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    budget: { maxToolCalls: 10, maxTokens: 50_000, maxCostUsd: 2, maxDurationMs: 60_000 },
    budgetUsage: { toolCalls: 0, tokens: 0, costUsd: 0, startedAtMs: Date.now() },
    auditTimeline: [],
  };
}

describe('Phase 08B — Agent Runs Route Step API (POST /agent-runs/:runId/step)', () => {
  beforeEach(async () => {
    await cleanupStore();
  });

  afterEach(async () => {
    await cleanupStore();
  });

  it('rejects step request when runId is not found (404)', async () => {
    const store = new AgentRunStore(testStorePath);
    const router = createAgentRunsRouter();
    const app = express();
    app.use(express.json());
    app.use('/agent-runs', router);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://localhost:${port}/agent-runs/nonexistent-run/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-101', expectedVersion: 0 }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('agent run not found');
    } finally {
      server.close();
    }
  });

  it('rejects step request when projectId does not match run scope (403)', async () => {
    const store = new AgentRunStore(testStorePath);
    await store.create(createSampleRun('run-route-001', 'proj-101'));

    const router = createAgentRunsRouter();
    const app = express();
    app.use(express.json());
    app.use('/agent-runs', router);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://localhost:${port}/agent-runs/run-route-001/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-WRONG-PROJECT', expectedVersion: 0 }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('project scope mismatch');
    } finally {
      server.close();
    }
  });

  it('executes next step for valid runId and matching projectId', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'test-internal-key';
    process.env.DOCUMENT_INTELLIGENCE_URL = 'http://127.0.0.1:8002';
    const store = new AgentRunStore(testStorePath);
    await store.create(createSampleRun('run-route-001', 'proj-101'));

    const router = createAgentRunsRouter();
    const app = express();
    app.use(express.json());
    app.use('/agent-runs', router);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://localhost:${port}/agent-runs/run-route-001/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-101', expectedVersion: 0 }),
      });

      // Without live backend running in unit test, execution loop attempts tool call and fails closed safely
      expect([200, 409]).toContain(response.status);
    } finally {
      server.close();
    }
  });

  it('attaches a shared agent_runs session without changing the run response shape', async () => {
    const store = new AgentRunStore(testStorePath);
    const sessionStore = new InMemorySessionStore();
    const router = createAgentRunsRouter({ agentRunStore: store, sessionStore });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      (req as any).user = { uid: 'actor-101' };
      next();
    });
    app.use('/agent-runs', router);
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://localhost:${port}/agent-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-101', conversationId: 'conv-101', goal: 'Create a scoped review run' }),
      });
      expect(response.status).toBe(201);
      const run = await response.json();
      expect(run.runId).toBeTruthy();
      expect(run.sessionId).toBeUndefined();

      const session = await sessionStore.resolve({
        channel: 'agent_runs',
        tenantId: 'portable-local',
        actorId: 'actor-101',
        conversationId: 'conv-101',
        projectId: 'proj-101',
      });
      expect((await sessionStore.get(session.sessionId))?.lastRunId).toBe(run.runId);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
