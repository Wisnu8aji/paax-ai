from __future__ import annotations
import json, re, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
EXCLUDED={'.git','node_modules','.venv','.next','.turbo','.local-runtime','__pycache__'}
TOKEN=[re.compile(r'\bsk-(?:or-v1-)?[A-Za-z0-9_-]{20,}\b'),re.compile(r'(?i)(password|secret|api[_-]?key)\s*[:=]\s*["\'](?!your_|placeholder|example|generated)[^"\']{12,}["\']')]
findings=[]; files=0
for p in ROOT.rglob('*'):
    if not p.is_file() or any(x in EXCLUDED for x in p.relative_to(ROOT).parts): continue
    files+=1
    if p.suffix.lower() not in {'.py','.ts','.tsx','.js','.json','.md','.txt','.env','.example','.ps1','.yaml','.yml'} and not p.name.startswith('.env'): continue
    try: text=p.read_text('utf-8')
    except Exception: continue
    for pattern in TOKEN:
        for m in pattern.finditer(text): findings.append({'path':p.relative_to(ROOT).as_posix(),'pattern':pattern.pattern,'line':text[:m.start()].count('\n')+1})
report={'schema_version':'paax.security-audit.v1','status':'PASS' if not findings else 'FAIL','files_scanned':files,'findings':findings}
print(json.dumps(report,indent=2)); raise SystemExit(1 if findings else 0)
