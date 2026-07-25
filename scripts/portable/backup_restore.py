from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ITEMS = [
    "data/portable",
    ".env.local",
    "apps/web/.env.local",
    "report/PAAX_LAST_UPDATE_REPORT.json",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def backup(output: Path) -> dict:
    files: list[tuple[str, Path]] = []
    for rel in DEFAULT_ITEMS:
        path = ROOT / rel
        if path.is_file():
            files.append((rel, path))
        elif path.is_dir():
            files.extend((p.relative_to(ROOT).as_posix(), p) for p in path.rglob("*") if p.is_file())
    manifest = {
        "schema_version": "paax.portable-backup.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "files": [{"path": rel, "size": p.stat().st_size, "sha256": sha256_bytes(p.read_bytes())} for rel, p in files],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, path in files:
            z.write(path, rel)
        z.writestr("BACKUP_MANIFEST.json", json.dumps(manifest, indent=2))
    return {"output": str(output), "files": len(files), "sha256": sha256_bytes(output.read_bytes())}


def restore(source: Path, target: Path, dry_run: bool = False) -> dict:
    with zipfile.ZipFile(source) as z:
        manifest = json.loads(z.read("BACKUP_MANIFEST.json"))
        restored = []
        for item in manifest["files"]:
            rel = item["path"]
            data = z.read(rel)
            if sha256_bytes(data) != item["sha256"]:
                raise RuntimeError(f"backup checksum mismatch: {rel}")
            dest = target / rel
            restored.append(rel)
            if not dry_run:
                dest.parent.mkdir(parents=True, exist_ok=True)
                temp = dest.with_suffix(dest.suffix + ".restore-tmp")
                temp.write_bytes(data)
                temp.replace(dest)
    return {"source": str(source), "target": str(target), "restored": restored, "dry_run": dry_run}


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("backup"); b.add_argument("--output", type=Path, required=True)
    r = sub.add_parser("restore"); r.add_argument("--source", type=Path, required=True); r.add_argument("--target", type=Path, default=ROOT); r.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result = backup(args.output) if args.command == "backup" else restore(args.source, args.target, args.dry_run)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0

if __name__ == "__main__": raise SystemExit(main())
