from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT.parent / "PAAX-AI-Main-PLHUT-Agentic-Development-Complete-2026-07-25.zip"
ARCHIVE_ROOT = "PAAX-AI-Main-PLHUT-Agentic-Development-Complete"
EXCLUDED_DIRS = {
    ".git", "node_modules", ".next", ".turbo", ".venv", ".local-runtime",
    "__pycache__", ".pytest_cache", "coverage", "dist", "build", ".mypy_cache", "report",
}
EXCLUDED_FILES = {
    ".env.local", "live_test.db", "paax-portable.db", ".DS_Store",
}
EXCLUDED_SUFFIXES = {".pyc", ".log", ".tsbuildinfo"}
REQUIRED_PATHS = {
    "PANDUAN-PORTABEL-PLHUT.md",
    "README-PLHUT-PORTABLE.md",
    "fixtures/plhut/project-manifest.json",
    "fixtures/plhut/civil-work-items.json",
    "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
    "scripts/portable/Setup-PLHUT-Local.ps1",
    "scripts/portable/Start-PLHUT-Local.ps1",
    "scripts/portable/Stop-PLHUT-Local.ps1",
    "scripts/portable/preflight.py",
    "services/db/src/paax_db/engineering_context.py",
    "PANDUAN-INSTALASI-DAN-UPDATE-PAAX-MAIN.md",
    "scripts/portable/update_paax_main.py",
    "scripts/portable/Update-PAAX-Main.ps1",
    "scripts/portable/Rollback-PAAX-Update.ps1",
    "scripts/portable/rollback_paax_main.py",
    "scripts/portable/verify_phase62_completion.py",
    "scripts/portable/verify_phase62_concurrency.py",
    "scripts/portable/benchmark_phase62.py",
    "services/document-intelligence/app/drawing_intelligence/advanced_zones.py",
    "services/document-intelligence/app/drawing_intelligence/takeoff_workspace.py",
    "services/ai-orchestrator/src/agentic/runtime-store.ts",
    "services/ai-orchestrator/src/agentic/budget-sandbox.ts",
    "apps/web/src/components/drawing-intelligence/workspace/agentic/mission-control.tsx",
    "scripts/portable/paaxctl.py",
    "scripts/portable/generate_phase_audit.py",
    "scripts/portable/generate_sbom.py",
    "scripts/portable/generate_release_certificate.py",
    "docs/PAAX_64_PHASE_IMPLEMENTATION_MATRIX_2026-07-25.md",
    "docs/PAAX_AGENTIC_PHASE_31_64_IMPLEMENTATION_AUDIT_2026-07-25.md",
    "docs/PAAX_SECURITY_THREAT_MODEL_2026-07-25.md",
    "docs/PAAX_ENGINEERING_GOVERNANCE_CHARTER_2026-07-25.md",
    "docs/PAAX_INDONESIAN_PROFESSIONAL_PILOT_PROTOCOL_2026-07-25.md",
    "release/PAAX_RELEASE_CERTIFICATE.json",
    "release/PAAX_SBOM.json",
    "release/PAAX_64_PHASE_IMPLEMENTATION_MATRIX.json",
    "release/PAAX_FINAL_TEST_SUMMARY.json",
    "release/PAAX_RELEASE_NOTES.md",
    "benchmark-packs/manifest.example.json",
}
SECRET_ASSIGNMENT = re.compile(
    r"(?im)^[ \t]*(?:export[ \t]+)?(?:DEEPSEEK_API_KEY|DASHSCOPE_API_KEY|ANTHROPIC_API_KEY|NVIDIA_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY|FIREBASE_PRIVATE_KEY|INTERNAL_SERVICE_KEY)[ \t]*=[ \t]*([^\s#]+)"
)
SAFE_MARKERS = ("your_", "replace", "placeholder", "example", "changeme", "<", "${", "generated-at-runtime", "local-generated", "os.getenv", "process.env")


