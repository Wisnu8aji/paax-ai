from __future__ import annotations

from .models import WbsCompletenessRequest, WbsCompletenessResult
from .wbs import WBS_MASTER


def check_wbs_completeness(req: WbsCompletenessRequest) -> WbsCompletenessResult:
    present = sorted(set(req.existing_divisions))
    na = sorted(set(req.not_applicable))
    all_codes = [d.code for d in WBS_MASTER]
    missing = [code for code in all_codes if code not in present and code not in na]
    warnings = [f"{code} belum ada atau belum ditandai not_applicable." for code in missing]
    return WbsCompletenessResult(
        present_divisions=present,
        missing_relevant=missing,
        not_applicable=na,
        warnings=warnings,
    )
