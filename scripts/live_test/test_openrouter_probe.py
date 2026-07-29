import urllib.request
import json
import os
import pathlib

def test_probe():
    env_path = pathlib.Path(r'G:\paax-ai-main\.env.local')
    if not env_path.exists():
        print("ERROR: .env.local does not exist!")
        return
    
    text = env_path.read_text(encoding='utf-8')
    api_key = ''
    for line in text.splitlines():
        if line.startswith('DRAWING_INTELLIGENCE_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('\'"')
            break

    if not api_key:
        print("ERROR: DRAWING_INTELLIGENCE_API_KEY not found in .env.local")
        return

    url = 'https://openrouter.ai/api/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://paax.ai',
        'X-Title': 'PAAX Drawing Intelligence'
    }
    payload = {
        'model': 'deepseek/deepseek-v4-flash',
        'messages': [
            {'role': 'user', 'content': 'Respond with valid JSON: {"status": "ok", "feature": "probe"}'}
        ],
        'max_tokens': 100,
        'response_format': {'type': 'json_object'}
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            print('HTTP Status:', resp.status)
            print('Model returned:', res_data.get('model'))
            choices = res_data.get('choices', [])
            if choices:
                print('Content:', choices[0]['message']['content'])
            print('OpenRouter live call test SUCCESS!')
    except urllib.error.HTTPError as exc:
        print('HTTP Error:', exc.code)
        print('Response:', exc.read().decode('utf-8'))

if __name__ == '__main__':
    test_probe()
