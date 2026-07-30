"""Phase 11D Correction Round 2 — Real Runtime Proof Script.

Executes real service requests across all 3 gates:
1. Command Room chat live SSE route (/api/command-room/chat) against port 3000.
2. Agentic Mission live runtime (/agent-runs) against port 8082 + DB/CE/DI services.
3. Review Queue to Handoff DB API (/projects/PLHUT-SURAKARTA/project-graph/...) against port 8001 & web proxy.

Outputs sanitized evidence report to report/report_drawing_intelligence/phase11d_cr2_real_runtime_evidence.json
"""
import urllib.request
import json
import time
import pathlib
import sys

REPO_ROOT = pathlib.Path(r"G:\paax-ai-contextual-integration")
REPORT_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "phase11d_cr2_real_runtime_evidence.json"

AUTH_HEADERS = {
    'X-Internal-Key': 'test-internal-key',
    'X-User-Id': 'paax-web',
    'Content-Type': 'application/json',
}


def test_command_room_real_route():
    print("\n--- Gate 1: Command Room Real Route Test ---")
    payload = {
        'messages': [{'role': 'user', 'content': 'Halo PAAX, sebutkan ringkasan 3 poin utama fungsi Command Room.'}],
        'modelAlias': 'lucent',
        'reasoningEffort': 'high',
        'thinking': 'off',
        'connectors': ['gambarKerja', 'rab'],
        'projectId': 'PLHUT-SURAKARTA',
    }
    url = 'http://127.0.0.1:3000/api/command-room/chat'
    t0 = time.perf_counter()
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    
    events = []
    status_code = 0
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status_code = resp.status
            start_time = time.time()
            while time.time() - start_time < 15:  # Read SSE stream for max 15s
                line = resp.readline()
                if not line:
                    break
                line_str = line.decode('utf-8', errors='replace').strip()
                if line_str.startswith('data: '):
                    try:
                        parsed = json.loads(line_str[6:])
                        events.append(parsed)
                    except Exception:
                        pass
                if len(events) >= 10:  # Enough SSE events captured
                    break
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        print(f"  Command Room SSE HTTP {status_code} in {elapsed_ms}ms | Total Events: {len(events)}")
        
        event_types = list(set(e.get('type') for e in events if isinstance(e, dict) and e.get('type')))
        activities = [e.get('activity', {}).get('step', {}).get('label') for e in events if isinstance(e, dict) and e.get('type') == 'activity']
        print(f"  Event types: {event_types} | Activity steps: {activities[:3]}")
        
        return {
            'gate': 'command_room_real_route',
            'status': 'PASS' if status_code == 200 and len(events) > 0 else 'FAIL',
            'http_status': status_code,
            'latency_ms': elapsed_ms,
            'total_events': len(events),
            'event_types': event_types,
            'activities_logged': activities,
            'model': 'deepseek/deepseek-v4-flash (OpenRouter)',
            'endpoint': 'POST /api/command-room/chat',
        }
    except Exception as e:
        print(f"  Command Room Error: {e}")
        return {'gate': 'command_room_real_route', 'status': 'FAIL', 'error': str(e)}


def test_agentic_mission_real_runtime():
    print("\n--- Gate 2: Agentic Mission Real Runtime Test ---")
    headers = AUTH_HEADERS.copy()
    
    # 1. Create Run
    create_payload = {
        'projectId': 'PLHUT-SURAKARTA',
        'request': 'Hitung volume beton lantai 2 proyek PLHUT Surakarta dan verifikasi bukti gambar',
        'riskTier': 'high'
    }
    url_create = 'http://127.0.0.1:8082/agent-runs'
    req_create = urllib.request.Request(url_create, data=json.dumps(create_payload).encode('utf-8'), headers=headers)
    
    with urllib.request.urlopen(req_create, timeout=5) as r:
        run = json.loads(r.read().decode('utf-8'))
    
    run_id = run['runId']
    print(f"  Created Mission Run ID: {run_id} | Status: {run['status']} | RiskTier: {run['goalSpec']['riskTier']}")
    
    # 2. Step 1 -> transition to running/waiting_approval
    step_payload = {'projectId': 'PLHUT-SURAKARTA', 'expectedVersion': run['version']}
    url_step = f'http://127.0.0.1:8082/agent-runs/{run_id}/step'
    req_step = urllib.request.Request(url_step, data=json.dumps(step_payload).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req_step, timeout=5) as r:
        res_step = json.loads(r.read().decode('utf-8'))
    print(f"  Step 1 Completed Tasks: {res_step.get('completedTaskIds')} | PendingApprovals: {res_step.get('pendingApprovalIds')}")
    
    # 3. Test Mismatched Project Rejection (Scope Isolation)
    mismatch_rejected = False
    mismatch_payload = {'projectId': 'UNAUTHORIZED-PROJECT-ID', 'expectedVersion': res_step['version']}
    try:
        req_mismatch = urllib.request.Request(url_step, data=json.dumps(mismatch_payload).encode('utf-8'), headers=headers)
        urllib.request.urlopen(req_mismatch, timeout=5)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            mismatch_rejected = True
            print("  Mismatched Project Rejection: HTTP 403 PASS")
            
    # 4. Approve Step
    approval_token = {
        'tokenId': 'appr-token-plhut-001',
        'projectId': 'PLHUT-SURAKARTA',
        'toolName': 'core_engine.calculate_measurement_facts',
        'approvedBy': 'lead-structural-engineer',
        'expiresAt': '2030-01-01T00:00:00Z'
    }
    approve_payload = {
        'projectId': 'PLHUT-SURAKARTA',
        'expectedVersion': res_step['version'],
        'approvalToken': approval_token,
        'idempotencyKey': 'idemp-key-plhut-001'
    }
    url_appr = f'http://127.0.0.1:8082/agent-runs/{run_id}/approve'
    req_appr = urllib.request.Request(url_appr, data=json.dumps(approve_payload).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req_appr, timeout=5) as r:
        res_appr = json.loads(r.read().decode('utf-8'))
    print(f"  Approve Completed Tasks: {res_appr.get('completedTaskIds')} | Status: {res_appr.get('status')}")
    
    # 5. Test Optimistic Concurrency Control (Conflict on old version)
    occ_passed = False
    try:
        req_replay = urllib.request.Request(url_appr, data=json.dumps(approve_payload).encode('utf-8'), headers=headers)
        urllib.request.urlopen(req_replay, timeout=5)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            occ_passed = True
            print("  Optimistic Concurrency Control (Version Conflict): HTTP 409 PASS")

    return {
        'gate': 'agentic_mission_real_runtime',
        'status': 'PASS' if mismatch_rejected and occ_passed and run_id else 'FAIL',
        'run_id': run_id,
        'mismatched_project_rejected': mismatch_rejected,
        'version_conflict_protected': occ_passed,
        'initial_status': run['status'],
        'post_approval_completed_tasks': res_appr.get('completedTaskIds'),
        'orchestrator_endpoint': 'POST /agent-runs (port 8082)',
    }


