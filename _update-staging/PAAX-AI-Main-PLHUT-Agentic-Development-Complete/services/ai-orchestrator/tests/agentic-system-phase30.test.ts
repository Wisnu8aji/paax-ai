import { describe, expect, it } from 'vitest';
import { AgentToolRegistry, approveTask, buildEngineeringPlan, completeTask, nextReadyTask, startTask, type AgentRun, type ProjectContextBinding } from '../src/agentic';

const binding: ProjectContextBinding={tenantId:'portable',projectId:'PLHUT-SURAKARTA',actorId:'paax-web',conversationId:'conv-1',allowedToolScopes:['graph:read'],issuedAt:new Date().toISOString()};

describe('PAAX agentic control plane',()=>{
  it('builds a bounded quantity plan with deterministic calculation and verification',()=>{
    const plan=buildEngineeringPlan('Hitung volume kolom K2 Lantai 2',binding);
    expect(plan.tasks.map((task)=>task.id)).toEqual(['scope','evidence','instances','facts','calculate','verify','respond']);
    expect(plan.stopConditions).toContain('insufficient_evidence');
  });
  it('enforces project scope on every tool',async()=>{
    const registry=new AgentToolRegistry();
    registry.register({name:'graph',scope:'graph:read',sideEffect:'none',timeoutMs:1000,execute:(input:{projectId:string})=>({projectId:input.projectId})});
    await expect(registry.execute('graph',{projectId:'PLHUT-SURAKARTA'},binding)).resolves.toEqual({projectId:'PLHUT-SURAKARTA'});
    await expect(registry.execute('graph',{projectId:'OTHER'},binding)).rejects.toThrow(/scope mismatch/);
  });
  it('advances only when DAG dependencies are complete',()=>{
    const plan=buildEngineeringPlan('Audit gambar',binding);
    let run:AgentRun={runId:'run-1',plan,status:'planned',completedTaskIds:[]};
    expect(nextReadyTask(run)?.id).toBe('scope');
    run=startTask(run,'scope');
    expect(nextReadyTask(run)).toBeNull();
    run=completeTask(run,'scope');
    expect(nextReadyTask(run)?.id).toBe('evidence');
  });
});


describe('agentic approvals',()=>{
  it('requires scoped approval for authoritative writes',async()=>{
    const registry=new AgentToolRegistry();
    registry.register({name:'publish-rab',scope:'graph:read',sideEffect:'authoritative_write',timeoutMs:1000,execute:()=>({ok:true})});
    await expect(registry.execute('publish-rab',{projectId:'PLHUT-SURAKARTA'},binding)).rejects.toThrow(/approval token/);
    await expect(registry.execute('publish-rab',{projectId:'PLHUT-SURAKARTA'},binding,{tokenId:'a1',projectId:'PLHUT-SURAKARTA',toolName:'publish-rab',approvedBy:'pm-1',expiresAt:new Date(Date.now()+60000).toISOString()})).resolves.toEqual({ok:true});
  });
  it('blocks completion until approval is recorded',()=>{
    const plan=buildEngineeringPlan('Buat RAB kolom',binding);
    const cost=plan.tasks.find((task)=>task.id==='cost')!;
    let run:AgentRun={runId:'run-approval',plan,status:'running',completedTaskIds:cost.dependencies,currentTaskId:undefined};
    run=startTask(run,'cost');
    expect(run.status).toBe('waiting_approval');
    expect(()=>completeTask(run,'cost')).toThrow(/approval/);
    run=approveTask(run,'cost');
    run=completeTask(run,'cost');
    expect(run.completedTaskIds).toContain('cost');
  });
});


describe('agentic execution safety',()=>{
  it('does not start a second task while one is active',()=>{
    const plan=buildEngineeringPlan('Audit gambar',binding);
    let run:AgentRun={runId:'run-active',plan,status:'planned',completedTaskIds:[]};
    run=startTask(run,'scope');
    expect(()=>startTask(run,'evidence')).toThrow(/already active/);
  });
  it('enforces tool timeout',async()=>{
    const registry=new AgentToolRegistry();
    registry.register({name:'slow',scope:'graph:read',sideEffect:'none',timeoutMs:10,execute:async()=>{await new Promise((resolve)=>setTimeout(resolve,50)); return {ok:true};}});
    await expect(registry.execute('slow',{projectId:'PLHUT-SURAKARTA'},binding)).rejects.toThrow(/timeout/);
  });
});
