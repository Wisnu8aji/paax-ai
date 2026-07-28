#!/usr/bin/env python3
"""Offline cross-language parity check for the canonical SheetViews contract.

This checker intentionally uses one retained JSON fixture and validates it with:
1. the shared Python Pydantic package,
2. the document-intelligence service Pydantic model, and
3. the built Zod/CommonJS package consumed by the web application.

No network, provider, PDF, OCR, or quantity engine call is performed.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "packages" / "schemas" / "fixtures" / "sheet-views.valid.json"
SHARED_PYTHON = ROOT / "packages" / "schemas" / "python"
SERVICE_ROOT = ROOT / "services" / "document-intelligence"
ZOD_BUILD = ROOT / "packages" / "schemas" / "dist" / "index.js"


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _load_payload() -> dict[str, Any]:
    if not FIXTURE.is_file():
        raise FileNotFoundError(f"SheetViews fixture is missing: {FIXTURE}")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _python_outputs(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    sys.path.insert(0, str(SHARED_PYTHON))
    sys.path.insert(0, str(SERVICE_ROOT))

    from paax_schemas import SheetViews as SharedSheetViews  # noqa: PLC0415
    from app.drawing_intelligence.models import SheetViews as ServiceSheetViews  # noqa: PLC0415

    shared = SharedSheetViews.model_validate(payload).model_dump(mode="json")
    service = ServiceSheetViews.model_validate(payload).model_dump(mode="json")
    return shared, service


def _zod_output() -> dict[str, Any]:
    if not ZOD_BUILD.is_file():
        raise FileNotFoundError(
            "Built Zod schema is missing. Build packages/schemas before running parity: "
            f"{ZOD_BUILD}"
        )

    script = r"""
const fs = require('node:fs');
const schema = require(process.argv[1]);
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const parsed = schema.SheetViewsSchema.parse(payload);
process.stdout.write(JSON.stringify(parsed));
"""
    completed = subprocess.run(
        ["node", "-e", script, str(ZOD_BUILD), str(FIXTURE)],
        check=True,
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    return json.loads(completed.stdout)


def _assert_negative_contracts(payload: dict[str, Any]) -> None:
    """Prove both runtimes reject a rewritten source page identity."""

    bad = json.loads(json.dumps(payload))
    bad["source"][1]["page_number"] = 99

    sys.path.insert(0, str(SHARED_PYTHON))
    from paax_schemas import SheetViews as SharedSheetViews  # noqa: PLC0415

    try:
        SharedSheetViews.model_validate(bad)
    except Exception:
        pass
    else:
        raise AssertionError("Shared Python SheetViews accepted rewritten page_number")

    node_script = r"""
const fs = require('node:fs');
const schema = require(process.argv[1]);
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = schema.SheetViewsSchema.safeParse(payload);
if (result.success) process.exit(4);
"""
    completed = subprocess.run(
        ["node", "-e", node_script, str(ZOD_BUILD)],
        input=json.dumps(bad),
        text=True,
        cwd=ROOT,
    )
    if completed.returncode != 0:
        raise AssertionError("Zod SheetViews accepted rewritten page_number")


def main() -> int:
    payload = _load_payload()
    shared, service = _python_outputs(payload)
    zod = _zod_output()

    expected = _canonical(payload)
    outputs = {
        "shared_python": shared,
        "document_intelligence": service,
        "zod": zod,
    }
    mismatches = [name for name, value in outputs.items() if _canonical(value) != expected]
    if mismatches:
        print("SheetViews contract mismatch:", ", ".join(mismatches), file=sys.stderr)
        return 1

    _assert_negative_contracts(payload)
    print(
        "SheetViews contract parity: PASS "
        f"({len(payload['source'])} immutable pages; Python shared/service + Zod)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
