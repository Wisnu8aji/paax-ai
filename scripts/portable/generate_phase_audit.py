from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

V='VERIFIED_IMPLEMENTATION'
C='IMPLEMENTED_WITH_ENVIRONMENT_LIMIT'
F='FRAMEWORK_READY_EXTERNAL_VALIDATION_REQUIRED'
P='PROFESSIONAL_PILOT_REQUIRED'

rows=[
('1.1','Freeze, forensic inventory, dan baseline reproducibility',V,'Git baseline d452d9f; source PDF hash; Phase30/Phase64 reports and release manifest.'),
('1.2','Security incident response dan secret-free packaging',C,'Security scanner 0 findings and credential-free ZIP. Rotation/revocation of keys previously exposed remains an owner action.'),
('1.3','Portable archive builder yang valid dan deterministic',V,'Deterministic make_zip.py, normalized timestamp, secret scan, integrity test and release manifest.'),
('1.4','Runtime supervisor dan preflight controller',C,'Preflight, setup/start/stop and paaxctl doctor/status/logs/reset implemented. Full Windows UI startup must be run on target PC.'),
('1.5','Persistent database dan migration-first startup',V,'Non-destructive DB startup, backup/restore, update preservation and restart persistence tested.'),
('1.6','Idempotent PLHUT Project Bootstrap Service',V,'One PLHUT project after restart; additional project preserved; repair/bootstrap manifest.'),
('1.7','Canonical PLHUT Artifact Bundle',V,'Original 88-page PDF, DEM pages, graph, civil work items, source manifest and canonical K2 facts bundled.'),
('1.8','Unified actor identity dan authorization correction',V,'Portable actor paax-web shared by proxy/services; signed ProjectContextBinding and cross-project rejection tests.'),
('1.9','Conversation-to-Project Binding repair',V,'Conversation inherits project independent of connector toggle; runtime Command Room binding tests pass.'),
('1.10','Source PDF renderer dan real page layer',C,'Real page image endpoint and source URL mapping tested. Full Next.js browser build is target-environment validation.'),
('1.11','Corrected Portable Guide and self-verifying setup',V,'Installation/update/rollback guide, doctor, verification commands and troubleshooting included.'),
('1.12','Stage-1 end-to-end certification',C,'Backend live runtime, extraction, source render, persistence and acceptance workspace pass; full Next.js production browser flow remains target-PC validation.'),
('2.1','Canonical civil taxonomy dan ontology Indonesia',V,'civil_taxonomy.py, taxonomy.py, aliases and user-facing Civil Work Item projection.'),
('2.2','LBS dan WBS engine',V,'lbs_wbs.py and work item grouping for substructure, levels, roof and disciplines.'),
('2.3','Hybrid classification engine',V,'Deterministic-first hybrid_classifier.py with evidence and no unsupported final authority.'),
('2.4','Hierarchical plan zones dan multi-view sheets',C,'advanced_zones.py and multi-scale page 54 tests pass; interactive zone editing requires full web runtime validation.'),
('2.5','Native evidence index dan coordinate engine',V,'Native text/vector evidence, transform metadata and spatial query tested on PLHUT.'),
('2.6','Schedule, legend, table, dan definition intelligence',V,'Cell evidence and exact K2 250x600 definition resolver tested through live API.'),
('2.7','Physical Instance Reconstruction v2',V,'Scope/exclusion/dedup/conflict-aware reconstruction and class thresholds implemented and tested.'),
('2.8','Civil Work Item Projection sebagai API utama UI',V,'User-facing quantities with location/type/unit/dimensions/count/formula/result/status/sources.'),
('2.9','Measurement Fact lifecycle dan authority gate',V,'Draft/candidate/review/verified/stale policy and Core Engine rejection boundary covered by tests.'),
('2.10','Formula Registry, unit dimensionality, dan Decimal pipeline',V,'Core formula registry, unit tests and calculation boundary: 299 tests pass.'),
('2.11','Backup Calculation Workbook adapter',V,'Numeric XLSX backup calculation produced and live runtime verified.'),
('2.12','Quantity UI redesign untuk profesional',C,'Source code and acceptance workspace implemented; complete Next.js visual QA must run after local pnpm install.'),
('2.13','Professional takeoff workbench',C,'Persistence, calibration, measurement ledger, undo, optimistic lock and takeoff UI modes implemented; full Kreo-parity canvas UX remains iterative product work.'),
('2.14','Revision, source-to-BOQ/RFI, dan stage certification',C,'Revision diff/stale propagation, entity links and existing RAB/RFI primitives implemented; full cross-module UI certification remains target-runtime work.'),
('3.1','Agentic control plane dan run state machine',V,'Persistent AgentRun store, legal transitions, pause/resume/branch/replay.'),
('3.2','Goal resolver dan structured planning',V,'Mature orchestrator and structured engineering task plans.'),
('3.3','Tool Registry dan agent-computer interface',V,'Typed tools, scopes, side effects, timeout and approval contracts.'),
('3.4','ProjectContextBinding enforcement',V,'Signed binding, tamper and project-isolation tests.'),
('3.5','Arete sebagai single chief orchestrator',V,'Chief orchestrator pattern with evidence-first execution and no direct calculation authority.'),
('3.6','Dynamic specialist worker router',V,'Router activates only relevant domain workers; tested in direct TypeScript runtime.'),
('3.7','Memory architecture terpisah dan versioned',V,'Project/episodic/procedural/reviewer memory store with project isolation.'),
('3.8','Event bus dan reactive workflows',V,'Durable JSONL journal, idempotency and dead-letter recovery.'),
('3.9','Claim-Evidence Builder and Validator',V,'Numerical claims require valid evidence/authority; unsupported claims fail.'),
('3.10','Independent checker separation',V,'Checker separated from designer/orchestrator in claim validation pipeline.'),
('3.11','Approval and action authority service',V,'Role/action approval checks and signed approval tokens.'),
('3.12','Failure recovery, budgets, dan sandbox',V,'Budget exhaustion, retry, duration/tool/cost guards and network-command blocking.'),
('3.13','Mission Control dan reusable Skills',C,'Mission Control source and 10 domain skill packs implemented; full web service visual QA requires target Node dependencies.'),
('3.14','Stage-3 agentic certification',C,'30 agent runtime checks and strict TypeScript compile pass; full orchestrator HTTP service/browser E2E conditional.'),
('4.1','Structural drawing and quantity agent pack',F,'Structural skill pack and deterministic quantity tools exist; broad external structural project validation and solver integrations required.'),
('4.2','Architecture and finishing agent pack',F,'Architecture/finish workflows are registered; generalized room/finish detection needs external annotated projects.'),
('4.3','MEP topology and coordination agent pack',F,'MEP skill/topology contracts exist; full MEP graph and clash benchmark require external data.'),
('4.4','QS, RAB, AHSP, dan cost intelligence',C,'Core RAB/AHSP mapping, formula, quantities and tests exist; regional catalog governance/pilot validation remains.'),
('4.5','Schedule and project controls agent',F,'Skill and solver contract are present; production CPM/productivity dashboards require domain implementation and project data.'),
('4.6','Geotechnical, survey, and earthwork pack',F,'Fail-closed skill/solver adapters exist; borelog/GIS/TIN integrations require external runtimes/data.'),
('4.7','Road, drainage, bridge, and water pack',F,'Infrastructure skills and adapter contracts exist; HEC/SWMM/EPANET/MIDAS integrations require licensed/installed tools.'),
('4.8','QA/QC, materials, dan SMKK',F,'QA/Safety skill contracts and governance are available; policy registries and real project workflows require professional validation.'),
('4.9','RFI, issue, contract, correspondence',C,'Entity links, existing RFI primitives and contract skill are implemented; legal/commercial production approval remains human-gated.'),
('4.10','Plan Room, revision, field, dan site convergence',C,'Persistent unified overlay repository and revision links implemented; full field UI/site event integration remains target-product work.'),
('4.11','BIM/VDC, digital twin, asset lifecycle',F,'Lifecycle skill and fail-closed connector contracts exist; IFC/digital twin live integrations are not certified.'),
('4.12','Professional exports, interoperability, certification',C,'XLSX/JSON/API contracts exist. Full BCF/IFC-linked exports and domain scorecards require external pilot.'),
('5.1','Independent ground truth governance',V,'Original PDF authority policy and independent PLHUT ground truth preserved.'),
('5.2','Locked PLHUT regression benchmark',V,'Locked benchmark 11/11 exact and known PLHUT facts/conflicts retained.'),
('5.3','External multi-project benchmark packs',F,'Manifest/schema/downloader contract prepared; licensed bytes, two-reviewer GT and comparative runs remain external.'),
('5.4','Layered accuracy and calibration metrics',C,'Layered benchmark/evaluation schemas implemented; calibrated curves need multiple external projects.'),
('5.5','Agent trajectory and tool-use evaluation',V,'Goal/tool/recovery/evidence/approval trajectory checks included in 30-check runtime suite.'),
('5.6','Security, privacy, tenancy, prompt-injection',C,'Secret scan 0, signed context, prompt-injection scanner and project isolation tested; independent penetration test/SCA remains external.'),
('5.7','Reliability, concurrency, data consistency',V,'64 concurrent opens resolve to one document; stale writes rejected; restart and idempotency pass.'),
('5.8','Performance, compute cost, model routing',V,'88-page native extraction 9.75s/9.03 pages/s; budget and native-first routing implemented.'),
('5.9','Backup, DR, migration, portability certification',V,'Backup/restore, safe overlay, rollback, secret-free ZIP and extracted-package verification.'),
('5.10','Professional liability dan governance',V,'Governance charter, role matrix, no-self-approval and proposal/verified/approved policy included.'),
('5.11','Indonesian professional pilot dan shadow operation',P,'Protocol and scorecard are included, but a real pilot cannot be simulated or self-certified by the developer.'),
('5.12','Release gates dan continuous improvement',C,'Release policy, certificate, quality checks and rollback are included; production canary/incident data begins only after deployment.'),
]
assert len(rows)==64, len(rows)
counts={}
for _,_,status,_ in rows: counts[status]=counts.get(status,0)+1
payload={'schema_version':'paax.64-phase-implementation-matrix.v1','created_at':datetime.now(timezone.utc).isoformat(),'plan_phase_count':64,'note':'The source plan contains 64 phase headings even though earlier working labels referred to phase 62. No phase was silently removed.','counts':counts,'phases':[{'phase':p,'title':t,'status':s,'evidence_or_limit':e} for p,t,s,e in rows]}
(ROOT/'release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
legend={V:'Implemented and verified in available runtime/tests',C:'Implemented, but full target-environment/browser/integration certification remains',F:'Framework/contracts implemented; external domain data or licensed solver validation required',P:'Requires real Indonesian professional pilot'}
lines=['# PAAX — Matriks Implementasi 64 Fase','',f'**Dibuat:** {payload["created_at"]}','',"> Koreksi audit: Super Big Plan memiliki **64 fase**, bukan 62. Matriks ini mempertahankan seluruh heading fase asli dan menyatakan batas pengujian secara eksplisit.",'','## Ringkasan status','']
for k,v in counts.items(): lines.append(f'- **{k}: {v}** — {legend[k]}')
lines += ['','## Matriks fase','', '| Fase | Judul | Status | Evidence/batas |','|---|---|---|---|']
for p,t,s,e in rows: lines.append(f'| {p} | {t} | `{s}` | {e} |')
lines += ['','## Keputusan rilis','','Paket dapat digunakan sebagai **development integration complete** untuk instalasi lokal, pengembangan lanjutan, demo PLHUT, dan persiapan controlled pilot. Paket belum boleh diberi klaim universal production-certified sampai external benchmark, full Next.js target build, solver integrations yang diperlukan, penetration test independen, dan pilot profesional selesai.']
(ROOT/'docs/PAAX_64_PHASE_IMPLEMENTATION_MATRIX_2026-07-25.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps(counts,indent=2))
