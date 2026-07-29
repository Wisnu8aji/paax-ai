from __future__ import annotations

"""Append-only JSONL audit log with sha256 hash chaining."""

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

from .contracts import AiProposalAudit


class AppendOnlyProposalAuditLog:
    """JSONL hash-chain ledger; existing records are never edited in place."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def _last_hash(self) -> str:
        if not self.path.exists():
            return "GENESIS"
        last = "GENESIS"
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                last = str(json.loads(line)["record_hash"])
        return last

    def append(self, audit: AiProposalAudit) -> dict[str, Any]:
        normalized = audit.normalized()
        previous_hash = self._last_hash()
        body = asdict(normalized)
        canonical = json.dumps(
            {"previous_hash": previous_hash, "audit": body},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        record_hash = sha256(canonical.encode("utf-8")).hexdigest()
        row = {"previous_hash": previous_hash, "record_hash": record_hash, "audit": body}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        return row

    def verify(self) -> bool:
        previous = "GENESIS"
        if not self.path.exists():
            return True
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("previous_hash") != previous:
                return False
            canonical = json.dumps(
                {"previous_hash": previous, "audit": row.get("audit")},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            expected = sha256(canonical.encode("utf-8")).hexdigest()
            if row.get("record_hash") != expected:
                return False
            previous = expected
        return True
