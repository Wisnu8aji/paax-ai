from __future__ import annotations

from typing import Any, Dict

from ..brain.models import BrainBoe
from ..tkg.takeoff import BbsResult


def export_boe_payload(boe: BrainBoe) -> Dict[str, Any]:
    return {
        "format": "json",
        "kind": "boe",
        "boe": boe.model_dump(mode="json"),
    }


def export_bbs_payload(bbs: BbsResult) -> Dict[str, Any]:
    return {
        "format": "json",
        "kind": "bbs",
        "bbs": bbs.model_dump(mode="json"),
    }
