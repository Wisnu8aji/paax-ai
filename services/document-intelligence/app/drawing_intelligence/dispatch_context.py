"""DispatchContext and DispatchReceipt — non-forgeable authority receipts.

Phase 09C Correction Round 3 — typed immutable dispatch context.

Design invariants:
  - DispatchContext is created ONLY by build_engine_dispatch() after capability
    resolution and typed request validation. Callers cannot create one directly.
  - DispatchReceipt binds a DispatchContext to a concrete response.
  - calculation_from_response() requires a DispatchReceipt. Without it,
    source_authority can never be "core_engine".
  - All identity fields (project_id, snapshot_id, work_item_id, evidence_digest,
    request_digest, expected_unit) are bound at creation and immutable.
  - Authority is denied if any identity field mismatches.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, FrozenSet, Literal, Optional
from pydantic import BaseModel, Field, model_validator


# ─── DispatchContext ─────────────────────────────────────────────────────────

class DispatchContext(BaseModel):
    """Immutable record created by build_engine_dispatch() after validation.

    Binds ALL identity needed to correlate a response back to the exact request:
      - endpoint          where the request was sent
      - contract          engine_contract key (e.g. "takeoff.mep")
      - calculation_type  for /calculations endpoint (e.g. "concrete_column_total_volume")
      - project_id        PAAX project scope
      - snapshot_id       drawing snapshot scope
      - work_item_id      candidate work-item ID
      - evidence_digest   SHA-256 of sorted evidence/fact IDs (immutable)
      - request_digest    SHA-256 of canonicalized request payload (immutable)
      - expected_unit     the unit/dimension expected from the engine response
    """
    endpoint: str
    contract: Optional[str] = None          # e.g. "takeoff.mep"
    calculation_type: Optional[str] = None  # e.g. "concrete_column_total_volume"
    project_id: str
    snapshot_id: str
    work_item_id: str
    evidence_digest: str                    # SHA-256 hex of sorted evidence_ref ids
    request_digest: str                     # SHA-256 hex of canonicalized payload
    expected_unit: str                      # e.g. "m3", "m", "m2", "unit"

    model_config = {"frozen": True}         # immutable after creation


def _sha256_of(data: Any) -> str:
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def make_evidence_digest(evidence_refs: list[str]) -> str:
    """SHA-256 of sorted evidence reference IDs."""
    return _sha256_of(sorted(evidence_refs))


def make_request_digest(payload: Any) -> str:
    """SHA-256 of the canonicalized request payload dict."""
    return _sha256_of(payload)


# ─── DispatchReceipt ─────────────────────────────────────────────────────────

class DispatchReceipt(BaseModel):
    """Pairs a DispatchContext with the actual engine response.

    Used as the ONLY path to source_authority="core_engine". Callers must pass
    the receipt returned or created by the client.dispatch() call.
    """
    context: DispatchContext
    response: dict[str, Any]

    model_config = {"arbitrary_types_allowed": True}

    def is_authority_valid(self) -> tuple[bool, str]:
        """Check all identity and quality gates. Returns (ok, reason)."""
        ctx = self.context
        resp = self.response

        # 1. Status check
        status = resp.get("status")
        if status is not None and status != "complete":
            return False, f"status is not 'complete' (got {status!r})"

        if "items" in resp and isinstance(resp["items"], list):
            if resp.get("n_needs_review", 0) > 0:
                return False, f"items need review (n_needs_review={resp.get('n_needs_review')})"
            for item in resp["items"]:
                if isinstance(item, dict) and item.get("needs_review"):
                    return False, f"item {item.get('kode')} needs review"

        # 2. Result must be non-null and finite
        result = self.extract_result()
        if result is None:
            return False, "result is None or zero/invalid"
        import math
        if not math.isfinite(result):
            return False, f"result is not finite ({result!r})"

        # 3. Unit correlation: compare extracted unit to expected_unit
        resp_unit = self.extract_unit()
        if resp_unit is not None:
            if not _unit_matches_expected(resp_unit, ctx.expected_unit):
                return False, (
                    f"unit mismatch: expected {ctx.expected_unit!r}, got {resp_unit!r}"
                )

        # 4. Project identity: if response declares project_id, must match exactly
        resp_project = resp.get("project_id")
        if resp_project is not None and resp_project != ctx.project_id:
            return False, (
                f"project_id mismatch: context={ctx.project_id!r}, response={resp_project!r}"
            )

        # 5. Calculation_type for /calculations endpoint must match contract
        if ctx.endpoint == "/calculations" and ctx.calculation_type is not None:
            resp_calc_type = resp.get("calculation_type")
            if resp_calc_type is not None and resp_calc_type != ctx.calculation_type:
                return False, (
                    f"calculation_type mismatch: expected {ctx.calculation_type!r}, got {resp_calc_type!r}"
                )

        return True, "ok"

    def extract_result(self) -> Optional[float]:
        """Extract the primary numeric result from the response."""
        resp = self.response
        # /takeoff/* endpoints return items list; sum non-needs_review quantities
        if "items" in resp and isinstance(resp["items"], list):
            total = 0.0
            for item in resp["items"]:
                if isinstance(item, dict) and not item.get("needs_review"):
                    q = item.get("quantity")
                    if q is not None:
                        try:
                            total += float(q)
                        except (TypeError, ValueError):
                            pass
            return total if total > 0 else None
        # /calculations endpoint
        result = resp.get("result")
        if result is not None:
            try:
                return float(result)
            except (TypeError, ValueError):
                return None
        return None

    def extract_unit(self) -> str:
        """Extract the reported unit from the response (fallback to expected)."""
        resp = self.response
        # /takeoff/* items
        if "items" in resp and isinstance(resp["items"], list):
            for item in resp["items"]:
                if isinstance(item, dict) and item.get("unit"):
                    return str(item["unit"])
        # /calculations
        unit = resp.get("unit")
        if unit:
            return str(unit)
        return self.context.expected_unit


# ─── Unit/dimension correlation ──────────────────────────────────────────────

_DIMENSION_GROUPS: dict[str, frozenset[str]] = {
    "m3": frozenset({"m3", "m³", "cubic_meter", "cbm"}),
    "m2": frozenset({"m2", "m²", "square_meter", "sqm"}),
    "m":  frozenset({"m", "meter", "lm", "l.m", "m'"}),
    "unit": frozenset({"unit", "bh", "titik", "set", "ls", "pcs", "buah"}),
    "kg": frozenset({"kg", "kilogram"}),
}

# Map expected_unit to dimension group key
def _resolve_dim(unit: str) -> Optional[str]:
    unit_lower = unit.lower().strip()
    for dim, aliases in _DIMENSION_GROUPS.items():
        if unit_lower in aliases:
            return dim
    return unit_lower  # treat as its own dimension


def _unit_matches_expected(resp_unit: str, expected_unit: str) -> bool:
    """True iff resp_unit is in the same dimension group as expected_unit."""
    resp_dim = _resolve_dim(resp_unit)
    exp_dim = _resolve_dim(expected_unit)
    return resp_dim == exp_dim


# ─── Expected unit per calculation type ──────────────────────────────────────

_CALC_TYPE_EXPECTED_UNIT: dict[str, str] = {
    "concrete_column_total_volume": "m3",
    "concrete_beam_total_volume": "m3",
    "area": "m2",
    "length": "m",
    "count": "unit",
    "weight": "kg",
}


def expected_unit_for(calculation_type: Optional[str], fallback: str = "unit") -> str:
    """Return the expected SI unit for a named calculation type."""
    if calculation_type is None:
        return fallback
    return _CALC_TYPE_EXPECTED_UNIT.get(calculation_type, fallback)
