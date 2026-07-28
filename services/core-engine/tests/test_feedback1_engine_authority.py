from __future__ import annotations

from pathlib import Path


def test_document_intelligence_does_not_copy_engine_formula_source():
    root = Path(__file__).resolve().parents[3]
    bridge = (root / "services/document-intelligence/app/drawing_intelligence/calculation_bridge.py").read_text(encoding="utf-8")
    assert "eval(" not in bridge
    assert "source_authority=\"core_engine\"" in bridge
    assert "endpoint" in bridge


def test_frontend_handoff_requires_core_engine_authority():
    root = Path(__file__).resolve().parents[3]
    source = (root / "apps/web/src/components/drawing-intelligence/workspace/quantity-authority.ts").read_text(encoding="utf-8")
    assert "sourceAuthority === 'core_engine'" in source
    assert "unit !== 'ref'" in source
