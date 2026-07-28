"""Explicit, non-destructive legacy data migration for PAAX portable.

This script implements Phase 03 Task 4. It explicitly migrates data from the
legacy `data/portable` directory into the new external `PAAX_DATA_ROOT`.

Required algorithm:
1. Verify source/target absolute boundaries.
2. Inventory eligible mutable files.
3. Write inventory hashes and sizes to target staging.
4. Copy, rehash, compare.
5. Create timestamped target backup (if intentionally replacing).
6. Atomically activate.
7. Write `migration-receipt.json`.
8. Leave source intact.
9. Support idempotent rerun / dry-run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_service_running(target: Path) -> bool:
    """Check if any PID file in the target runtime directory belongs to a live process."""
    runtime = target / "runtime"
    if not runtime.exists():
        return False
    for pid_file in runtime.glob("*.pid"):
        try:
            pid = int(pid_file.read_text().strip())
            # On Windows, we can use os.kill(pid, 0) to check process existence,
            # but a safer cross-platform way in Python when psutil isn't guaranteed
            # is to catch OSError.
            os.kill(pid, 0)
            return True
        except (ValueError, OSError):
            continue
    return False


def _build_inventory(source_dir: Path) -> dict[str, dict[str, str | int]]:
    """Inventory eligible mutable files in the source."""
    inventory = {}
    
    # We only migrate known mutable files from the legacy layout.
    # Legacy data/portable files:
    # - paax-portable.db
    # - agent-runs.json, agent-events.jsonl, agent-dead-letter.jsonl
    # - takeoff-workspace.json, entity-links.json
    
    # Map of source relative path -> target relative path in new layout
    MAPPING = {
        "paax-portable.db": "db/paax-portable.db",
        "agent-runs.json": "jobs/agent-runs.json",
        "agent-events.jsonl": "jobs/agent-events.jsonl",
        "agent-dead-letter.jsonl": "jobs/agent-dead-letter.jsonl",
        "takeoff-workspace.json": "jobs/takeoff-workspace.json",
        "entity-links.json": "jobs/entity-links.json",
    }
    
    for src_rel, dst_rel in MAPPING.items():
        src_path = source_dir / src_rel
        if src_path.is_file():
            inventory[src_rel] = {
                "source_path": str(src_path.resolve()),
                "target_path": dst_rel,
                "size": src_path.stat().st_size,
                "hash": sha256(src_path),
            }
            
    return inventory


def main() -> int:
    parser = argparse.ArgumentParser(description="Explicit, non-destructive legacy data migration.")
    parser.add_argument("--source", type=Path, help="Legacy source directory (defaults to current install data/portable)")
    parser.add_argument("--target", type=Path, required=True, help="External data root target")
    parser.add_argument("--dry-run", action="store_true", help="Report only, do not copy")
    parser.add_argument("--force-replace", action="store_true", help="Allow replacement of existing target data (creates backup)")
    
    args = parser.parse_args()
    
    target: Path = args.target.resolve()
    
    if args.source:
        source: Path = args.source.resolve()
    else:
        # Default to the data/portable directory in the repository this script belongs to
        repo_root = Path(__file__).resolve().parents[2]
        source = (repo_root / "data" / "portable").resolve()
        
    print(f"Migration Source: {source}")
    print(f"Migration Target: {target}")
    
    if not source.exists() or not source.is_dir():
        print("Source directory does not exist or is not a directory. Nothing to migrate.")
        return 0
        
    if _is_service_running(target):
        print("ERROR: Target PAAX services are running. Stop them first before migration.")
        return 1
        
    inventory = _build_inventory(source)
    if not inventory:
        print("No eligible legacy data found in source.")
        return 0
        
    print(f"Found {len(inventory)} eligible files to migrate.")
    
    if args.dry_run:
        print("\n--- DRY RUN INVENTORY ---")
        print(json.dumps(inventory, indent=2))
        print("--- END DRY RUN ---")
        return 0
        
    # Check if target already has any of the files
    target_has_conflicts = False
    for item in inventory.values():
        dst_path = target / str(item["target_path"])
        if dst_path.exists():
            target_has_conflicts = True
            break
            
    if target_has_conflicts and not args.force_replace:
        print("ERROR: Target already contains data. Use --force-replace to back up and overwrite target.")
        return 1
        
    # Stage files
    staging = target / "migration" / f"staging_{int(time.time())}"
    staging.mkdir(parents=True, exist_ok=True)
    
    try:
        # 3. Write inventory hashes and sizes to target staging
        inventory_path = staging / "inventory.json"
        inventory_path.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
        
        # 4. Copy, rehash, compare
        print(f"Copying files to staging: {staging}")
        staged_files = []
        for src_rel, item in inventory.items():
            src_path = Path(item["source_path"])
            dst_staging = staging / str(item["target_path"])
            dst_staging.parent.mkdir(parents=True, exist_ok=True)
            
            shutil.copy2(src_path, dst_staging)
            actual_hash = sha256(dst_staging)
            
            if actual_hash != item["hash"]:
                raise RuntimeError(f"Hash mismatch after copy for {src_rel}. Expected {item['hash']}, got {actual_hash}")
                
            staged_files.append((dst_staging, str(item["target_path"])))
            
        # 5. Create timestamped target backup if intentionally replacing
        if target_has_conflicts:
            backup_dir = target / "backups" / f"pre_migration_{int(time.time())}"
            print(f"Creating backup of existing target data at: {backup_dir}")
            for src_rel, item in inventory.items():
                dst_path = target / str(item["target_path"])
                if dst_path.exists():
                    backup_dst = backup_dir / str(item["target_path"])
                    backup_dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dst_path, backup_dst)
                    
        # 6. Atomically activate (as close to atomic as possible across files)
        print("Activating migrated files...")
        for staging_path, target_rel in staged_files:
            dst_path = target / target_rel
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            # os.replace is atomic on POSIX, and roughly atomic on Windows
            os.replace(staging_path, dst_path)
            
        # 7. Write migration-receipt.json
        receipt = {
            "schema_version": "paax.migration-receipt.v1",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": str(source),
            "target": str(target),
            "inventory": inventory,
            "status": "PASS"
        }
        receipt_path = target / "migration" / "migration-receipt.json"
        receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        
        print(f"Migration completed successfully. Receipt written to {receipt_path}")
        
    finally:
        # Clean up staging
        if staging.exists():
            shutil.rmtree(staging)
            
    # 8. Leave source intact (by design of copy)
    return 0

if __name__ == "__main__":
    sys.exit(main())
