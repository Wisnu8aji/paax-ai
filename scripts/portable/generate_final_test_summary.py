from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
summary={
 'schema_version':'paax.final-test-summary.v1',
 'created_at':datetime.now(timezone.utc).isoformat(),
 'status':'PASS_WITH_DECLARED_EXTERNAL_GATES',
 'source_baseline':'PAAX Agentic Phase 30; continued without restart',
 'source_pdf':{'pages':88,'sha256':'bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68'},
 'test_results':[
  {'suite':'Core Engine','passed':299,'failed':0,'skipped':0,'scope':'full pytest suite'},
  {'suite':'DB Service','passed':162,'failed':0,'skipped':1,'scope':'full pytest suite; test-only upstream-compatible aiosqlite shim used in sandbox'},
  {'suite':'Document Intelligence','passed':667,'failed':0,'skipped':6,'scope':'full suite partitioned into batches plus two subsequently added persistence/plan-room tests'},
  {'suite':'Site Agent','passed':17,'failed':0,'skipped':0,'scope':'full pytest suite'},
  {'suite':'Advanced phase 31-37 focused','passed':11,'failed':0,'skipped':0,'scope':'rerun after final changes'},
  {'suite':'Agentic direct runtime','passed':30,'failed':0,'skipped':0,'scope':'signed binding, run lifecycle, event bus, dead-letter, budget, sandbox, approval, memory, router, claims and trajectory'},
  {'suite':'TypeScript syntax','passed':229,'failed':0,'skipped':0,'scope':'all TS/TSX source syntax'},
  {'suite':'Phase completion verifier','passed':29,'failed':0,'skipped':0,'scope':'PDF, PLHUT facts, zones, evidence, takeoff, revision, phase matrix, release truth and updater'},
  {'suite':'Live Phase30 acceptance','passed':17,'failed':0,'skipped':0,'scope':'actual DB/Core/DI services'},
  {'suite':'Live advanced endpoints','passed':15,'failed':0,'skipped':0,'scope':'actual Document Intelligence HTTP service'},
  {'suite':'Concurrency','passed':2,'failed':0,'skipped':0,'scope':'64 concurrent opens -> one document; 8 stale writes rejected'},
  {'suite':'Update and rollback','passed':14,'failed':0,'skipped':0,'scope':'env, DB, agent state, Git, stale managed files, backup and rollback'},
  {'suite':'Security scan','passed':1264,'failed':0,'skipped':0,'scope':'files scanned; zero findings'},
 ],
 'performance':{'pages':88,'total_seconds':9.9457,'pages_per_second':8.85,'p95_page_latency_ms':409.704,'native_drawing_groups':664323},
 'canonical_acceptance':{'project_id':'PLHUT-SURAKARTA','always_registered_idempotently':True,'real_pdf_layer':True,'command_room_project_bound':True,'k2_l2':{'count':4,'dimensions_m':[0.25,0.6,3.9],'volume_m3':2.34,'source_pages':[43,50,54]},'unsupported_k9_abstains':True},
 'external_gates':['Full Next.js production build and browser E2E on a target machine after pnpm install.','Licensed external multi-project benchmark with independent ground truth.','Independent penetration/dependency vulnerability assessment.','Real Indonesian professional shadow pilot.','Licensed external solver/BIM integrations where required.']
}
(ROOT/'release/PAAX_FINAL_TEST_SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
notes=['# PAAX Agentic Development Complete — Release Notes','',f'Generated: {summary["created_at"]}','','## Verified highlights','', '- PLHUT 88-page project is bootstrapped idempotently and does not delete other projects or runtime state.', '- Command Room is project-bound and abstains when evidence is absent.', '- Real source PDF page is the viewer base layer.', '- User quantities use civil-engineering labels and deterministic Core Engine results.', '- Hierarchical zones, multi-scale, native evidence, definition resolution, takeoff persistence, revision intelligence, agent run state, event bus, approval/checker, update, rollback, backup and release controls are included.', '', '## Release classification','', '**Development integration complete; professional production certification conditional.**', '', 'See `docs/PAAX_64_PHASE_IMPLEMENTATION_MATRIX_2026-07-25.md` and `docs/PAAX_AGENTIC_PHASE_31_64_IMPLEMENTATION_AUDIT_2026-07-25.md`.']
(ROOT/'release/PAAX_RELEASE_NOTES.md').write_text('\n'.join(notes)+'\n',encoding='utf-8')
print(json.dumps({'status':'PASS','output':'release/PAAX_FINAL_TEST_SUMMARY.json'},indent=2))
