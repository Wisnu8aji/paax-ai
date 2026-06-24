"""
AHSP mapper — map RAB work items to AHSP recipes.
"""

from __future__ import annotations

from app.domain.hsp.library import get_ahsp_library
from app.domain.hsp.models import AHSPRecipe


def find_recipe_for_item(uraian: str) -> AHSPRecipe | None:
    """Find the best-matching AHSP recipe for a given work-item description."""
    library = get_ahsp_library()
    uraian_lower = uraian.lower()

    # Simple keyword matching
    for recipe in library:
        keywords = recipe.uraian_pekerjaan.lower().split()
        match_count = sum(1 for kw in keywords if kw in uraian_lower)
        if match_count >= 2:
            return recipe

    return None


def get_all_recipes() -> list[AHSPRecipe]:
    """Return the full AHSP library."""
    return get_ahsp_library()
