"""Phase 06 Real-Stack Playwright Runner & Process Lifecycle Manager."""
import os
import sys
import time
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOGS_DIR = REPO_ROOT / ".local-test-logs" / "phase06"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Environment setup
ENV = os.environ.copy()
ENV["INTERNAL_SERVICE_KEY"] = "test-internal-key"
ENV["INTERNAL_SERVICE_SCOPES"] = "dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agentic:calculate"
ENV["PAAX_DB_SERVICE_URL"] = "http://127.0.0.1:8001"
ENV["DB_API_URL"] = "http://127.0.0.1:8001"
ENV["PAAX_DOCUMENT_INTELLIGENCE_URL"] = "http://127.0.0.1:8083"
ENV["DOCUMENT_INTELLIGENCE_URL"] = "http://127.0.0.1:8083"
ENV["DI_E2E_URL"] = "http://127.0.0.1:3000/drawing-intelligence"
ENV.pop("DRAWING_INTELLIGENCE_API_KEY", None)

processes = []

def log(msg: str):
    print(f"[phase06-runner] {msg}", flush=True)

def wait_for_url(url: str, timeout_sec: int = 45) -> bool:
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            req = urllib.request.Request(url, headers={"X-Internal-Key": "test-internal-key"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status in (200, 404):
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False

def clean_processes():
    log("Cleaning spawned background service processes...")
    for p in reversed(processes):
        try:
            if p.poll() is None:
                p.terminate()
                p.wait(timeout=5)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    log("All spawned processes cleaned.")

def main():
    try:
        log("1. Seeding DB with Gedung A 53-page fixture...")
        seed_cmd = [sys.executable, str(REPO_ROOT / "scripts" / "live_test" / "seed_gedung_a.py")]
        res = subprocess.run(seed_cmd, cwd=str(REPO_ROOT), env=ENV, capture_output=True, text=True)
        if res.returncode != 0:
            log(f"DB Seeding failed:\n{res.stderr}")
            sys.exit(1)
        log("DB Seeding completed.")

        log("2. Starting DB service on port 8001...")
        db_log = open(LOGS_DIR / "db.log", "w", encoding="utf-8")
        db_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "paax_db.main:app", "--host", "127.0.0.1", "--port", "8001"],
            cwd=str(REPO_ROOT / "services" / "db"),
            env=ENV,
            stdout=db_log,
            stderr=db_log,
        )
        processes.append(db_proc)

        log("3. Starting Document Intelligence service on port 8083...")
        di_log = open(LOGS_DIR / "di.log", "w", encoding="utf-8")
        di_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8083"],
            cwd=str(REPO_ROOT / "services" / "document-intelligence"),
            env=ENV,
            stdout=di_log,
            stderr=di_log,
        )
        processes.append(di_proc)

        log("4. Starting Next.js Web service on port 3000...")
        web_log = open(LOGS_DIR / "web.log", "w", encoding="utf-8")
        web_cmd = ["cmd.exe", "/c", "npx next dev --port 3000"]
        web_proc = subprocess.Popen(
            web_cmd,
            cwd=str(REPO_ROOT / "apps" / "web"),
            env=ENV,
            stdout=web_log,
            stderr=web_log,
        )
        processes.append(web_proc)

        log("5. Waiting for services to become responsive...")
        if not wait_for_url("http://127.0.0.1:8001/projects/proj-clean/dem/runs", timeout_sec=30):
            log("ERROR: DB service failed to become responsive on port 8001.")
            sys.exit(1)
        log("DB service is UP.")

        if not wait_for_url("http://127.0.0.1:8083/health", timeout_sec=30):
            log("ERROR: DI service failed to become responsive on port 8083.")
            sys.exit(1)
        log("DI service is UP.")

        if not wait_for_url("http://127.0.0.1:3000/drawing-intelligence", timeout_sec=60):
            log("ERROR: Web service failed to become responsive on port 3000.")
            sys.exit(1)
        log("Web service is UP.")

        log("6. Executing Playwright E2E test suite...")
        pw_cmd = [
            "cmd.exe", "/c",
            "pnpm --filter @paax/web exec playwright test e2e/drawing-intelligence-sheet-views.spec.ts --reporter=line"
        ]
        pw_res = subprocess.run(pw_cmd, cwd=str(REPO_ROOT), env=ENV, capture_output=True, text=True)

        log(f"Playwright Exit Code: {pw_res.returncode}")
        log(f"Playwright STDOUT:\n{pw_res.stdout}")
        if pw_res.stderr:
            log(f"Playwright STDERR:\n{pw_res.stderr}")

        if pw_res.returncode != 0:
            log("ERROR: Playwright test suite failed.")
            sys.exit(pw_res.returncode)

        log("SUCCESS: All Playwright tests passed cleanly!")

    finally:
        clean_processes()

if __name__ == "__main__":
    main()
