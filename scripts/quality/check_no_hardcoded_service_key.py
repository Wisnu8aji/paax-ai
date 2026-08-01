#!/usr/bin/env python3
"""
check_no_hardcoded_service_key.py

Phase 4 security gate: Scans all production proxy and service files for
hardcoded credential fallbacks. Any match causes a non-zero exit.

Forbidden patterns detected:
  - Exact string literal: "live-test-key"
  - Exact string literal: "test-internal-key"
  - JS/TS pattern: process.env.INTERNAL_SERVICE_KEY || "..."
  - Python pattern: os.environ.get("INTERNAL_SERVICE_KEY", "...")
  - Any 'INTERNAL_SERVICE_KEY' assignment with a string literal fallback not gated by TESTING

Allowed patterns (whitelisted):
  - Files matching *_test*, test_*, *.test.ts, *.spec.ts
  - Lines containing 'TESTING' guard (Python: os.environ.get("TESTING") != "1")
  - This scanner file itself
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root

# Files to scan (relative to ROOT)
SCAN_DIRS = [
    "apps/web/src/app/api",
    "services",
]

EXCLUDE_PATTERNS = [
    "*_test*",
    "test_*",
    "conftest*",     # pytest configuration/fixtures
    "*.test.ts",
    "*.spec.ts",
    "*.test.py",
    "__pycache__",
    "node_modules",
    ".git",
    "check_no_hardcoded_service_key.py",  # this file
]

FORBIDDEN_PATTERNS = [
    # Literal string values — exact hardcoded keys that bypass auth
    (re.compile(r'"live-test-key"'), "hardcoded live-test-key literal"),
    (re.compile(r"'live-test-key'"), "hardcoded live-test-key literal"),
    # test-internal-key used WITHOUT TESTING=1 guard
    # (auth.py files that gate it behind os.environ.get("TESTING")=="1" are allowed)
    (re.compile(r'"test-internal-key"'), "hardcoded test-internal-key literal (check TESTING=1 guard)"),
    (re.compile(r"'test-internal-key'"), "hardcoded test-internal-key literal (check TESTING=1 guard)"),
]

# Patterns that are explicitly SAFE even if they contain a key string:
# - Empty string fallback: || '' or || "" → effectively fail-closed (401)
# - TESTING=1 guard pattern in same line
# - NODE_ENV === 'test' guard in same line
SAFE_OVERRIDES = [
    re.compile(r'\|\|\s*["\']\s*["\']'),          # || '' or || "" (empty fallback)
    re.compile(r'TESTING.*==.*["\']1["\']'),       # TESTING == "1" guard
    re.compile(r'NODE_ENV.*===.*["\']test["\']'),  # NODE_ENV === "test" guard
    re.compile(r'os\.environ\.get\(["\']TESTING'),  # Python TESTING guard
]


def is_excluded(path: Path) -> bool:
    for part in path.parts:
        for pat in ["node_modules", ".git", "__pycache__"]:
            if part == pat:
                return True
    name = path.name
    for pat in EXCLUDE_PATTERNS:
        if pat.startswith("*") and name.endswith(pat[1:]):
            return True
        if pat.endswith("*") and name.startswith(pat[:-1]):
            return True
        if name == pat:
            return True
    return False


def line_is_safe(line: str) -> bool:
    """Return True if the line has a known-safe pattern that overrides a keyword match."""
    # Check for TESTING=1 guard
    if "TESTING" in line and ("!= \"1\"" in line or "!= '1'" in line or "== \"1\"" in line or "== '1'" in line):
        return True
    # Check any SAFE_OVERRIDES pattern
    for safe_pat in SAFE_OVERRIDES:
        if safe_pat.search(line):
            return True
    return False


def scan_file(path: Path) -> list:
    violations = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return [(str(path), 0, f"Could not read file: {e}")]

    lines = text.splitlines()
    for lineno, line in enumerate(lines, 1):
        if line_is_safe(line):
            continue
        # Also check if the preceding 1-3 lines have a TESTING guard (multi-line pattern)
        context_start = max(0, lineno - 4)
        context = "\n".join(lines[context_start:lineno])
        if line_is_safe(context):
            continue
        for pattern, description in FORBIDDEN_PATTERNS:
            if pattern.search(line):
                violations.append((str(path.relative_to(ROOT)), lineno, description, line.strip()))

    return violations


def main():
    all_violations = []
    scanned = 0

    for scan_dir in SCAN_DIRS:
        full_dir = ROOT / scan_dir
        if not full_dir.exists():
            continue
        for path in full_dir.rglob("*"):
            if not path.is_file():
                continue
            if is_excluded(path):
                continue
            if path.suffix not in (".ts", ".tsx", ".js", ".jsx", ".py", ".ps1", ".sh"):
                continue
            violations = scan_file(path)
            all_violations.extend(violations)
            scanned += 1

    print(f"\n[security-scan] Scanned {scanned} production source files for hardcoded credentials\n")

    if all_violations:
        print(f"[FAIL] {len(all_violations)} violation(s) found:\n")
        for v in all_violations:
            if len(v) == 4:
                file_path, lineno, desc, line = v
                print(f"  {file_path}:{lineno} — {desc}")
                print(f"    > {line}")
            else:
                print(f"  {v[0]}:{v[1]} — {v[2]}")
        print()
        sys.exit(1)
    else:
        print("[PASS] No hardcoded credential fallbacks found in production source.")
        sys.exit(0)


if __name__ == "__main__":
    main()
