import hashlib
from pathlib import Path
import fitz
from app.drawing_intelligence.external_benchmark import ExternalBenchmarkSource, verify_external_source
from app.drawing_intelligence.plan_room import PageOverlayItem, PlanRoomRepository
from app.drawing_intelligence.solver_adapters import SolverRegistry, SolverRequest

def test_external_manifest_hash_and_plan_room_and_fail_closed_solver(tmp_path:Path):
    pdf=tmp_path/'external.pdf'; doc=fitz.open(); p=doc.new_page(); p.insert_text((72,72),'EXTERNAL TEST PLAN'); doc.save(pdf); doc.close()
    src=ExternalBenchmarkSource(source_id='ext-1',name='external',project_type='synthetic',local_path='external.pdf',sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),license='test fixture',expected_pages=1)
    result=verify_external_source(src,tmp_path); assert result.status=='PASS' and result.pages_with_text==1
    repo=PlanRoomRepository(tmp_path/'overlays.json'); item=PageOverlayItem(overlay_id='o1',project_id='P',source_document_hash=src.sha256,page_index=0,overlay_type='rfi',geometry={'x':.2,'y':.3},title='RFI source')
    repo.upsert(item); repo.upsert(item); assert len(repo.page('P',src.sha256,0))==1
    solver=SolverRegistry(); unavailable=solver.execute('hec-ras',SolverRequest(project_id='P',operation='run',inputs={},evidence_refs=['e1']))
    assert unavailable.status=='unavailable' and unavailable.evidence_refs==['e1']
