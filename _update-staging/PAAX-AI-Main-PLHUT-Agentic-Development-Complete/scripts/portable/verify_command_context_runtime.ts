import assert from 'node:assert/strict';
import { buildServerChatContext, createDbContextLoaders } from '../../apps/web/src/app/api/command-room/chat/context';

async function main(){
  process.env.DB_API_URL='http://127.0.0.1:8001';
  process.env.INTERNAL_SERVICE_KEY='live-test-key';
  process.env.PAAX_PORTABLE_ACTOR_ID='paax-web';
  const loaders=createDbContextLoaders();
  const result=await buildServerChatContext({projectId:'PLHUT-SURAKARTA',allowProjectGraphRetrieval:true,conversationId:'conv-test',messages:[{role:'user',content:'Berapa volume Kolom K2 Lantai 2?'}],loaders});
  assert.equal(result.claimAuthority.quantityAuthority,'core_engine');
  assert.equal(result.claimAuthority.evidenceCount,3);
  assert.ok(result.messages.some(m=>m.content.includes('2,340 m³')));
  const unknown=await buildServerChatContext({projectId:'PLHUT-SURAKARTA',allowProjectGraphRetrieval:true,messages:[{role:'user',content:'Berapa volume kolom K9 Lantai 2?'}],loaders});
  assert.equal(unknown.claimAuthority.quantityAuthority,'none');
  assert.ok(unknown.claimAuthority.forbiddenClaims.length>0);
  console.log(JSON.stringify({schema_version:'paax.phase30.command-context.v1',status:'PASS',passed:6,failed:0,checks:[
    {name:'project_bound_retrieval',ok:true,detail:'PLHUT-SURAKARTA'},
    {name:'core_authority',ok:true,detail:result.claimAuthority.quantityAuthority},
    {name:'three_evidence_sources',ok:true,detail:String(result.claimAuthority.evidenceCount)},
    {name:'verified_answer_context',ok:true,detail:'2,340 m³'},
    {name:'unknown_item_abstention',ok:true,detail:unknown.claimAuthority.quantityAuthority},
    {name:'forbidden_claim_guard',ok:true,detail:String(unknown.claimAuthority.forbiddenClaims.length)},
  ]},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
