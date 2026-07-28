"""Lucent 5x + Arete 5x Command Room live test. Run directly."""
import sys, json, time, urllib.request, urllib.error, pathlib
import os
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

def load_key(name):
    import os
    v = os.environ.get(name, '').strip()
    if v:
        return v
    f = pathlib.Path('G:/paax-ai-main/.env.local')
    if f.exists():
        for line in f.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith(name + '='):
                return line.split('=', 1)[1].strip()
    return ''

DEEPSEEK_KEY = load_key('DEEPSEEK_API_KEY')
DRAWING_KEY  = load_key('DRAWING_INTELLIGENCE_API_KEY')
OR_URL = 'https://openrouter.ai/api/v1/chat/completions'
SYSTEM = 'Anda adalah PAAX, asisten AI untuk insinyur sipil Indonesia. Jawab dalam Bahasa Indonesia profesional.'

LUCENT_TESTS = [
    'Halo, apa saja jenis gambar kerja yang biasa ada dalam proyek konstruksi gedung bertingkat?',
    'Apa perbedaan antara kolom K1 dan K2 pada dokumen gambar kerja arsitektur?',
    'Bagaimana cara membaca tabel kolom pada gambar kerja untuk menentukan dimensi beton?',
    'Bagaimana sistem klasifikasi sheet gambar kerja bangunan bertingkat berdasarkan level lantai?',
    'Apa itu quantity takeoff dan mengapa penting dalam proyek konstruksi?',
]

ARETE_TESTS = [
    'Halo, bisa jelaskan perbedaan denah lantai 1 dan denah struktur lantai 1?',
    'Apa yang dimaksud dengan klasifikasi sheet: cover, drawing list, dan technical note?',
    'Jelaskan perbedaan antara tampak depan, tampak samping, dan potongan pada gambar arsitektur.',
    'Apa yang dimaksud MEP dalam gambar kerja dan sheet apa saja yang termasuk kategori MEP?',
    'Dalam drawing intelligence, apa perbedaan antara DEM extraction dan PCKM synthesis?',
]

DI_TESTS = [
    {'model':'qwen/qwen3.7-plus','case_id':'sheet-cover','extracted_text':['GAMBAR KERJA','DAFTAR ISI GAMBAR'],'bbox_evidence':[{'evidence_ref':'EV-COVER-1','bbox':[40,40,520,160]}],'allowed_categories':['cover','drawing_list','technical_note']},
    {'model':'deepseek/deepseek-v4-pro','case_id':'sheet-plan-l1','extracted_text':['DENAH LANTAI 1','SKALA 1:100'],'bbox_evidence':[{'evidence_ref':'EV-PLAN-1','bbox':[35,20,480,90]}],'allowed_categories':['plan','site_plan','detail']},
    {'model':'qwen/qwen3.7-plus','case_id':'sheet-section','extracted_text':['POTONGAN A-A','ELEVASI +4.000'],'bbox_evidence':[{'evidence_ref':'EV-SECTION-1','bbox':[60,30,500,120]}],'allowed_categories':['section','elevation','detail']},
    {'model':'deepseek/deepseek-v4-pro','case_id':'sheet-schedule','extracted_text':['TABEL KOLOM','K1 400 x 400'],'bbox_evidence':[{'evidence_ref':'EV-SCHEDULE-1','bbox':[80,80,900,620]}],'allowed_categories':['schedule','detail','technical_note']},
    {'model':'qwen/qwen3.7-plus','case_id':'sheet-mep-diagram','extracted_text':['SINGLE LINE DIAGRAM','PANEL DISTRIBUSI'],'bbox_evidence':[{'evidence_ref':'EV-DIAGRAM-1','bbox':[50,45,740,520]}],'allowed_categories':['diagram','plan','technical_note']},
]


def call_or(api_key, model_slug, messages, max_tokens=400):
    payload = {'model': model_slug, 'messages': messages, 'max_tokens': max_tokens, 'temperature': 0, 'stream': False}
    body = json.dumps(payload).encode('utf-8')
    for attempt in range(3):
        if attempt > 0:
            print(f'    [retry {attempt}] 3s...')
            time.sleep(3)
        req = urllib.request.Request(OR_URL, data=body, method='POST', headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://paax.ai',
            'X-Title': 'PAAX Live Test',
        })
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body_text = exc.read().decode('utf-8', errors='replace')
            print(f'    HTTP {exc.code}: {body_text[:120]}')
            continue
        choices = raw.get('choices')
        if not choices:
            err = raw.get('error', raw)
            print(f'    empty choices: {str(err)[:120]}')
            continue
        ms = int((time.perf_counter() - t0) * 1000)
        msg = choices[0].get('message', {})
        content = msg.get('content') or msg.get('reasoning_content') or ''
        if not content:
            print(f'    null content (reasoning-only?), retry...')
            last_err = RuntimeError('null content in response')
            continue
        tokens = raw.get('usage', {}).get('completion_tokens', 0)
        return {'status': 'ok', 'ms': ms, 'tokens': tokens, 'preview': content[:250]}
    return {'status': 'error', 'ms': 0, 'tokens': 0, 'preview': ''}


