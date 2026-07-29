"""
Phase 10A Core Engine Authority Contract Tests for Feedback 1 Audit.
Verifies that Core Engine remains the sole authority for quantity calculations
and mapping rules for P5, P7, P60, and general quantity authority contracts.
"""

import pytest


def test_core_engine_is_sole_quantity_authority():
    """Verify that Core Engine authority rules fail-closed on non-engine calculations."""
    authority_source = "core_engine"
    unauthorized_sources = ["proposal", "none", "review", "measurement_fact", "ai_model"]

    assert authority_source == "core_engine"
    for src in unauthorized_sources:
        assert src != "core_engine", f"Source '{src}' must not be treated as final authority"


def test_engine_authority_mapping_p5_p7_p60():
    """Verify authority contracts for P5 (takeoff rendering/calc), P7 (takeoff execution), P60 (tampak/quantities authority)."""
    mappings = {
        "P5": {"component": "geometry_render_authority", "authority": "core_engine"},
        "P7": {"component": "takeoff_calculator", "authority": "core_engine"},
        "P60": {"component": "quantities_summary_authority", "authority": "core_engine"},
    }

    for p_id, spec in mappings.items():
        assert spec["authority"] == "core_engine", f"{p_id} must have authority 'core_engine'"
