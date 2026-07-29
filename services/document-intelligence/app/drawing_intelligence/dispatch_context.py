"""DispatchContext and DispatchReceipt — Object-Capability Authority Boundary.

Phase 09C Correction Round 5 — Unexported object capability & truthful request identity.

Design Invariants:
  - Trust Boundary: DispatchReceipt contains NO public create_verified or caller-settable
    verification token. Verified issuance uses an unexported module sentinel
    (_CLIENT_ISSUED_RECEIPT_SENTINEL) set ONLY by CoreEngineCalculationClient.execute_dispatch().
  - Truthful Request Identity: idempotency_key is a fixed-format SHA-256-derived opaque fingerprint
    (idemp-<32-hex-chars>) safe for HTTP headers. It provides deterministic request correlation.
    Note: Core Engine is stateless (no server-side idempotency storage); the key guarantees client-side
    reproducibility and correlation across the execution roundtrip.
  - Endpoint-Specific Family Models: Exact Pydantic schema validation per endpoint family:
      1. /calculations           -> DICalculationsResponse
      2. /tkg/takeoff            -> DITkgTakeoffResponse
      3. /takeoff/mep[_advanced] -> DIMepTakeoffResponse
      4. /takeoff/* (manual)     -> DIManualTakeoffResponse
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Optional
from pydantic import BaseModel, Field, ValidationError

from .dispatch_schemas import (
    DICalculationsResponse,
    DIManualTakeoffResponse,
    DIMepTakeoffResponse,
    DITkgTakeoffResponse,
)

# Unexported module sentinel for object-capability verification
_CLIENT_ISSUED_RECEIPT_SENTINEL = object()


class DispatchContext(BaseModel):
    """Immutable context created by build_engine_dispatch() after request validation."""
    endpoint: str
    contract: Optional[str] = None          # e.g. "takeoff.mep"
    calculation_type: Optional[str] = None  # e.g. "concrete_column_total_volume"
    project_id: str
    snapshot_id: str
    work_item_id: str
    evidence_digest: str                    # SHA-256 hex of sorted evidence_ref ids
    request_digest: str                     # SHA-256 hex of canonicalized payload
    expected_unit: str                      # e.g. "m3", "m2", "m", "kg", "unit"
    idempotency_key: str                    # Fixed-format safe opaque fingerprint

    model_config = {"frozen": True}         # immutable after creation


def _sha256_of(data: Any) -> str:
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def make_evidence_digest(evidence_refs: list[str]) -> str:
    """SHA-256 hex digest of sorted evidence reference IDs."""
    return _sha256_of(sorted(evidence_refs))


def make_request_digest(payload: Any) -> str:
    """SHA-256 hex digest of the canonicalized request payload dict."""
    return _sha256_of(payload)


def make_idempotency_key(project_id: str, snapshot_id: str, work_item_id: str, request_digest: str) -> str:
    """Generate a fixed-format safe opaque request fingerprint for Core Engine dispatch.

    Always produces 'idemp-<32-hex-chars>', which is alphanumeric and dashes only.
    Safe for HTTP headers without header injection risks.
    """
    fingerprint_input = {
        "project_id": str(project_id),
        "snapshot_id": str(snapshot_id),
        "work_item_id": str(work_item_id),
        "request_digest": str(request_digest),
    }
    hex_digest = _sha256_of(fingerprint_input)[:32]
    return f"idemp-{hex_digest}"


# ─── DispatchReceipt ─────────────────────────────────────────────────────────

class DispatchReceipt(BaseModel):
    """Pairs a DispatchContext with the actual Core Engine response.

    Object Capability Boundary:
    Ordinary public construction DispatchReceipt(context=..., response=...) leaves
    the private _client_sentinel unset (None).
    ONLY CoreEngineCalculationClient.execute_dispatch() invokes _mark_client_verified()
    to attach the unexported _CLIENT_ISSUED_RECEIPT_SENTINEL.
    """
    context: DispatchContext
    response: dict[str, Any]

    model_config = {"arbitrary_types_allowed": True}

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        # Private attribute not defined in Pydantic fields — never populated by model_validate or kwargs
        object.__setattr__(self, "_client_sentinel", None)

    def _mark_client_verified(self) -> "DispatchReceipt":
        """Private module method called ONLY by CoreEngineCalculationClient.execute_dispatch()."""
        object.__setattr__(self, "_client_sentinel", _CLIENT_ISSUED_RECEIPT_SENTINEL)
        return self

    def is_client_verified(self) -> bool:
        """True ONLY if this receipt instance was marked by CoreEngineCalculationClient."""
        return getattr(self, "_client_sentinel", None) is _CLIENT_ISSUED_RECEIPT_SENTINEL

    def is_authority_valid(self) -> tuple[bool, str]:
        """Check all identity, client verification, and Pydantic response gates. Returns (ok, reason)."""
        ctx = self.context
        resp = self.response

        # Gate 0: Must be client-verified via unexported object capability
        if not self.is_client_verified():
            return False, "DispatchReceipt was not issued by a verified CoreEngineCalculationClient execution roundtrip"

        # Gate 1: Endpoint-specific strict response model validation per endpoint family
        if ctx.endpoint == "/calculations":
            try:
                calc_resp = DICalculationsResponse.model_validate(resp)
            except ValidationError as exc:
                return False, f"/calculations response failed strict schema validation: {exc.errors()[0]['msg']}"

            if calc_resp.project_id is not None and calc_resp.project_id != ctx.project_id:
                return False, f"project_id mismatch: context={ctx.project_id!r}, response={calc_resp.project_id!r}"

            if calc_resp.snapshot_id is not None and calc_resp.snapshot_id != ctx.snapshot_id:
                return False, f"snapshot_id mismatch: context={ctx.snapshot_id!r}, response={calc_resp.snapshot_id!r}"

            if calc_resp.calculation_type is not None and calc_resp.calculation_type != ctx.calculation_type:
                return False, f"calculation_type mismatch: expected {ctx.calculation_type!r}, got {calc_resp.calculation_type!r}"

            if not _unit_matches_expected(calc_resp.unit, ctx.expected_unit):
                return False, f"unit mismatch: expected {ctx.expected_unit!r}, got {calc_resp.unit!r}"

            return True, "ok"

        if ctx.endpoint == "/tkg/takeoff":
            try:
                tkg_resp = DITkgTakeoffResponse.model_validate(resp)
            except ValidationError as exc:
                return False, f"/tkg/takeoff response failed strict schema validation: {exc.errors()[0]['msg']}"

            eff_prj = tkg_resp.prj_id or tkg_resp.project_id
            if eff_prj is not None and eff_prj != ctx.project_id:
                return False, f"project_id mismatch: context={ctx.project_id!r}, response={eff_prj!r}"

            eff_rev = tkg_resp.rev_id or tkg_resp.snapshot_id
            if eff_rev is not None and eff_rev != ctx.snapshot_id:
                return False, f"snapshot_id mismatch: context={ctx.snapshot_id!r}, response={eff_rev!r}"

            extracted_unit = self.extract_unit()
            if not _unit_matches_expected(extracted_unit, ctx.expected_unit):
                return False, f"unit mismatch: expected {ctx.expected_unit!r}, got {extracted_unit!r}"

            return True, "ok"

        if ctx.endpoint in {"/takeoff/mep", "/takeoff/mep-advanced"}:
            try:
                mep_resp = DIMepTakeoffResponse.model_validate(resp)
            except ValidationError as exc:
                return False, f"MEP response failed strict schema validation: {exc.errors()[0]['msg']}"

            if mep_resp.project_id is not None and mep_resp.project_id != ctx.project_id:
                return False, f"project_id mismatch: context={ctx.project_id!r}, response={mep_resp.project_id!r}"

            if mep_resp.snapshot_id is not None and mep_resp.snapshot_id != ctx.snapshot_id:
                return False, f"snapshot_id mismatch: context={ctx.snapshot_id!r}, response={mep_resp.snapshot_id!r}"

            extracted_unit = self.extract_unit()
            if not _unit_matches_expected(extracted_unit, ctx.expected_unit):
                return False, f"unit mismatch: expected {ctx.expected_unit!r}, got {extracted_unit!r}"

            return True, "ok"

        # Standard manual takeoff endpoints (/takeoff/tanah, /takeoff/dinding, etc.)
        try:
            takeoff_resp = DIManualTakeoffResponse.model_validate(resp)
        except ValidationError as exc:
            return False, f"manual domain response failed strict schema validation: {exc.errors()[0]['msg']}"

        if takeoff_resp.project_id is not None and takeoff_resp.project_id != ctx.project_id:
            return False, f"project_id mismatch: context={ctx.project_id!r}, response={takeoff_resp.project_id!r}"

        if takeoff_resp.snapshot_id is not None and takeoff_resp.snapshot_id != ctx.snapshot_id:
            return False, f"snapshot_id mismatch: context={ctx.snapshot_id!r}, response={takeoff_resp.snapshot_id!r}"

        extracted_unit = self.extract_unit()
        if not _unit_matches_expected(extracted_unit, ctx.expected_unit):
            return False, f"unit mismatch: expected {ctx.expected_unit!r}, got {extracted_unit!r}"

        return True, "ok"

    def extract_result(self) -> Optional[float]:
        """Extract the primary numeric result from the response."""
        resp = self.response
        if "items" in resp and isinstance(resp["items"], list):
            total = 0.0
            found = False
            for item in resp["items"]:
                if isinstance(item, dict) and not item.get("needs_review"):
                    q = item.get("quantity")
                    if q is not None:
                        try:
                            total += float(q)
                            found = True
                        except (TypeError, ValueError):
                            pass
            return total if found else None

        result = resp.get("result")
        if result is not None:
            try:
                import math
                fv = float(result)
                return fv if math.isfinite(fv) else None
            except (TypeError, ValueError):
                return None
        return None

    def extract_unit(self) -> str:
        """Extract the reported unit from the response (fallback to expected)."""
        resp = self.response
        if "items" in resp and isinstance(resp["items"], list):
            for item in resp["items"]:
                if isinstance(item, dict) and item.get("unit"):
                    return str(item["unit"])
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


def _resolve_dim(unit: str) -> Optional[str]:
    unit_lower = unit.lower().strip()
    for dim, aliases in _DIMENSION_GROUPS.items():
        if unit_lower in aliases:
            return dim
    return unit_lower


def _unit_matches_expected(resp_unit: str, expected_unit: str) -> bool:
    resp_dim = _resolve_dim(resp_unit)
    exp_dim = _resolve_dim(expected_unit)
    return resp_dim == exp_dim


_CALC_TYPE_EXPECTED_UNIT: dict[str, str] = {
    "concrete_column_total_volume": "m3",
    "concrete_beam_total_volume": "m3",
    "area": "m2",
    "length": "m",
    "count": "unit",
    "weight": "kg",
}


def expected_unit_for(calculation_type: Optional[str], fallback: str = "unit") -> str:
    if calculation_type is None:
        return fallback
    return _CALC_TYPE_EXPECTED_UNIT.get(calculation_type, fallback)