def iter_release_files() -> Iterable[tuple[Path, Path]]:
    for path in ROOT.rglob("*"):
        rel = path.relative_to(ROOT)
        if path.is_dir():
            continue
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        if path.name in EXCLUDED_FILES or path.suffix in EXCLUDED_SUFFIXES:
            continue
        if rel.parts[:2] == ("data", "portable"):
            continue
        if rel.as_posix() == "release/PAAX_PORTABLE_RELEASE_MANIFEST.json":
            continue
        yield rel, path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scan_secrets(files: list[tuple[Path, Path]]) -> list[str]:
    findings: list[str] = []
    for rel, path in files:
        if path.suffix.lower() not in {".env", ".example", ".md", ".txt", ".json", ".ts", ".tsx", ".js", ".py", ".ps1", ".yaml", ".yml"} and not path.name.startswith(".env"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for match in SECRET_ASSIGNMENT.finditer(text):
            value = match.group(1).strip().strip('"\'')
            lower = value.lower()
            if not value or any(marker in lower for marker in SAFE_MARKERS):
                continue
            findings.append(f"{rel.as_posix()}: possible live secret assignment")
        if re.search(r"\bsk-(?:or-v1-)?[A-Za-z0-9_-]{20,}\b", text):
            findings.append(f"{rel.as_posix()}: possible API token literal")
    return sorted(set(findings))


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a deterministic, credential-free PAAX portable ZIP.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()

    files = sorted(iter_release_files(), key=lambda item: item[0].as_posix())
    included = {rel.as_posix() for rel, _ in files}
    missing = sorted(REQUIRED_PATHS - included)
    if missing:
        raise SystemExit(f"Required release files missing: {missing}")
    secret_findings = scan_secrets(files)
    if secret_findings:
        raise SystemExit("Secret scan failed:\n- " + "\n- ".join(secret_findings))

    file_manifest = [
        {"path": rel.as_posix(), "size_bytes": path.stat().st_size, "sha256": sha256_file(path)}
        for rel, path in files
    ]
    release_manifest = {
        "schema_version": "paax.portable-release.v2",
        "archive_root": ARCHIVE_ROOT,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "baseline": "PAAX PCKM v3 + continuation implementation through the 62-phase development plan",
        "release_status": "development-complete; professional production certification remains conditional on external benchmark and Indonesian pilot gates",
        "project_id": "PLHUT-SURAKARTA",
        "source_pdf_sha256": "bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68",
        "credential_free": True,
        "database_included": False,
        "runtime_keys_included": False,
        "file_count": len(file_manifest),
        "files": file_manifest,
    }
    manifest_bytes = json.dumps(release_manifest, ensure_ascii=False, indent=2).encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for rel, path in files:
            info = zipfile.ZipInfo(f"{ARCHIVE_ROOT}/{rel.as_posix()}", (2026, 7, 25, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
        info = zipfile.ZipInfo(f"{ARCHIVE_ROOT}/release/PAAX_PORTABLE_RELEASE_MANIFEST.json", (2026, 7, 25, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, manifest_bytes)

    with zipfile.ZipFile(output) as archive:
        bad_member = archive.testzip()
        entries = archive.infolist()
        names = {entry.filename for entry in entries}
        forbidden = [name for name in names if any(part in EXCLUDED_DIRS for part in Path(name).parts) or Path(name).name in EXCLUDED_FILES]
        manifest_name = f"{ARCHIVE_ROOT}/release/PAAX_PORTABLE_RELEASE_MANIFEST.json"
        manifest_ok = manifest_name in names and json.loads(archive.read(manifest_name))["project_id"] == "PLHUT-SURAKARTA"

    result = {
        "archive": str(output),
        "archive_root": ARCHIVE_ROOT,
        "entries": len(entries),
        "testzip_bad_member": bad_member,
        "forbidden_entries": forbidden,
        "release_manifest_ok": manifest_ok,
        "sha256": sha256_file(output),
        "size_bytes": output.stat().st_size,
    }
    print(json.dumps(result, indent=2))
    if bad_member or forbidden or not manifest_ok:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