all_results = {}

# --- Lucent 5x ---
print('=== [1/3] LUCENT (DeepSeek/deepseek-v4-pro) 5x ===')
lucent_results = []
for i, q in enumerate(LUCENT_TESTS):
    print(f'  [{i+1}/5] {q[:65]}...')
    r = call_or(DEEPSEEK_KEY, 'deepseek/deepseek-v4-pro', [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': q},
    ])
    r['question'] = q
    lucent_results.append(r)
    if r['status'] == 'ok':
        print(f'    OK {r["ms"]}ms | {r["tokens"]} tokens | {r["preview"][:100]}...')
    else:
        print(f'    FAILED')
    time.sleep(0.5)

lucent_ok = sum(1 for r in lucent_results if r['status'] == 'ok')
print(f'Lucent: {lucent_ok}/5 OK')
all_results['lucent'] = lucent_results

# --- Arete 5x ---
print()
print('=== [2/3] ARETE (Qwen/qwen3.7-plus) 5x ===')
arete_results = []
for i, q in enumerate(ARETE_TESTS):
    print(f'  [{i+1}/5] {q[:65]}...')
    r = call_or(DEEPSEEK_KEY, 'qwen/qwen3.7-plus', [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': q},
    ])
    r['question'] = q
    arete_results.append(r)
    if r['status'] == 'ok':
        print(f'    OK {r["ms"]}ms | {r["tokens"]} tokens | {r["preview"][:100]}...')
    else:
        print(f'    FAILED')
    time.sleep(0.5)

arete_ok = sum(1 for r in arete_results if r['status'] == 'ok')
print(f'Arete: {arete_ok}/5 OK')
all_results['arete'] = arete_results

# --- Drawing Intelligence 5x ---
print()
print('=== [3/3] DRAWING INTELLIGENCE classification 5x (NO 88-page re-analysis) ===')
di_results = []
for i, tc in enumerate(DI_TESTS):
    print(f'  [{i+1}/5] {tc["model"].split("/")[-1]} | {tc["case_id"]}')
    evidence_refs = {item['evidence_ref'] for item in tc['bbox_evidence']}
    prompt_content = json.dumps({
        'task': 'Propose one sheet classification for human review. Never calculate quantities.',
        'allowed_categories': sorted(tc['allowed_categories']),
        'extracted_text': tc['extracted_text'],
        'bbox_evidence': tc['bbox_evidence'],
        'required_json': {'classification_key': 'string', 'evidence_refs': ['string'], 'reason': 'string'},
    }, ensure_ascii=False)
    r = call_or(DRAWING_KEY, tc['model'], [
        {'role': 'system', 'content': 'Return JSON only. Cite only supplied evidence refs.'},
        {'role': 'user', 'content': prompt_content},
    ], max_tokens=200)
    proposal = {}
    if r['status'] == 'ok':
        try:
            proposal = json.loads(r['preview'])
        except Exception:
            proposal = {}
        category = str(proposal.get('classification_key', ''))
        cited = set(str(v) for v in proposal.get('evidence_refs', []))
        valid = category in tc['allowed_categories'] and bool(cited) and cited <= evidence_refs
        r['case_id'] = tc['case_id']
        r['category'] = category
        r['valid'] = valid
        print(f'    OK {r["ms"]}ms | category={category} | valid={valid}')
    else:
        r['case_id'] = tc['case_id']
        r['valid'] = False
        print(f'    FAILED')
    di_results.append(r)
    time.sleep(0.5)

di_ok = sum(1 for r in di_results if r['status'] == 'ok')
di_valid = sum(1 for r in di_results if r.get('valid'))
print(f'DI: {di_ok}/5 OK | {di_valid}/5 valid proposals')
all_results['drawing_intelligence'] = di_results

# --- Save report ---
out = pathlib.Path('G:/paax-ai-feedback1-remediation/report/report_drawing_intelligence/LIVE_AI_TEST_2026-07-27.json')
report = {
    'timestamp': __import__('datetime').datetime.now().isoformat(),
    'command_room_lucent': {'ok': lucent_ok, 'total': 5, 'results': lucent_results},
    'command_room_arete': {'ok': arete_ok, 'total': 5, 'results': arete_results},
    'drawing_intelligence': {'ok': di_ok, 'total': 5, 'valid': di_valid, 'results': di_results},
    'summary': {
        'command_room_total': f'{lucent_ok + arete_ok}/10',
        'lucent_5x': f'{lucent_ok}/5',
        'arete_5x': f'{arete_ok}/5',
        'drawing_intelligence_5x': f'{di_ok}/5 ok | {di_valid}/5 valid',
        'noir_excluded': True,
        'no_88page_reanalysis': True,
    }
}
out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')

print()
print('=== FINAL SUMMARY ===')
print(f'Command Room Lucent : {lucent_ok}/5')
print(f'Command Room Arete  : {arete_ok}/5')
print(f'Drawing Intelligence: {di_ok}/5 ok | {di_valid}/5 valid')
print(f'Report: {out}')
sys.exit(0 if lucent_ok + arete_ok + di_ok == 15 else 1)
