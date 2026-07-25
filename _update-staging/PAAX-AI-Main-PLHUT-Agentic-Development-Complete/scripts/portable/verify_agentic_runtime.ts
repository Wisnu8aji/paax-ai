import assert from 'node:assert/strict';
import {
  AgentToolRegistry,
  approveTask,
  buildEngineeringPlan,
  completeTask,
  nextReadyTask,
  startTask,
  validateProjectBinding,
  type AgentRun,
  type ProjectContextBinding,
} from '../../services/ai-orchestrator/src/agentic/index';

async function main() {
  const checks: Array<{name:string; ok:boolean; detail:string}> = [];
  const check = (name:string, ok:boolean, detail:string) => { checks.push({name,ok,detail}); assert.equal(ok,true,`${name}: ${detail}`); };
  const binding: ProjectContextBinding = validateProjectBinding({
    tenantId:'portable-local', projectId:'PLHUT-SURAKARTA', actorId:'paax-web', conversationId:'conv-plhut',
    snapshotId:'portable-snapshot', allowedToolScopes:['project_graph:read','core:calculate','rab:write'], issuedAt:new Date().toISOString(),
  });
  check('binding_project', binding.projectId === 'PLHUT-SURAKARTA', binding.projectId);
  const plan = buildEngineeringPlan('Hitung volume K2 Lantai 2 dan siapkan RAB', binding);
  check('dynamic_plan', plan.tasks.some(t=>t.id==='calculate') && plan.tasks.some(t=>t.id==='cost'), plan.tasks.map(t=>t.id).join(','));
  let run: AgentRun = {runId:'run-test',plan,status:'planned',completedTaskIds:[]};
  while (run.status !== 'completed') {
    const next = nextReadyTask(run);
    check('ready_task_exists', Boolean(next), run.status);
    run = startTask(run, next!.id);
    if (run.status === 'waiting_approval') run = approveTask(run, next!.id);
    run = completeTask(run, next!.id);
  }
  check('run_completed', run.completedTaskIds.length === plan.tasks.length, `${run.completedTaskIds.length}/${plan.tasks.length}`);

  const registry = new AgentToolRegistry();
  registry.register({name:'read_graph',scope:'project_graph:read',sideEffect:'none',timeoutMs:100,execute:({projectId}:{projectId?:string})=>({projectId,count:4})});
  registry.register({name:'write_rab',scope:'rab:write',sideEffect:'authoritative_write',timeoutMs:100,execute:({projectId}:{projectId?:string})=>({projectId,status:'drafted'})});
  registry.register({name:'slow_tool',scope:'project_graph:read',sideEffect:'none',timeoutMs:10,execute:async()=>{await new Promise(r=>setTimeout(r,50)); return true;}});
  const read = await registry.execute<{projectId:string},{projectId:string;count:number}>('read_graph',{projectId:'PLHUT-SURAKARTA'},binding);
  check('scoped_read', read.count === 4, JSON.stringify(read));
  let mismatch=false; try { await registry.execute('read_graph',{projectId:'OTHER'},binding); } catch { mismatch=true; }
  check('cross_project_blocked', mismatch, 'OTHER rejected');
  let approvalBlocked=false; try { await registry.execute('write_rab',{projectId:'PLHUT-SURAKARTA'},binding); } catch { approvalBlocked=true; }
  check('authoritative_write_blocked', approvalBlocked, 'approval required');
  const write = await registry.execute<{projectId:string},{status:string}>('write_rab',{projectId:'PLHUT-SURAKARTA'},binding,{tokenId:'a1',projectId:'PLHUT-SURAKARTA',toolName:'write_rab',approvedBy:'pm',expiresAt:new Date(Date.now()+60000).toISOString()});
  check('approved_write', write.status === 'drafted', write.status);
  let timedOut=false; try { await registry.execute('slow_tool',{projectId:'PLHUT-SURAKARTA'},binding); } catch (e) { timedOut=String(e).includes('timeout'); }
  check('tool_timeout', timedOut, 'slow tool terminated by contract');
  const out={schema_version:'paax.phase30.agentic-runtime.v1',status:'PASS',passed:checks.length,failed:0,checks};
  console.log(JSON.stringify(out,null,2));
}
main().catch((error)=>{console.error(error); process.exit(1);});
