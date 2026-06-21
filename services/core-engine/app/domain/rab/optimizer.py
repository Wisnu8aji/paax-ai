"""
RAB optimizer — reduce budget while preserving structural integrity.

Strategy:
1. Never touch items marked ``locked=True``
2. Never reduce STRUKTUR or PONDASI items (safety)
3. Reduce FINISHING and LUAR items first
4. Then reduce PINTU_JENDELA, PLAFON, SANITASI
5. Apply a uniform reduction factor to qualifying items
"""

from __future__ import annotations

import copy

from app.domain.rab.calculator import calculate_summary
from app.domain.rab.models import (
    KategoriPekerjaan,
    OptimizeRABResponse,
    RABGroup,
)

# Categories that may be reduced, in priority order (first = reduced more)
_REDUCIBLE_PRIORITY: list[set[KategoriPekerjaan]] = [
    {KategoriPekerjaan.FINISHING, KategoriPekerjaan.LUAR},
    {KategoriPekerjaan.PINTU_JENDELA, KategoriPekerjaan.PLAFON},
    {KategoriPekerjaan.SANITASI, KategoriPekerjaan.MEP},
    {KategoriPekerjaan.DINDING, KategoriPekerjaan.LANTAI},
    {KategoriPekerjaan.ATAP},
]

# Categories we NEVER reduce
_PROTECTED: set[KategoriPekerjaan] = {
    KategoriPekerjaan.PERSIAPAN,
    KategoriPekerjaan.TANAH,
    KategoriPekerjaan.PONDASI,
    KategoriPekerjaan.STRUKTUR,
}


def optimize_rab(
    groups: list[RABGroup],
    target_reduction_pct: float,
    project_id: str,
) -> OptimizeRABResponse:
    """
    Attempt to reduce the RAB total by ``target_reduction_pct`` percent.

    Returns optimised groups plus a change log.
    """
    # Deep-copy so we don't mutate the caller's data
    opt_groups = copy.deepcopy(groups)

    # Recalculate original total
    original_summary = calculate_summary(groups)
    original_total = original_summary.grand_total
    target_savings = original_total * (target_reduction_pct / 100.0)

    cumulative_savings = 0.0
    changes: list[str] = []

    for tier in _REDUCIBLE_PRIORITY:
        if cumulative_savings >= target_savings:
            break

        remaining = target_savings - cumulative_savings

        # Gather all unlocked items in this tier
        tier_items = []
        for g in opt_groups:
            if g.kategori not in tier or g.kategori in _PROTECTED:
                continue
            for item in g.items:
                if not item.locked:
                    tier_items.append(item)

        if not tier_items:
            continue

        tier_total = sum(it.volume * it.harga_satuan for it in tier_items)
        if tier_total <= 0:
            continue

        # Determine reduction factor for this tier (cap at 30 % per tier)
        max_from_tier = tier_total * 0.30
        actual_reduction = min(remaining, max_from_tier)
        factor = 1.0 - (actual_reduction / tier_total)

        for item in tier_items:
            old_price = item.harga_satuan
            item.harga_satuan = round(old_price * factor, 0)
            item.hitung_jumlah()
            savings_item = (old_price - item.harga_satuan) * item.volume
            cumulative_savings += savings_item

        tier_names = ", ".join(k.value for k in tier)
        changes.append(
            f"Harga satuan item di divisi [{tier_names}] dikurangi "
            f"{(1 - factor):.1%} (penghematan ≈ Rp {actual_reduction:,.0f})"
        )

    optimized_summary = calculate_summary(opt_groups)
    optimized_total = optimized_summary.grand_total
    actual_savings = original_total - optimized_total

    # Attach new summary to groups (for response serialisation)
    return OptimizeRABResponse(
        project_id=project_id,
        original_total=original_total,
        optimized_total=optimized_total,
        savings=round(actual_savings, 2),
        savings_pct=round((actual_savings / original_total) * 100, 2) if original_total else 0,
        groups=opt_groups,
        changes=changes,
    )
