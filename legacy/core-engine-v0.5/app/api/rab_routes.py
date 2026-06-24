"""
RAB API routes — generate, recalculate, review, optimize.

All numerical results come from the deterministic calculator,
never from the LLM.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.domain.rab.calculator import generate_rab, recalculate_rab
from app.domain.rab.models import (
    GenerateRABRequest,
    OptimizeRABRequest,
    OptimizeRABResponse,
    RABSummary,
    RABVersion,
    RecalculateRABRequest,
    ReviewRABRequest,
    ReviewRABResponse,
)
from app.domain.rab.optimizer import optimize_rab
from app.domain.rab.validators import validate_rab_items
from app.domain.rab.warnings import generate_all_warnings

router = APIRouter()


@router.post("/generate", response_model=RABVersion)
async def generate(request: GenerateRABRequest) -> RABVersion:
    """Generate a draft RAB from project parameters.

    Uses demo pricing and proportion-based estimation.
    Angka final dihitung oleh core-engine, bukan LLM.
    """
    return generate_rab(request)


@router.post("/recalculate", response_model=RABSummary)
async def recalculate(request: RecalculateRABRequest) -> RABSummary:
    """Recalculate subtotals, PPN, contingency, and grand total.

    Call this after the user (or AI advisor) edits volumes or prices.
    """
    return recalculate_rab(
        groups=request.groups,
        ppn_rate=request.ppn_rate,
        contingency_rate=request.contingency_rate,
        overhead_profit_rate=request.overhead_profit_rate,
    )


@router.post("/review", response_model=ReviewRABResponse)
async def review(request: ReviewRABRequest) -> ReviewRABResponse:
    """Run deterministic checks on a RAB and return warnings.

    Checks include: unit validation, price-range, volume sanity,
    missing categories, and proportion anomalies.
    """
    item_warnings = validate_rab_items(request.groups)
    structural_warnings = generate_all_warnings(request.groups)
    all_warnings = item_warnings + structural_warnings

    # Simple scoring: start at 100, deduct per warning severity
    score = 100.0
    for w in all_warnings:
        if w.severity == "error":
            score -= 10
        elif w.severity == "warning":
            score -= 3
        else:
            score -= 1
    score = max(score, 0.0)

    return ReviewRABResponse(
        project_id=request.project_id,
        warnings=all_warnings,
        score=round(score, 1),
    )


@router.post("/optimize", response_model=OptimizeRABResponse)
async def optimize(request: OptimizeRABRequest) -> OptimizeRABResponse:
    """Attempt to reduce budget by target percentage.

    Preserves structural and foundation items. Reduces finishing,
    exterior, and non-critical items first.
    """
    return optimize_rab(
        groups=request.groups,
        target_reduction_pct=request.target_reduction_pct,
        project_id=request.project_id,
    )
