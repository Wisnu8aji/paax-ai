import sys, os, subprocess, time

action = sys.argv[1] if len(sys.argv) > 1 else 'stop'

if action == 'stop':
    print('[TOGGLE 8002] Stopping service on port 8002...')
    try:
        out = subprocess.check_output('netstat -ano | findstr :8002', shell=True, text=True)
        pids = set()
        for line in out.splitlines():
            if 'LISTENING' in line:
                parts = line.strip().split()
                if len(parts) >= 5:
                    pids.add(parts[-1])
        for pid in pids:
            if pid and pid != '0':
                print(f'[TOGGLE 8002] Terminating PID {pid}')
                subprocess.call(f'taskkill /F /PID {pid}', shell=True)
    except Exception as e:
        print(f'[TOGGLE 8002] Stop notice: {e}')

elif action == 'start':
    print('[TOGGLE 8002] Starting Document Intelligence service on port 8002...')
    env = os.environ.copy()
    env['INTERNAL_SERVICE_KEY'] = 'live-test-key'
    env['INTERNAL_SERVICE_SCOPES'] = 'dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate'
    env['PAAX_PORTABLE_ACTOR_ID'] = 'local-desktop-user'
    env['PAAX_DESKTOP_MODE'] = '1'
    env['ALLOW_DEV_SIGNING'] = '1'
    env['ARTIFACT_SIGNING_SECRET'] = 'development-only-artifact-secret'
    env['DB_API_URL'] = 'http://127.0.0.1:8001'
    env['NEXT_PUBLIC_DB_API_URL'] = 'http://127.0.0.1:8001'
    env['DATABASE_URL'] = 'sqlite+aiosqlite:///G:/paax-ai-contextual-integration/services/db/portable.sqlite'

    subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8002'],
        cwd=r'G:\paax-ai-contextual-integration\services\document-intelligence',
        env=env,
        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
    )
    time.sleep(3)
    print('[TOGGLE 8002] Service 8002 start launched.')
