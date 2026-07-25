from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".local-runtime"
DATA = ROOT / "data" / "portable"
SERVICES = {
    "db-plhut": (8001, "http://127.0.0.1:8001/health"),
    "ai-orchestrator": (8082, "http://127.0.0.1:8082/health"),
    "core-engine": (8081, "http://127.0.0.1:8081/health"),
    "document-intelligence": (8083, "http://127.0.0.1:8083/health"),
    "site-agent": (8085, "http://127.0.0.1:8085/health"),
    "web": (3000, "http://127.0.0.1:3000"),
}


def _port_open(port: int) -> bool:
    with socket.socket() as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def status() -> dict[str, Any]:
    rows = []
    for name, (port, url) in SERVICES.items():
        pid_file = RUNTIME / f"{name}.pid"
        pid = None
        if pid_file.is_file():
            try:
                pid = int(pid_file.read_text().strip())
            except ValueError:
                pid = None
        rows.append({"service": name, "port": port, "listening": _port_open(port), "pid": pid, "health_url": url})
    return {"root": str(ROOT), "runtime": str(RUNTIME), "data": str(DATA), "services": rows}


def doctor() -> int:
    checks: list[dict[str, Any]] = []
    def add(name: str, ok: bool, detail: Any) -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})
    add("package_json", (ROOT / "package.json").is_file(), ROOT / "package.json")
    add("plhut_manifest", (ROOT / "fixtures/plhut/project-manifest.json").is_file(), "fixture manifest")
    add("plhut_pdf", (ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf").is_file(), "88-page source PDF")
    add("python", bool(shutil.which("python") or shutil.which("python3")), sys.version.split()[0])
    add("node", bool(shutil.which("node")), shutil.which("node"))
    add("pnpm", bool(shutil.which("pnpm") or shutil.which("pnpm.cmd")), shutil.which("pnpm") or "install via Corepack")
    add("portable_data_writable", os.access(DATA if DATA.exists() else ROOT, os.W_OK), DATA)
    verifier = ROOT / "scripts/portable/verify_phase62_completion.py"
    add("completion_verifier", verifier.is_file(), verifier)
    result = {"status": "PASS" if all(c["ok"] for c in checks) else "FAIL", "checks": checks}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "PASS" else 1


def _powershell(script: str, *extra: str) -> int:
    exe = shutil.which("powershell") or shutil.which("pwsh")
    if not exe:
        print("Perintah start/stop/setup portable ditujukan untuk Windows PowerShell. Jalankan script .ps1 pada PC Windows.", file=sys.stderr)
        return 2
    return subprocess.call([exe, "-ExecutionPolicy", "Bypass", "-File", str(ROOT / script), *extra], cwd=ROOT)


def show_logs(service: str, lines: int) -> int:
    candidates = [RUNTIME / f"{service}.out.log", RUNTIME / f"{service}.err.log"]
    found = False
    for path in candidates:
        if path.is_file():
            found = True
            print(f"\n--- {path.name} ---")
            content = path.read_text(encoding="utf-8", errors="replace").splitlines()
            print("\n".join(content[-lines:]))
    if not found:
        print(f"Belum ada log untuk {service}")
    return 0


def reset_demo(confirm: str) -> int:
    if confirm != "RESET-PLHUT-DEMO":
        print("Reset ditolak. Gunakan --confirm RESET-PLHUT-DEMO. Backup terlebih dahulu.", file=sys.stderr)
        return 2
    targets = [
        DATA / "paax-portable.db", DATA / "takeoff-workspace.json", DATA / "entity-links.json",
        DATA / "agent-runs.json", DATA / "agent-events.jsonl", DATA / "agent-dead-letter.jsonl",
    ]
    removed = []
    for path in targets:
        if path.exists():
            path.unlink()
            removed.append(str(path.relative_to(ROOT)))
    print(json.dumps({"status": "RESET", "removed": removed, "next": "Jalankan Start-PLHUT-Local.ps1; PLHUT akan dibootstrap ulang secara idempotent."}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PAAX portable runtime controller")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser("status")
    sub.add_parser("setup")
    start_p = sub.add_parser("start"); start_p.add_argument("--skip-optional", action="store_true")
    sub.add_parser("stop")
    restart_p = sub.add_parser("restart"); restart_p.add_argument("--skip-optional", action="store_true")
    logs_p = sub.add_parser("logs"); logs_p.add_argument("service", choices=SERVICES); logs_p.add_argument("--lines", type=int, default=120)
    reset_p = sub.add_parser("reset-demo"); reset_p.add_argument("--confirm", default="")
    args = parser.parse_args()
    if args.command == "doctor": return doctor()
    if args.command == "status": print(json.dumps(status(), ensure_ascii=False, indent=2)); return 0
    if args.command == "setup": return _powershell("scripts/portable/Setup-PLHUT-Local.ps1")
    if args.command == "start": return _powershell("scripts/portable/Start-PLHUT-Local.ps1", *( ["-SkipOptionalServices"] if args.skip_optional else []))
    if args.command == "stop": return _powershell("scripts/portable/Stop-PLHUT-Local.ps1")
    if args.command == "restart":
        rc = _powershell("scripts/portable/Stop-PLHUT-Local.ps1")
        return rc or _powershell("scripts/portable/Start-PLHUT-Local.ps1", *( ["-SkipOptionalServices"] if args.skip_optional else []))
    if args.command == "logs": return show_logs(args.service, args.lines)
    if args.command == "reset-demo": return reset_demo(args.confirm)
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
