"""Retry DI sheet-schedule classification."""
import json, time, urllib.request, pathlib

def load_key(name):
    f = pathlib.Path('G:/paax-ai-main/.env.local')
    if f.exists():
        for line in f.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith(name + '='):
                return line.split('=', 1)[1].strip()
    return ''

DRAWING_KEY = load_key('DRAWING_INTELLIGENCE_API_KEY')
OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

ALLOWED = ['schedule', 'detail', 'technical_note']
EVIDENCE_REFS = {'EV-SCHEDULE-1'}

prompt_content = json.dumps({
    'task': 'Propose exactly one sheet classification from allowed_categories. Return JSON only.',
    'allowed_categories': sorted(ALLOWED),
    'extracted_text': ['TABEL KOLOM', 'K1 400 x 400'],
    'bbox_evidence': [{'evidence_ref': 'EV-SCHEDULE-1', 'bbox': [80, 80, 900, 620]}],
    'required_json': {'classification_key': 'string', 'evidence_refs': ['string'], 'reason': 'string'},
    'example': {'classification_key': 'schedule', 'evidence_refs': ['EV-SCHEDULE-1'], 'reason': 'Sheet contains column schedule table'},
}, ensure_ascii=False)

payload = {
    'model': 'deepseek/deepseek-v4-pro',
    'messages': [
        {'role': 'system', 'content': 'Return ONLY valid JSON. classification_key MUST be one of the allowed_categories strings.'},
        {'role': 'user', 'content': prompt_content},
    ],
    'max_tokens': 200,
    'temperature': 0,
    'stream': False,
}
body = json.dumps(payload).encode('utf-8')

for attempt in range(3):
    print(f'Attempt {attempt+1}/3...')
    req = urllib.request.Request(OR_URL, data=body, method='POST', headers={
        'Authorization': f'Bearer {DRAWING_KEY}',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://paax.ai',
        'X-Title': 'PAAX DI Retry',
    })
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read())
        choices = raw.get('choices')
        if not choices:
            err = str(raw.get('error', {}))[:100]
            print(f'  empty choices: {err}')
            time.sleep(2)
            continue
        msg = choices[0].get('message', {})
        content = msg.get('content') or msg.get('reasoning_content') or ''
        if not content:
            print('  null content, retry')
            time.sleep(2)
            continue
        ms = int((time.perf_counter() - t0) * 1000)
        try:
            proposal = json.loads(content)
        except Exception:
            proposal = {}
        category = str(proposal.get('classification_key', ''))
        cited = set(str(v) for v in proposal.get('evidence_refs', []))
        valid = category in ALLOWED and bool(cited) and cited <= EVIDENCE_REFS
        print(f'  OK {ms}ms | category={repr(category)} | valid={valid}')
        print(f'  Full: {json.dumps(proposal, ensure_ascii=False)[:300]}')
        break
    except Exception as exc:
        print(f'  ERROR: {exc}')
        time.sleep(2)

print('Retry done.')
