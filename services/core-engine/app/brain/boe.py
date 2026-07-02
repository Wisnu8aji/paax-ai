from __future__ import annotations

from .models import BrainBoe, BrainBoeRequest


def build_boe(req: BrainBoeRequest) -> BrainBoe:
    return BrainBoe(
        project_context=req.project_context,
        assumptions=req.assumptions,
        missing=req.missing,
        warnings=req.warnings,
        param_snapshot=req.param_snapshot,
        data_coverage_summary=req.data_coverage_summary,
    )
