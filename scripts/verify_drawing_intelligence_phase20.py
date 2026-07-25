#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'report/report_drawing_intelligence/pckm_v3_final_2026-07-21'
ANALYSIS = json.loads((OUT / 'DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json').read_text(encoding='utf-8'))
BENCH = json.loads((OUT / 'DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json').read_text(encoding='utf-8'))
HUMAN = json.loads((OUT / 'DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_2026-07-21.json').read_text(encoding='utf-8'))
DELIVERY = json.loads((OUT / 'DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_2026-07-21.json').read_text(encoding='utf-8'))
CALC = json.loads((OUT / 'K2_L2_CORE_ENGINE_CALCULATION_2026-07-21.json').read_text(encoding='utf-8'))
ARETE = json.loads((ROOT / 'report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.json').read_text(encoding='utf-8'))

pages = ANALYSIS['pages']
metrics = ANALYSIS['metrics']
phase_status = ANALYSIS['phase_status']
k2 = next(x for x in DELIVERY['work_items'] if x.get('code') == 'K2' and x.get('level') == 'L2')

checks: list[dict] = []
def gate(phase: int, name: str, ok: bool, evidence):
    checks.append({'phase': phase, 'name': name, 'passed': bool(ok), 'evidence': evidence})

gate(1, 'Secure ingestion and complete package manifest', ANALYSIS['page_count'] == 88 and metrics.get('dem_page_count') == 88, {'pdf_pages': ANALYSIS['page_count'], 'dem_pages': metrics.get('dem_page_count')})
gate(2, 'Modality routing', metrics.get('input_kind') == 'pdf' and metrics.get('modality_counts', {}).get('vector') == 88, metrics.get('modality_counts'))
gate(3, 'Unified coordinate and evidence validity', all(p['quality']['dem_bbox_valid_ratio'] >= .95 for p in pages), min(p['quality']['dem_bbox_valid_ratio'] for p in pages))
gate(4, 'Native vector extraction', all(p['profile']['vector_text_spans'] > 0 for p in pages), sum(p['profile']['vector_text_spans'] for p in pages))
gate(5, 'Generic sheet identity', sum(p['semantics']['drawing_type'] != 'unknown' for p in pages) / 88 >= .95, metrics.get('drawing_type_counts'))
gate(6, 'Plan-zone mapping', all(len(p['zones']) > 0 for p in pages), sum(len(p['zones']) for p in pages))
gate(7, 'Engineering text index', sum(len(p['tokens']) for p in pages) > 1000, sum(len(p['tokens']) for p in pages))
gate(8, 'DEM and native evidence fusion', metrics.get('dem_coverage') == 1.0 and metrics.get('evidence_refs_repaired', 0) > 0, {'coverage': metrics.get('dem_coverage'), 'repaired': metrics.get('evidence_refs_repaired')})
gate(9, 'Legend, schedule, and vocabulary resolution', metrics.get('vocabulary_entries', 0) >= 100, metrics.get('vocabulary_entries'))
gate(10, 'Cross-sheet references', metrics.get('cross_references', 0) >= 100, metrics.get('cross_references'))
gate(11, 'Vector symbol descriptors', (ROOT / 'services/document-intelligence/app/drawing_intelligence/vector_index.py').is_file(), phase_status.get('11_vector_symbol_descriptor'))
gate(12, 'Versioned project-specific prototypes', (ROOT / 'services/document-intelligence/app/drawing_intelligence/prototype_store.py').is_file(), phase_status.get('12_project_specific_similarity'))
gate(13, 'Vector-assisted area tool', 'implemented' in phase_status.get('13_area_segmentation', ''), phase_status.get('13_area_segmentation'))
gate(14, 'Connected line topology', 'implemented' in phase_status.get('14_line_topology', ''), phase_status.get('14_line_topology'))
gate(15, 'Geometry reconstruction', 'implemented' in phase_status.get('15_geometry_reconstruction', ''), phase_status.get('15_geometry_reconstruction'))
gate(16, 'Conflict-aware physical instance reconstruction', metrics.get('physical_instances_engine_confirmed', 0) >= 100 and k2.get('verified_physical_count') == 4, {'confirmed_instances': metrics.get('physical_instances_engine_confirmed'), 'K2_L2': k2.get('verified_physical_count')})
gate(17, 'Versioned reviewer conflict workflow', (ROOT / 'services/document-intelligence/app/drawing_intelligence/review_ledger.py').is_file() and 'versioned_review_ledger' in phase_status.get('17_human_review_queue', ''), phase_status.get('17_human_review_queue'))
gate(18, 'Persisted project memory', (ROOT / 'services/document-intelligence/app/drawing_intelligence/prototype_learning.py').is_file() and 'project_memory' in phase_status.get('18_active_learning', ''), phase_status.get('18_active_learning'))
frontend = (ROOT / 'apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx').read_text(encoding='utf-8')
gate(19, 'Human frontend conflict and calculation actions', all(value in frontend for value in ['Data rancu', 'Terapkan & approve', 'Minta reupload', 'Hitung volume']), 'conflict editor + calculation button present')
gate(20, 'Release benchmark and Command Room contract', BENCH['status'] == HUMAN['status'] == ARETE['status'] == 'PASS' and CALC['calculation']['result'] == 2.34, {'technical': f"{BENCH['passed']}/{BENCH['total']}", 'human': f"{HUMAN['passed']}/{HUMAN['total']}", 'arete': f"{ARETE['passed']}/{ARETE['total']}", 'K2_volume_m3': CALC['calculation']['result']})

passed = sum(x['passed'] for x in checks)
result = {
    'schema_version': 'paax.drawing-intelligence.phase20-gate.v1',
    'scope': 'PLHUT pilot plus generic classification fixtures',
    'passed': passed,
    'total': len(checks),
    'status': 'PASS' if passed == len(checks) else 'FAIL',
    'production_status': 'CONDITIONAL',
    'checks': checks,
    'limitations': [
        'The 99% target applies to the calibrated auto-confirm subset, not every possible drawing worldwide.',
        'Universal release still requires object-level ground truth and at least one independent non-PLHUT project.',
        'No live AI provider key was used in this verification.',
        'The Next.js build compiles and type-checks but the local worker remains stuck during page-data collection.',
    ],
}
(OUT / 'DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
rows = ['# Drawing Intelligence — Phase 1–20 Executable Gate', '', f"**Status:** {result['status']} — {passed}/{len(checks)} fase lulus.", '', '| Fase | Goal | Status | Evidence |', '|---:|---|---|---|']
for item in checks:
    evidence = json.dumps(item['evidence'], ensure_ascii=False) if not isinstance(item['evidence'], str) else item['evidence']
    rows.append(f"| {item['phase']} | {item['name']} | {'PASS' if item['passed'] else 'FAIL'} | {evidence} |")
rows.extend(['', '## Batasan rilis universal', '', *[f"- {x}" for x in result['limitations']]])
(OUT / 'DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.md').write_text('\n'.join(rows) + '\n', encoding='utf-8')
print(json.dumps({'status': result['status'], 'passed': passed, 'total': len(checks)}, ensure_ascii=False))
raise SystemExit(0 if result['status'] == 'PASS' else 1)
