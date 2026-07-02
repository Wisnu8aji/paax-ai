from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from .models import CorrectionLogRequest, CorrectionRecord


def _stable_id(req: CorrectionLogRequest, timestamp: str) -> str:
    raw = json.dumps({
        "project_id": req.project_id,
        "target_ref": req.target_ref,
        "field": req.field,
        "old": req.old,
        "new": req.new,
        "reason": req.reason,
        "user": req.user,
        "timestamp": timestamp,
    }, sort_keys=True, ensure_ascii=True, default=str)
    return "corr_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def log_correction(req: CorrectionLogRequest) -> CorrectionRecord:
    timestamp = req.timestamp or datetime.now(timezone.utc).isoformat()
    return CorrectionRecord(
        id=_stable_id(req, timestamp),
        project_id=req.project_id,
        target_ref=req.target_ref,
        field=req.field,
        old=req.old,
        new=req.new,
        reason=req.reason,
        user=req.user,
        timestamp=timestamp,
    )
