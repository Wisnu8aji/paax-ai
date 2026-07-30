"""Start PAAX local services for Phase 11D CR2 integration test."""
import subprocess
import sys
import os
import time
import json
import pathlib

REPO_ROOT = pathlib.Path(r"G:\paax-ai-contextual-integration")
ENV_LOCAL = pathlib.Path(r"G:\paax-ai-main\.env.local")

# Build environment from .env.local
env = os.environ.copy()
with open(ENV_LOCAL) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()

env['TESTING'] = '1'
env['ARTIFACT_SIGNING_SECRET'] = 'development-only-artifact-secret'
env['ALLOW_DEV_SIGNING'] = '1'
env['PAAX_DESKTOP_MODE'] = '1'
env['PAAX_ENV'] = 'development'
env['DB_API_URL'] = 'http://127.0.0.1:8001'
env['CORE_ENGINE_URL'] = 'http://127.0.0.1:8000'

LOG_DIR = REPO_ROOT / "report" / "report_drawing_intelligence" / "phase11d_cr2_service_logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

pids = {}
procs = {}

services = [
    {
        "name": "db",
        "port": 8001,
        "cwd": REPO_ROOT / "services" / "db",
        "args": [sys.executable, "-m", "uvicorn", "paax_db.main:app",
                 "--host", "127.0.0.1", "--port", "8001", "--log-level", "warning"],
    },
    {
        "name": "core-engine",
        "port": 8000,
        "cwd": REPO_ROOT / "services" / "core-engine",
        "args": [sys.executable, "-m", "uvicorn", "app.main:app",
                 "--host", "127.0.0.1", "--port", "8000", "--log-level", "warning"],
    },
    {
        "name": "document-intelligence",
        "port": 8002,
        "cwd": REPO_ROOT / "services" / "document-intelligence",
        "args": [sys.executable, "-m", "uvicorn", "app.main:app",
                 "--host", "127.0.0.1", "--port", "8002", "--log-level", "warning"],
    },
    {
        "name": "ai-orchestrator",
        "port": 8082,
        "cwd": REPO_ROOT / "services" / "ai-orchestrator",
        "env": {"PORT": "8082"},
        "args": ["npx.cmd", "tsx", "src/index.ts"],
    },
]

print("[STARTUP] Launching backend services...")
for svc in services:
    log_file = LOG_DIR / f"{svc['name']}.log"
    with open(log_file, 'w') as lf:
        svc_env = env.copy()
        if "env" in svc:
            svc_env.update(svc["env"])
        proc = subprocess.Popen(
            svc["args"],
            cwd=svc["cwd"],
            env=svc_env,
            stdout=lf,
            stderr=lf,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    pids[svc["name"]] = proc.pid
    procs[svc["name"]] = (proc, svc["port"])
    print(f"  {svc['name']} PID={proc.pid} port={svc['port']} log={log_file}")

pid_file = LOG_DIR / "service_pids.json"
pid_file.write_text(json.dumps(pids, indent=2))
print(f"[STARTUP] PIDs saved to {pid_file}")
print("[STARTUP] Waiting 6 seconds for services to become ready...")
time.sleep(6)

# Health checks
import urllib.request
all_ok = True
for svc in services:
    url = f"http://127.0.0.1:{svc['port']}/health"
    try:
        r = urllib.request.urlopen(url, timeout=5)
        print(f"  READY: {svc['name']} :{svc['port']} -> HTTP {r.status}")
    except Exception as e:
        print(f"  FAIL:  {svc['name']} :{svc['port']} -> {e}")
        all_ok = False
        # Print last 10 lines of log
        log_file = LOG_DIR / f"{svc['name']}.log"
        if log_file.exists():
            lines = log_file.read_text(errors='replace').splitlines()
            for line in lines[-10:]:
                print(f"    LOG: {line}")

sys.exit(0 if all_ok else 1)
