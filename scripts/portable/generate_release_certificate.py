from __future__ import annotations
import hashlib, json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'report/phase62_completion_2026-07-25'

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
artifacts={}
for name in ['PHASE62_COMPLETION.json','PHASE64_COMPLETION_FINAL.txt','AGENTIC_RUNTIME.json','CONCURRENCY_TEST.json','CONCURRENCY_TEST_FINAL.txt','PERFORMANCE_BENCHMARK.json','PERFORMANCE_BENCHMARK_FINAL.txt','LIVE_PHASE30_RUNTIME_FINAL.txt','LIVE_PHASE62_ENDPOINTS.json','LIVE_TAKEOFF_PERSISTENCE.json','PLHUT_IDEMPOTENT_RESTART.json','UPDATE_INTEGRATION_TEST.json','UPDATE_ROLLBACK_FINAL.json','TYPESCRIPT_SYNTAX.json','TYPESCRIPT_SYNTAX_FINAL.txt','SECURITY_AUDIT_FINAL.txt','ADVANCED_PHASE_TESTS_FINAL.txt','CORE_ENGINE_PYTEST_FINAL.txt']:
    p=REPORT/name
    if p.is_file(): artifacts[name]={'sha256':sha(p),'size_bytes':p.stat().st_size}

for rel in ['release/PAAX_FINAL_TEST_SUMMARY.json','release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json','release/PAAX_SBOM.json']:
    q=ROOT/rel
    if q.is_file(): artifacts[rel]={'sha256':sha(q),'size_bytes':q.stat().st_size}

cert={'schema_version':'paax.release-certificate.v2','created_at':datetime.now(timezone.utc).isoformat(),'release_class':'development integration complete','professional_production_certification':'CONDITIONAL','project_id':'PLHUT-SURAKARTA','source_pdf_sha256':'bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68','plan_phase_count':64,'tests':artifacts,'known_limits':['Full Next.js production build/browser flow was not executed in this sandbox because pnpm dependencies could not be installed from the registry.','External multi-project benchmark packs require downloadable licensed bytes and independent object-level ground truth.','Indonesian professional pilot/shadow operation requires real engineers and projects.','External solver adapters are fail-closed contracts; ETABS/MIDAS/HEC/SWMM/EPANET integrations require licensed/runtime environments.'],'release_decision':'GO for continued local development and controlled pilot preparation; NO-GO for universal unattended professional production claims.'}
p=ROOT/'release/PAAX_RELEASE_CERTIFICATE.json'; p.write_text(json.dumps(cert,ensure_ascii=False,indent=2),encoding='utf-8'); print(p)
