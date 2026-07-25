from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/document-intelligence"))
sys.path.insert(0, str(ROOT / "packages/schemas/python"))

from app.drawing_intelligence.advanced_zones import analyze_hierarchical_zones
from app.drawing_intelligence.benchmark_platform import create_locked_plhut_pack, evaluate_facts
from app.drawing_intelligence.definition_intelligence_v2 import build_definition_candidates, extract_table_cells, resolve_definition
from app.drawing_intelligence.domain_skill_packs import default_skill_packs
from app.drawing_intelligence.native_evidence import build_native_evidence_index
from app.drawing_intelligence.revision_intelligence import RevisionEntity, compare_revisions
from app.drawing_intelligence.takeoff_workspace import ScaleCalibration, TakeoffMeasurement, TakeoffWorkspaceRepository, calculate_measurement

PDF = ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
EXPECTED_HASH = "bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68"
checks=[]
def check(name, ok, detail):
    checks.append({'name':name,'ok':bool(ok),'detail':str(detail)})
    if not ok: raise AssertionError(f'{name}: {detail}')

check('pdf_exists', PDF.is_file(), PDF)
check('pdf_hash', hashlib.sha256(PDF.read_bytes()).hexdigest()==EXPECTED_HASH, EXPECTED_HASH)
doc=fitz.open(PDF)
check('pdf_pages', len(doc)==88, len(doc))
analysis=analyze_hierarchical_zones(doc[53],53)
check('page54_multi_scale', {10,25,100}.issubset({x.denominator for x in analysis.scales}), [x.denominator for x in analysis.scales])
index=build_native_evidence_index(doc[42],42)
check('native_evidence_index', len(index.records)>100, len(index.records))
cells=extract_table_cells(doc[49],49); definition=resolve_definition('K2',build_definition_candidates(cells))
check('k2_definition', definition.selected is not None and (definition.selected.width_mm,definition.selected.depth_mm)==(250,600), definition.model_dump(mode='json'))
doc.close()

with tempfile.TemporaryDirectory() as td:
    repo=TakeoffWorkspaceRepository(Path(td)/'takeoff.json')
    takeoff=repo.open_or_create('PLHUT-SURAKARTA',EXPECTED_HASH,PDF.name,88)
    cal=ScaleCalibration(calibration_id='c1',page_index=42,view_zone_id='v1',ratio_denominator=Decimal(100),source='manual',status='verified',verified_by='qs')
    m=TakeoffMeasurement(measurement_id='m1',project_id='PLHUT-SURAKARTA',source_document_hash=EXPECTED_HASH,page_index=42,view_zone_id='v1',kind='count',points=[],count=4,status='human_verified')
    m=calculate_measurement(m,cal,100,100); takeoff=repo.add_measurement(takeoff,m,'qs'); takeoff=repo.save(takeoff,0)
    check('takeoff_persistence', takeoff.revision==1 and takeoff.measurements[0].value==Decimal(4), takeoff.revision)

changes=compare_revisions([RevisionEntity(entity_id='a',semantic_key='L2:K2',quantity=Decimal('2.34'),unit='m3')],[RevisionEntity(entity_id='b',semantic_key='L2:K2',quantity=Decimal('3.51'),unit='m3')],{'L2:K2':['calc','rab']})
check('revision_stale', changes[0].quantity_delta==Decimal('1.17') and changes[0].stale_descendant_ids==['calc','rab'], changes[0].model_dump(mode='json'))
packs=default_skill_packs(); check('domain_packs', len(packs)>=10, len(packs))
pack=create_locked_plhut_pack(EXPECTED_HASH); score=evaluate_facts(pack,{f.fact_id:f.expected for f in pack.facts}); check('locked_benchmark',score.exactness==1,score.exactness)

required=[
 'services/ai-orchestrator/src/agentic/runtime-store.ts','services/ai-orchestrator/src/agentic/event-bus.ts','services/ai-orchestrator/src/agentic/claim-validator.ts',
 'apps/web/src/components/drawing-intelligence/workspace/agentic/mission-control.tsx','apps/web/src/components/drawing-intelligence/workspace/takeoff/takeoff-inspector.tsx',
 'scripts/portable/update_paax_main.py','PANDUAN-INSTALASI-DAN-UPDATE-PAAX-MAIN.md',
 'scripts/portable/paaxctl.py','scripts/portable/rollback_paax_main.py','docs/PAAX_64_PHASE_IMPLEMENTATION_MATRIX_2026-07-25.md',
 'docs/PAAX_AGENTIC_PHASE_31_64_IMPLEMENTATION_AUDIT_2026-07-25.md',
 'release/PAAX_RELEASE_CERTIFICATE.json','release/PAAX_SBOM.json','release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json','release/PAAX_FINAL_TEST_SUMMARY.json','release/PAAX_RELEASE_NOTES.md'
]
for rel in required: check('required_file:'+rel,(ROOT/rel).is_file(),rel)

phase_matrix=json.loads((ROOT/'release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json').read_text(encoding='utf-8'))
check('plan_phase_count', phase_matrix.get('plan_phase_count')==64 and len(phase_matrix.get('phases',[]))==64, phase_matrix.get('counts'))
release_cert=json.loads((ROOT/'release/PAAX_RELEASE_CERTIFICATE.json').read_text(encoding='utf-8'))
check('release_cert_truthful', release_cert.get('professional_production_certification')=='CONDITIONAL', release_cert.get('release_decision'))

with tempfile.TemporaryDirectory() as td:
    target=Path(td)/'paax-ai-main'; target.mkdir(); (target/'package.json').write_text('{}'); (target/'.env.local').write_text('KEEP=1'); (target/'data/portable').mkdir(parents=True); (target/'data/portable/paax-portable.db').write_bytes(b'db')
    cp=subprocess.run([sys.executable,str(ROOT/'scripts/portable/update_paax_main.py'),'--source',str(ROOT),'--target',str(target),'--mode','overlay','--no-backup'],capture_output=True,text=True)
    check('update_script',cp.returncode==0,cp.stderr or cp.stdout[-500:])
    check('update_preserves_env',(target/'.env.local').read_text()=='KEEP=1','env')
    check('update_preserves_db',(target/'data/portable/paax-portable.db').read_bytes()==b'db','db')
    check('update_copies_source',(target/'services/ai-orchestrator/src/agentic/runtime-store.ts').is_file(),'runtime-store')

status='PASS' if all(x['ok'] for x in checks) else 'FAIL'
print(json.dumps({'schema_version':'paax.phase62.completion.v1','status':status,'passed':sum(x['ok'] for x in checks),'failed':sum(not x['ok'] for x in checks),'checks':checks},indent=2,ensure_ascii=False))
