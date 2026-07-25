from __future__ import annotations
import hashlib, json, re
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def digest(path: Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
components=[]
package=ROOT/'package.json'
if package.is_file():
    p=json.loads(package.read_text(encoding='utf-8'))
    for group in ('dependencies','devDependencies'):
        for name,version in sorted((p.get(group) or {}).items()):
            components.append({'type':'npm','name':name,'version':version,'scope':group})
for pyproject in sorted(ROOT.glob('services/*/pyproject.toml'))+sorted(ROOT.glob('packages/*/python/pyproject.toml')):
    text=pyproject.read_text(encoding='utf-8',errors='replace')
    name=re.search(r'(?m)^name\s*=\s*"([^"]+)"',text)
    version=re.search(r'(?m)^version\s*=\s*"([^"]+)"',text)
    components.append({'type':'python-project','name':name.group(1) if name else pyproject.parent.name,'version':version.group(1) if version else 'workspace','path':pyproject.relative_to(ROOT).as_posix()})
files=[]
for rel in ['pnpm-lock.yaml','package.json','GAMBAR KERJA PLHUT SURAKARTA (1).pdf','fixtures/plhut/project-manifest.json']:
    p=ROOT/rel
    if p.is_file(): files.append({'path':rel,'sha256':digest(p),'size_bytes':p.stat().st_size})
out={'bomFormat':'CycloneDX-inspired','specVersion':'1.5-lite','serialNumber':'urn:uuid:paax-plhut-20260725','created_at':datetime.now(timezone.utc).isoformat(),'components':components,'key_files':files,'note':'Workspace-oriented SBOM. Run ecosystem-native scanners in CI/pilot for transitive vulnerability certification.'}
path=ROOT/'release/PAAX_SBOM.json'; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8'); print(path)
