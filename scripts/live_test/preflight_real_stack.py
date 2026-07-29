"""Preflight real-stack verification for Phase 09E Correction Round 1.

Fails closed if any of the required services (Web: 3000, Core Engine: 8000,
DB API: 8001, Document Intelligence: 8002) is unavailable or returns invalid data.
"""
import json
import sys
import urllib.request
import urllib.error


def check_url(url: str, headers: dict = None) -> tuple[bool, str, dict]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode('utf-8')
            try:
                parsed = json.loads(data)
            except Exception:
                parsed = {"raw": data[:200]}
            return True, f"HTTP {resp.status}", parsed
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}", {}
    except Exception as exc:
        return False, str(exc), {}


def main() -> int:
    checks = []

    def log_check(name: str, ok: bool, detail: str, data: dict = None):
        checks.append({"name": name, "ok": ok, "detail": detail})
        status_str = "PASS" if ok else "FAIL"
        print(f"  [{status_str}] {name}: {detail}")

    print("=== Phase 09E Real-Stack Preflight Check ===")

    # 1. DB API (port 8001) health
    ok, detail, db_health = check_url("http://127.0.0.1:8001/health")
    log_check("db_api_health_8001", ok and db_health.get("status") == "ok", detail)

    # 2. DB API project check
    ok, detail, proj = check_url(
        "http://127.0.0.1:8001/projects/PLHUT-SURAKARTA",
        headers={"X-User-Id": "paax-web", "X-Internal-Key": "live-test-key"},
    )
    is_plhut_valid = ok and proj.get("id") == "PLHUT-SURAKARTA"
    log_check("db_api_plhut_project_8001", is_plhut_valid, f"{detail} (project: {proj.get('id')})")

    # 3. Core Engine (port 8000) health
    ok, detail, core_health = check_url("http://127.0.0.1:8000/health")
    log_check("core_engine_health_8000", ok and core_health.get("status") == "ok", detail)

    # 4. Document Intelligence (port 8002) health
    ok, detail, di_health = check_url("http://127.0.0.1:8002/health")
    log_check("doc_intelligence_health_8002", ok and di_health.get("status") == "ok", detail)

    # 5. Web (port 3000) check
    ok, detail, _ = check_url("http://127.0.0.1:3000")
    log_check("web_server_3000", ok, detail)

    failed = [c for c in checks if not c["ok"]]
    print("\nPreflight summary:")
    if failed:
        print(f"FAILED: {len(failed)} of {len(checks)} checks failed.")
        return 1
    else:
        print(f"ALL {len(checks)} CHECKS PASSED — Real stack is fully operational.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
