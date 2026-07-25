from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import socket
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _validate_civil_items(payload: dict[str, Any], manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    items = payload.get("items")
    if not isinstance(items, list):
        return ["items must be a list"]
    if len(items) != int(manifest["expected"]["civil_work_items"]):
        errors.append(f"expected {manifest['expected']['civil_work_items']} items, got {len(items)}")
    if payload.get("project_id") != manifest.get("project_id"):
        errors.append("project_id mismatch")
    if payload.get("source_document_sha256") != manifest["source_document"]["sha256"]:
        errors.append("source document checksum binding mismatch")

    seen: set[str] = set()
    for item in items:
        item_id = str(item.get("id") or "")
        if not item_id or item_id in seen:
            errors.append(f"duplicate or missing item id: {item_id!r}")
        seen.add(item_id)
        refs = item.get("source_refs") or []
        if not refs:
            errors.append(f"{item_id}: missing source_refs")
        if item.get("readiness") == "ready":
            dims = item.get("dimensions") or {}
            required = ("length_m", "width_m", "height_m")
            if any(dims.get(key) is None for key in required):
                errors.append(f"{item_id}: ready item missing dimensions")
                continue
            try:
                calculated = (
                    _decimal(dims["length_m"])
                    * _decimal(dims["width_m"])
                    * _decimal(dims["height_m"])
                    * _decimal(item.get("count"))
                )
                expected = _decimal(item.get("result"))
                if abs(calculated - expected) > Decimal("0.000001"):
                    errors.append(f"{item_id}: formula drift {calculated} != {expected}")
            except Exception as exc:  # noqa: BLE001 - report exact artifact defect
                errors.append(f"{item_id}: invalid numeric inputs ({exc})")
            if item.get("source_authority") != "core_engine":
                errors.append(f"{item_id}: ready volume must use core_engine authority")
    canonical = next((item for item in items if item.get("id") == "work-column-K2-L2"), None)
    if not canonical:
        errors.append("canonical K2 L2 item missing")
    elif not (
        canonical.get("count") == 4
        and _decimal(canonical.get("result")) == Decimal("2.34")
        and canonical.get("location") == "Lantai 2"
        and canonical.get("technical_code") == "K2"
    ):
        errors.append("canonical K2 L2 fact does not match independent ground truth")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the PAAX PLHUT portable package before setup/start.")
    parser.add_argument(
        "--allow-running",
        action="store_true",
        help="Treat already-listening PAAX ports as healthy for idempotent Start-PLHUT-Local reruns.",
    )
    args = parser.parse_args()

    checks: list[dict[str, Any]] = []

    def check(name: str, ok: bool, detail: Any) -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})

    manifest_path = ROOT / "fixtures" / "plhut" / "project-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        check("project_manifest", True, manifest_path)
    except Exception as exc:  # noqa: BLE001
        check("project_manifest", False, exc)
        manifest = {}

    if manifest:
        source = ROOT / manifest["source_document"]["path"]
        check("source_pdf_exists", source.is_file(), source)
        if source.is_file():
            actual_sha = hashlib.sha256(source.read_bytes()).hexdigest()
            check("source_pdf_sha256", actual_sha == manifest["source_document"]["sha256"], actual_sha)
            try:
                import fitz

                with fitz.open(source) as document:
                    check("source_pdf_page_count", document.page_count == manifest["source_document"]["page_count"], document.page_count)
            except Exception as exc:  # noqa: BLE001
                check("source_pdf_page_count", False, exc)

        fixtures = sorted((ROOT / manifest["dem_fixture_dir"]).glob("page-*.json"))
        check("dem_fixture_pages", len(fixtures) == manifest["expected"]["dem_pages"], len(fixtures))
        civil_path = ROOT / manifest["civil_work_items"]
        check("civil_work_items_exists", civil_path.is_file(), civil_path)
        if civil_path.is_file():
            try:
                payload = json.loads(civil_path.read_text(encoding="utf-8"))
                errors = _validate_civil_items(payload, manifest)
                check("civil_work_items_integrity", not errors, "; ".join(errors) if errors else f"{len(payload.get('items', []))} items valid")
            except Exception as exc:  # noqa: BLE001
                check("civil_work_items_integrity", False, exc)
        check("portable_default_project", manifest.get("portable_default") is True, manifest.get("project_id"))
        check("bootstrap_non_destructive", bool(manifest.get("bootstrap_policy", {}).get("never_drop_database")), manifest.get("bootstrap_policy"))

    for module in ("fastapi", "sqlalchemy", "uvicorn", "fitz", "openpyxl", "aiosqlite"):
        check(f"python_module_{module}", importlib.util.find_spec(module) is not None, module)
    check("node_package_manifest", (ROOT / "pnpm-lock.yaml").is_file(), "pnpm-lock.yaml")

    for port in (8001, 8081, 8083, 8085, 3000):
        sock = socket.socket()
        sock.settimeout(0.2)
        busy = sock.connect_ex(("127.0.0.1", port)) == 0
        sock.close()
        ok = not busy or args.allow_running
        state = "already running (allowed)" if busy and args.allow_running else ("available" if not busy else "already in use")
        check(f"port_{port}_available", ok, state)

    failed = [item for item in checks if not item["ok"]]
    print(json.dumps({"status": "PASS" if not failed else "FAIL", "checks": checks}, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