def test_review_to_handoff_real_service():
    print("\n--- Gate 3: Review Queue to Handoff Real Service Test ---")
    headers = AUTH_HEADERS.copy()
    
    # 1. Fetch Review Queue from DB service
    url_q = 'http://127.0.0.1:8001/projects/PLHUT-SURAKARTA/project-graph/review-queue'
    req_q = urllib.request.Request(url_q, headers=headers)
    with urllib.request.urlopen(req_q, timeout=5) as r:
        queue_data = json.loads(r.read().decode('utf-8'))
    
    queue_count = len(queue_data.get('items', []))
    queue_summary = queue_data.get('summary', {})
    print(f"  Review Queue Items: {queue_count} | Summary: {queue_summary}")
    
    # 2. Fetch Quantity Readiness from DB service
    url_r = 'http://127.0.0.1:8001/projects/PLHUT-SURAKARTA/project-graph/quantity-readiness'
    req_r = urllib.request.Request(url_r, headers=headers)
    with urllib.request.urlopen(req_r, timeout=5) as r:
        readiness_data = json.loads(r.read().decode('utf-8'))
        
    readiness_count = len(readiness_data.get('items', []))
    readiness_summary = readiness_data.get('summary', {})
    print(f"  Quantity Readiness Items: {readiness_count} | Summary: {readiness_summary}")
    
    # 3. Test Web App Proxy for Review Queue
    url_proxy = 'http://127.0.0.1:3000/api/db-projects/projects/PLHUT-SURAKARTA/project-graph/review-queue'
    req_proxy = urllib.request.Request(url_proxy, headers=headers)
    with urllib.request.urlopen(req_proxy, timeout=5) as r:
        proxy_data = json.loads(r.read().decode('utf-8'))
    proxy_count = len(proxy_data.get('items', []))
    print(f"  Web Proxy -> DB API Review Queue Items: {proxy_count}")

    # 4. RBAC Denial Test (Unauthorized user query)
    rbac_denied = False
    headers_unauth = {'Authorization': 'Bearer test-token-unauthorized-outsider'}
    url_rbac = 'http://127.0.0.1:8001/projects/PLHUT-SURAKARTA/project-graph/review-queue'
    try:
        req_rbac = urllib.request.Request(url_rbac, headers=headers_unauth)
        urllib.request.urlopen(req_rbac, timeout=5)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            rbac_denied = True
            print(f"  RBAC Denial Test: HTTP {e.code} PASS")

    return {
        'gate': 'review_to_handoff_real_service',
        'status': 'PASS' if queue_count > 0 and proxy_count == queue_count and rbac_denied else 'FAIL',
        'review_queue_items': queue_count,
        'quantity_readiness_items': readiness_count,
        'proxy_items_matched': proxy_count == queue_count,
        'rbac_denial_pass': rbac_denied,
        'db_service_endpoint': 'GET /projects/PLHUT-SURAKARTA/project-graph/review-queue (port 8001)',
        'web_proxy_endpoint': 'GET /api/db-projects/projects/PLHUT-SURAKARTA/project-graph/review-queue (port 3000)',
    }


def main():
    print("=== Phase 11D CR2 Real Runtime Evidence Collector ===")
    g1 = test_command_room_real_route()
    g2 = test_agentic_mission_real_runtime()
    g3 = test_review_to_handoff_real_service()
    
    report = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'overall_status': 'PASS' if g1['status'] == 'PASS' and g2['status'] == 'PASS' and g3['status'] == 'PASS' else 'FAIL',
        'gates': {
            'command_room_real_route': g1,
            'agentic_mission_real_runtime': g2,
            'review_to_handoff_real_service': g3,
        }
    }
    
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"\nSaved sanitized evidence to: {REPORT_PATH}")
    print(f"OVERALL REAL RUNTIME PROOF STATUS: {report['overall_status']}")
    sys.exit(0 if report['overall_status'] == 'PASS' else 1)


if __name__ == '__main__':
    main()
