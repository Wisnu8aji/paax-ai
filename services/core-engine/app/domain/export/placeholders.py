"""
Placeholder mapping for Excel templates.

Maps template placeholders to data accessors so templates can be
populated dynamically.
"""

from __future__ import annotations

from typing import Any

from app.domain.rab.models import RABSummary, RABVersion


def build_placeholder_map(rab: RABVersion, project_name: str = "Proyek") -> dict[str, Any]:
    """
    Build a dictionary of placeholder → value mappings for template filling.

    Placeholders use the format ``{{PLACEHOLDER_NAME}}``.
    """
    summary = rab.summary or RABSummary(subtotal=0)

    placeholders: dict[str, Any] = {
        "{{PROJECT_NAME}}": project_name,
        "{{PROJECT_ID}}": rab.project_id,
        "{{VERSION}}": rab.version,
        "{{LABEL}}": rab.label,
        "{{DATE}}": rab.created_at.strftime("%d %B %Y"),
        "{{SUBTOTAL}}": summary.subtotal,
        "{{PPN_RATE}}": f"{summary.ppn_rate:.0%}",
        "{{PPN}}": summary.ppn,
        "{{CONTINGENCY_RATE}}": f"{summary.contingency_rate:.0%}",
        "{{CONTINGENCY}}": summary.contingency,
        "{{OVERHEAD_PROFIT_RATE}}": f"{summary.overhead_profit_rate:.0%}",
        "{{OVERHEAD_PROFIT}}": summary.overhead_profit,
        "{{GRAND_TOTAL}}": summary.grand_total,
        "{{NUM_GROUPS}}": len(rab.groups),
        "{{NUM_ITEMS}}": sum(len(g.items) for g in rab.groups),
    }

    # Per-group placeholders
    for idx, group in enumerate(rab.groups, start=1):
        prefix = f"{{{{GROUP_{idx}"
        placeholders[f"{prefix}_NAME}}}}"] = group.nama
        placeholders[f"{prefix}_SUBTOTAL}}}}"] = group.subtotal
        placeholders[f"{prefix}_NUM_ITEMS}}}}"] = len(group.items)

    return placeholders
