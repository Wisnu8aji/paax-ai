from __future__ import annotations
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
required=[
    'README.md','AGENTS.md','CLAUDE.md','PACKAGE_MANIFEST.json',
    'apps/web/src/components/command-room/RunStatus.tsx',
    'apps/web/src/lib/chat/activity-timeline.ts',
    'apps/web/src/app/api/command-room/chat/reasoning-visibility.ts',
    'services/ai-orchestrator/src/tools/query_project_graph.ts',
    'services/document-intelligence/app/drawing_intelligence/sheet_identity.py',
    'scripts/verify_arete_command_room_offline.py',
    'report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.json',
    'report/report_drawing_intelligence/PAAX_DI_GENERIC_ARETE_TIMELINE_REPORT_2026-07-21.md',
    'docs/plans/drawing intelligence/PAAX_DI_GENERIC_ARETE_TIMELINE_GOALS_2026-07-21.md',
]
for rel in required:
    if not (ROOT/rel).is_file(): errors.append(f'missing required file: {rel}')
page_dir=ROOT/'report/report_drawing_intelligence/dem_extraction_88pages/pages'
if not page_dir.is_dir():
    # Preserve compatibility with older source packages that keep the golden
    # fixture at the root while report artifacts remain separately indexed.
    page_dir=ROOT/'dem_extraction_88pages/pages'
pages=list(page_dir.glob('page-*.json')) if page_dir.is_dir() else []
if len(pages)!=88: errors.append(f'expected 88 DEM page JSON files, found {len(pages)}')
forbidden_dirs={'.git','node_modules','.next','dist','build','.turbo','coverage','.cache','__pycache__','.pytest_cache','.venv','venv','graphify-out'}
for p in ROOT.rglob('*'):
    rel=p.relative_to(ROOT).as_posix()
    if p.is_dir() and (p.name in forbidden_dirs or p.name.endswith('.egg-info')):
        errors.append(f'forbidden directory: {rel}')
    if p.is_file() and (
        p.name in {'.env','.env.local','.env.production'}
        or p.name.endswith('.tsbuildinfo')
        or p.suffix.lower() in {'.pyc','.pyo','.log','.db','.rar','.zip'}
    ):
        errors.append(f'forbidden file: {rel}')
secret_re=re.compile(r'(sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
for p in ROOT.rglob('*'):
    if not p.is_file() or p.stat().st_size>1_000_000 or p.name.endswith('.example'): continue
    text=p.read_text('utf-8',errors='ignore')
    if secret_re.search(text): errors.append(f'possible secret: {p.relative_to(ROOT).as_posix()}')
if errors:
    print('PACKAGE VERIFICATION FAILED')
    for item in sorted(set(errors)): print('-',item)
    raise SystemExit(1)
print('PACKAGE VERIFICATION PASSED')
print('DEM pages:',len(pages))
