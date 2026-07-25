#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]
required=[
 'GAMBAR KERJA PLHUT SURAKARTA (1).pdf',
 'dem_extraction_88pages/run_summary.json',
 'services/document-intelligence/app/drawing_intelligence/physical_instances.py',
 'services/document-intelligence/app/drawing_intelligence/definition_resolution.py',
 'services/document-intelligence/app/drawing_intelligence/spatial_resolution.py',
 'services/document-intelligence/app/drawing_intelligence/construction_graph_v3.py',
 'services/document-intelligence/app/drawing_intelligence/calculation_bridge.py',
 'services/core-engine/app/calculation_boundary.py',
 'apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx',
 'apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx',
 'scripts/verify_drawing_intelligence_phase20.py',
 'docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_FINAL_IMPLEMENTATION_REPORT_2026-07-21.md',
 'docs/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_LOCAL_TESTING_GUIDE_2026-07-21.md',
 'report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json',
 'report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.json',
 'report/report_drawing_intelligence/pckm_v3_final_2026-07-21/K2_L2_CORE_ENGINE_CALCULATION_2026-07-21.json',
 'PACKAGE_MANIFEST.json',
]
for rel in required:
    if not (ROOT/rel).is_file(): errors.append(f'missing required file: {rel}')
page_dirs=[ROOT/'dem_extraction_88pages/pages',ROOT/'report/report_drawing_intelligence/dem_extraction_88pages/pages']
counts=[len(list(p.glob('page-*.json'))) if p.is_dir() else 0 for p in page_dirs]
if max(counts)!=88: errors.append(f'expected 88 DEM pages, found {counts}')
try:
    gate=json.loads((ROOT/'report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.json').read_text(encoding='utf-8'))
    if gate.get('passed')!=20 or gate.get('total')!=20 or gate.get('status')!='PASS': errors.append('phase gate is not 20/20 PASS')
except Exception as exc: errors.append(f'cannot read phase gate: {exc}')
try:
    calc=json.loads((ROOT/'report/report_drawing_intelligence/pckm_v3_final_2026-07-21/K2_L2_CORE_ENGINE_CALCULATION_2026-07-21.json').read_text(encoding='utf-8'))
    if abs(float(calc['calculation']['result'])-2.34)>1e-9 or calc['calculation']['unit']!='m3': errors.append('K2 L2 calculation reference is not 2.34 m3')
except Exception as exc: errors.append(f'cannot read K2 calculation: {exc}')
def package_files():
    manifest = json.loads((ROOT / 'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
    paths = set(required)
    for change_type in ('added', 'changed'):
        paths.update(manifest.get('changes', {}).get(change_type, []))
    for relative in sorted(paths):
        path = ROOT / relative
        if path.is_file():
            yield path

secret=re.compile(r'(sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
for p in package_files():
    if p.stat().st_size>1_000_000 or p.name.endswith('.example'): continue
    if secret.search(p.read_text('utf-8',errors='ignore')): errors.append(f'possible secret: {p.relative_to(ROOT).as_posix()}')
if errors:
    print('PCKM V3 FINAL PACKAGE VERIFICATION FAILED')
    for e in sorted(set(errors)): print('-',e)
    sys.exit(1)
print('PCKM V3 FINAL PACKAGE VERIFICATION PASSED')
print('DEM pages:',max(counts))
print('Phase gate: 20/20 PASS')
print('K2 L2 reference: 2.34 m3')
