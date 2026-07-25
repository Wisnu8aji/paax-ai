from __future__ import annotations
import json, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[2]; sys.path.insert(0,str(ROOT/'services/document-intelligence'))
from app.drawing_intelligence.takeoff_workspace import TakeoffWorkspaceRepository, TakeoffMeasurement

HASH='bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68'
def main()->int:
    with tempfile.TemporaryDirectory() as d:
        repo=TakeoffWorkspaceRepository(Path(d)/'takeoff.json')
        def opened(_): return repo.open_or_create('PLHUT-SURAKARTA',HASH,'PLHUT.pdf',88).takeoff_document_id
        with ThreadPoolExecutor(max_workers=16) as pool: ids=list(pool.map(opened,range(64)))
        assert len(set(ids))==1 and len(repo.list_documents())==1
        doc=repo.get(ids[0]); assert doc is not None
        measurement=TakeoffMeasurement(measurement_id='m1',project_id='PLHUT-SURAKARTA',source_document_hash=HASH,page_index=42,view_zone_id='v',kind='count',points=[],count=4,status='human_verified')
        repo.save(repo.add_measurement(doc,measurement,'paax-web'),expected_revision=0)
        stale_failures=0
        def stale(_):
            nonlocal stale_failures
            current=repo.get(ids[0]); assert current
            try: repo.save(current,expected_revision=0)
            except RuntimeError: stale_failures+=1
        with ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(stale,range(8)))
        assert stale_failures==8
        payload={'schema_version':'paax.concurrency.phase62.v1','status':'PASS','open_attempts':64,'unique_documents':1,'optimistic_lock_rejections':stale_failures}
        print(json.dumps(payload,indent=2)); return 0
if __name__=='__main__': raise SystemExit(main())
