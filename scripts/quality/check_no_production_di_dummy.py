from __future__ import annotations

"""Fail when Drawing Intelligence production code imports or claims dummy data."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [
    ROOT / "apps/web/src/components/drawing-intelligence",
    ROOT / "services/document-intelligence/app",
    ROOT / "services/db/src/paax_db",
]
EXCLUDED_PARTS = {"__tests__", "__fixtures__", "fixtures", "tests"}
FORBIDDEN = [
    re.compile(r"(?:from|import).*di-mock-data"),
    re.compile(r"\bMOCK_(?:FILE|SHEETS|ELEMENTS|QUANTITY|REVIEW|ASSUMPTIONS|ACTIVITY)\b"),
    re.compile(r"load-mock-data"),
    re.compile(r"demo sheets prepared", re.I),
    re.compile(r"Coming soon", re.I),
    re.compile(r"2\.4\s*\*\s*1024\s*\*\s*1024"),
    re.compile(r"civil-work-items\.json"),
]


def scan() -> list[str]:
    findings: list[str] = []
    for target in TARGETS:
        for path in target.rglob("*"):
            if not path.is_file() or path.suffix not in {".py", ".ts", ".tsx", ".js", ".jsx"}:
                continue
            rel = path.relative_to(ROOT)
            if any(part in EXCLUDED_PARTS for part in rel.parts):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for line_no, line in enumerate(text.splitlines(), 1):
                for pattern in FORBIDDEN:
                    if pattern.search(line):
                        findings.append(f"{rel}:{line_no}: {line.strip()}")
    return findings


if __name__ == "__main__":
    issues = scan()
    if issues:
        print("Production Drawing Intelligence dummy-data gate failed:")
        print("\n".join(issues))
        sys.exit(1)
    print("Production Drawing Intelligence dummy-data gate passed.")
