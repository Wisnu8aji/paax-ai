#!/usr/bin/env python3
"""Fail-closed package checks for the PAAX Drawing Intelligence delivery."""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
required = [
    "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
    "dem_extraction_88pages/run_summary.json",
    "services/document-intelligence/app/drawing_intelligence/pipeline.py",
    "services/document-intelligence/app/api/intelligence_routes.py",
    "services/document-intelligence/tests/test_drawing_intelligence_kreo_runtime.py",
    "docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_20_PHASES_2026-07-21.md",
    "report/report_drawing_intelligence/DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json",
    "report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.md",
    "report/report_drawing_intelligence/PAAX_DRAWING_INTELLIGENCE_KREO_PLUS_IMPLEMENTATION_REPORT_2026-07-21.md",
]
for rel in required:
    if not (ROOT / rel).is_file():
        errors.append(f"missing required file: {rel}")
pages = list((ROOT / "dem_extraction_88pages" / "pages").glob("page-*.json"))
if len(pages) != 88:
    errors.append(f"expected 88 DEM pages, found {len(pages)}")
forbidden_dirs = {".git", "node_modules", ".next", "dist", "build", ".turbo", "__pycache__", ".pytest_cache", "graphify-out"}
for p in ROOT.rglob("*"):
    rel = p.relative_to(ROOT).as_posix()
    if p.is_dir() and (p.name in forbidden_dirs or p.name.endswith(".egg-info")):
        errors.append(f"forbidden directory: {rel}")
    if p.is_file() and (
        p.name in {".env", ".env.local", ".env.production"}
        or p.name.endswith(".tsbuildinfo")
        or p.suffix.lower() in {".pyc", ".log", ".rar", ".zip"}
    ):
        errors.append(f"forbidden file: {rel}")
secret = re.compile(r"(?i)(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")
for p in ROOT.rglob("*"):
    if not p.is_file() or p.stat().st_size > 1_000_000 or p.name.endswith(".example"):
        continue
    if secret.search(p.read_text("utf-8", errors="ignore")):
        errors.append(f"possible secret: {p.relative_to(ROOT).as_posix()}")
if errors:
    print("DRAWING INTELLIGENCE PACKAGE VERIFICATION FAILED")
    for item in sorted(set(errors)):
        print("-", item)
    sys.exit(1)
print("DRAWING INTELLIGENCE PACKAGE VERIFICATION PASSED")
print("DEM pages:", len(pages))
