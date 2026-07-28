import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRunStore } from './runtime-store';
import { AgentToolRegistry } from './tool-contract';
import { AgentExecutionLoop } from './execution-loop';
import { registerDrawingIntelligenceTools } from './drawing-tools';
import type { MatureAgentRun } from './runtime-types';

let dir = '';
afterEach(async () => { if (dir) await rm(dir,{recursive:true,force:true}); dir=''; });

function run(): MatureAgentRun {
  const now = new Date().toISOString();
  const binding = { tenantId:'T',projectId:'P',actorId:'U',conversationId:'C',allowedToolScopes:['project_graph:read','drawing:review','core:calculate'],issuedAt:now };
  return { runId:'R', goalSpec:{goalId:'G',request:'read sheet',constraints:[],deliverables:[],assumptions:[],riskTier:'medium',completionCriteria:[],binding}, plan:{planId:'PL',version:1,goal:'read',binding,tasks:[{id:'scope',title:'scope',capability:'resolve_project_scope',dependencies:[],status:'ready'}],stopConditions:[]}, status:'running', completedTaskIds:[],failedTaskIds:[],invocations:[],observations:[],artifacts:[],pendingApprovalIds:[],version:0,createdAt:now,updatedAt:now,budget:{maxToolCalls:3,maxTokens:10,maxCostUsd:1,maxDurationMs:100000},budgetUsage:{toolCalls:0,tokens:0,costUsd:0,startedAtMs:Date.now()},auditTimeline:[] };
}

describe('persisted execution loop', () => {
  it('persists invocation before tool execution and reuses idempotent success', async () => {
    dir=await mkdtemp(join(tmpdir(),'paax-agent-'));
    const store=new AgentRunStore(join(dir,'runs.json')); await store.create(run());
    const read=vi.fn().mockResolvedValue({page:1});
    const tools=registerDrawingIntelligenceTools(new AgentToolRegistry(),{readActiveSheet:read,reviewProposal:vi.fn(),calculateMeasurementFacts:vi.fn()});
    const loop=new AgentExecutionLoop(store,tools);
    let result=await loop.executeNextStep('R',0,{toolInput:{runId:'D',pageIndex:0},idempotencyKey:'same'});
    expect(result.invocations[0].status).toBe('succeeded'); expect(read).toHaveBeenCalledTimes(1);
    // Create another task with same governed call to prove replay without second handler call.
    result.plan.tasks.push({id:'scope2',title:'scope2',capability:'resolve_project_scope',dependencies:['scope'],status:'pending'});
    result=await store.update(result,result.version);
    result=await loop.executeNextStep('R',result.version,{toolInput:{runId:'D',pageIndex:0},idempotencyKey:'same'});
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.auditTimeline?.some((event)=>event.type==='tool_replayed')).toBe(true);
  });
});
