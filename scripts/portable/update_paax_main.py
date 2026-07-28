from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

PRESERVE = {
    ".env.local",
    "apps/web/.env.local",
}
PRESERVE_DIRS = {"data/portable", ".local-runtime", ".git", "node_modules", ".venv", ".next", ".turbo"}
RELEASE_EXCLUDED_DIRS = {
    ".git", "node_modules", ".venv", ".next", ".turbo", ".local-runtime",
    "__pycache__", ".pytest_cache", "coverage", "dist", "build", "report",
}
RELEASE_EXCLUDED_FILES = {".env.local", "paax-portable.db", "live_test.db", ".DS_Store"}
RELEASE_EXCLUDED_SUFFIXES = {".pyc", ".log", ".tsbuildinfo"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def rel_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel_path = path.relative_to(root)
        if any(part in RELEASE_EXCLUDED_DIRS for part in rel_path.parts):
            continue
        if path.name in RELEASE_EXCLUDED_FILES or path.suffix in RELEASE_EXCLUDED_SUFFIXES:
            continue
        rel = rel_path.as_posix()
        if rel.startswith("release/") and path.name == "PAAX_PORTABLE_RELEASE_MANIFEST.json":
            continue
        # Runtime state is never supplied by a release, even if someone placed
        # it inside an extracted source directory by mistake.
        if is_preserved(rel):
            continue
        yield rel, path


def is_preserved(rel: str) -> bool:
    return rel in PRESERVE or any(rel == d or rel.startswith(d + "/") for d in PRESERVE_DIRS)


def copy_atomic(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".paax-update-tmp")
    shutil.copy2(source, temp)
    os.replace(temp, target)


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely overlay a PAAX release onto an existing paax-ai-main checkout.")
    parser.add_argument("--source", type=Path, required=True, help="Extracted new PAAX release directory")
    parser.add_argument("--target", type=Path, required=True, help="Existing local paax-ai-main directory")
    parser.add_argument("--mode", choices=["overlay", "replace-managed"], default="replace-managed")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    source, target = args.source.resolve(), args.target.resolve()
    if not (source / "package.json").is_file() or not (source / "fixtures/plhut/project-manifest.json").is_file():
        raise SystemExit("Source is not a valid PAAX PLHUT release")
    if not target.exists():
        target.mkdir(parents=True)
    elif not (target / "package.json").exists():
        raise SystemExit("Target exists but is not a PAAX repository")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = target.parent / f"{target.name}-backup-{timestamp}"
    changed: list[str] = []
    unchanged: list[str] = []
    # Record preserved runtime state even when the release intentionally omits
    # those files (for example .env.local and the portable database).
    preserved: list[str] = sorted(rel for rel in PRESERVE if (target / rel).exists())
    source_map = dict(rel_files(source))

    if target.exists() and not args.no_backup and not args.dry_run:
        def ignore(directory: str, names: list[str]):
            rel_dir = Path(directory).resolve().relative_to(target).as_posix() if Path(directory).resolve() != target else ""
            ignored = []
            for name in names:
                rel = f"{rel_dir}/{name}".strip("/")
                if rel in {"node_modules", ".venv", ".next", ".turbo", ".git"} or any(rel.startswith(x + "/") for x in {"node_modules", ".venv", ".next", ".turbo", ".git"}):
                    ignored.append(name)
            return ignored
        shutil.copytree(target, backup, ignore=ignore)

    if args.mode == "replace-managed" and target.exists():
        manifest_path = target / "release/PAAX_PORTABLE_RELEASE_MANIFEST.json"
        if manifest_path.is_file():
            try:
                old = json.loads(manifest_path.read_text(encoding="utf-8"))
                for item in old.get("files", []):
                    rel = str(item.get("path", ""))
                    if rel and rel not in source_map and not is_preserved(rel):
                        path = target / rel
                        if path.is_file() and not args.dry_run:
                            path.unlink()
            except Exception:
                pass

    for rel, src in sorted(source_map.items()):
        dst = target / rel
        if is_preserved(rel) and dst.exists():
            if rel not in preserved:
                preserved.append(rel)
            continue
        if dst.exists() and sha256(src) == sha256(dst):
            unchanged.append(rel)
            continue
        changed.append(rel)
        if not args.dry_run:
            copy_atomic(src, dst)

    report = {
        "schema_version": "paax.update-report.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(source), "target": str(target), "mode": args.mode,
        "backup": None if args.no_backup or args.dry_run else str(backup),
        "changed_count": len(changed), "unchanged_count": len(unchanged), "preserved_count": len(preserved),
        "changed": changed, "preserved": preserved,
    }
    if not args.dry_run:
        out = target / "report" / "PAAX_LAST_UPDATE_REPORT.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
