from __future__ import annotations
import hashlib, json, statistics, time
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[2]
PDF=ROOT/'GAMBAR KERJA PLHUT SURAKARTA (1).pdf'
EXPECTED='bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68'

def main()->int:
    start=time.perf_counter(); document=fitz.open(PDF); pages=[]; chars=0; drawings=0
    for page in document:
        t=time.perf_counter(); text=page.get_text('text'); vector=page.get_drawings()
        elapsed=time.perf_counter()-t; chars+=len(text); drawings+=len(vector); pages.append(elapsed)
    total=time.perf_counter()-start; document.close()
    digest=hashlib.sha256(PDF.read_bytes()).hexdigest()
    report={
      'schema_version':'paax.performance.phase62.v1','status':'PASS' if digest==EXPECTED and len(pages)==88 and total<20 else 'FAIL',
      'pdf_sha256':digest,'pages':len(pages),'total_seconds':round(total,4),'pages_per_second':round(len(pages)/total,2),
      'page_latency_ms':{'mean':round(statistics.mean(pages)*1000,3),'p95':round(sorted(pages)[int(len(pages)*.95)-1]*1000,3),'max':round(max(pages)*1000,3)},
      'text_characters':chars,'native_drawing_groups':drawings,'thresholds':{'total_seconds_lt':20,'pages':88},
    }
    print(json.dumps(report,indent=2)); return 0 if report['status']=='PASS' else 1
if __name__=='__main__': raise SystemExit(main())
