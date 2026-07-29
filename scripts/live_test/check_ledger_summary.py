import json, pathlib
data = json.load(open('report/report_drawing_intelligence/PAAX_AI_FEATURE_FINAL_LEDGER.json', encoding='utf-8'))
print('Schema:', data['schema_version'])
print('Records:', data['total_records_count'])
print()
print('Feature summary:')
for feat, info in data['feature_summary'].items():
    ta = info['total_attempts']
    ns = info['network_sent_count']
    pb = info['is_provider_backed']
    print(f'  {feat}: attempts={ta}, network_sent={ns}, provider_backed={pb}')
print()
live = [r for r in data['records'] if r['execution_mode'] == 'live_provider']
print(f'Live records ({len(live)}):')
for r in live:
    rid = r['provider_request_id']
    short_rid = rid[:30] if rid else None
    feat = r['feature']
    att = r['attempt']
    case = r['case']
    hs = r['http_status']
    sv = r['response_schema_valid']
    print(f'  {feat} #{att} [{case}] -> status={hs} schema_valid={sv} req_id={short_rid}')
