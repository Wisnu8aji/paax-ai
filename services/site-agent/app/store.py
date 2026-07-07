"""
PAAX Site Agent — Store in-memory sederhana untuk scaffold.

Catatan: Ini adalah in-memory store sementara untuk scaffold v0.1.
Di v2.0 nanti akan diganti dengan akses ke PostgreSQL via db-api (Task R6).
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .models import SiteLogInput, SiteLogRecord

# In-memory store: {project_id: [SiteLogRecord, ...]}
_logs: Dict[str, List[SiteLogRecord]] = {}


def save_log(inp: SiteLogInput) -> SiteLogRecord:
    record = SiteLogRecord(
        **inp.model_dump(),
        id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat()
    )
    _logs.setdefault(inp.project_id, []).append(record)
    return record


def get_logs(
    project_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> List[SiteLogRecord]:
    records = _logs.get(project_id, [])
    if from_date:
        records = [r for r in records if r.date >= from_date]
    if to_date:
        records = [r for r in records if r.date <= to_date]
    return records


def get_log_by_date(project_id: str, date: str) -> Optional[SiteLogRecord]:
    for r in _logs.get(project_id, []):
        if r.date == date:
            return r
    return None


def reset_store() -> None:
    """Reset store — hanya untuk testing."""
    _logs.clear()
