"""Canonical, persisted boundary for deterministic calculation receipts.

This module has no HTTP concerns. Callers may supply only identity, approved
mapping/fact identifiers, and an idempotency key; all calculation inputs are
loaded and serialized by this boundary.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import uuid
from typing import Any, Protocol

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from . import models


class ReceiptValidationError(ValueError):
    """A requested receipt cannot be formed from approved human input."""


class DeterministicCalculationClient(Protocol):
    def calculate(self, request: dict[str, Any]) -> dict[str, Any]: ...


_UNIT_BY_FACT_TYPE = {
    "count": {"unit"},
    "length": {"mm", "cm", "m", "inch"},
    "area": {"mm2", "cm2", "m2", "inch2"},
    "volume_input": {"mm3", "cm3", "m3", "inch3"},
    "mass_input": {"g", "kg", "tonne"},
}
_REQUIRED_FACT_TYPES = {
    "length": {"length"},
    "area": {"area"},
    "count": {"count"},
    "concrete_column_volume": {"length", "volume_input"},
}
_RESULT_UNITS_BY_CALCULATION = {
    "length": _UNIT_BY_FACT_TYPE["length"],
    "area": _UNIT_BY_FACT_TYPE["area"],
    "count": _UNIT_BY_FACT_TYPE["count"],
    "concrete_column_volume": _UNIT_BY_FACT_TYPE["volume_input"],
}
_ENGINE_STATUSES = {"complete", "blocked", "needs_input"}


def _json_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _input_hash(request: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(request).encode("utf-8")).hexdigest()


def _fact_payload(fact: models.MeasurementFact) -> dict[str, Any]:
    return {
        "measurement_id": fact.measurement_id,
        "supersedes_measurement_id": fact.supersedes_measurement_id,
        "created_at": _json_datetime(fact.created_at),
        "verification_status": fact.verification_status,
        "superseded_at": _json_datetime(fact.superseded_at),
        "measurement_type": fact.measurement_type,
        "value": str(fact.value),
        "unit": fact.unit,
        "source_method": fact.source_method,
        "element_ids": list(fact.element_ids or []),
        "evidence_refs": list(fact.evidence_refs or []),
        "formula_inputs": list(fact.formula_inputs or []),
    }


def _validate_fact(mapping: models.RabMaterializationMapping, fact: models.MeasurementFact) -> None:
    if fact.verification_status != "human_verified" or fact.superseded_at is not None:
        raise ReceiptValidationError("receipt requires active human-verified Measurement Facts")
    if not fact.evidence_refs:
        raise ReceiptValidationError("receipt requires evidence for every Measurement Fact")
    if fact.measurement_type not in _UNIT_BY_FACT_TYPE or fact.unit not in _UNIT_BY_FACT_TYPE[fact.measurement_type]:
        raise ReceiptValidationError("Measurement Fact unit is incompatible with its measurement type")
    allowed_types = _REQUIRED_FACT_TYPES.get(mapping.calculation_type)
    if allowed_types is None or fact.measurement_type not in allowed_types:
        raise ReceiptValidationError("Measurement Fact type is incompatible with calculation type")


async def _approved_mapping_and_facts(
    session: AsyncSession, *, project_id: str, mapping_id: str, measurement_fact_ids: list[str],
) -> tuple[models.RabMaterializationMapping, list[models.MeasurementFact], models.RabMaterializationMappingAudit]:
    if not measurement_fact_ids or len(set(measurement_fact_ids)) != len(measurement_fact_ids):
        raise ReceiptValidationError("measurement_fact_ids must be a non-empty unique ordered list")
    mapping = (await session.execute(select(models.RabMaterializationMapping).where(
        models.RabMaterializationMapping.id == mapping_id,
        models.RabMaterializationMapping.project_id == project_id,
    ))).scalar_one_or_none()
    if mapping is None or mapping.approval_status != "approved":
        raise ReceiptValidationError("receipt requires a human-approved RAB materialization mapping")
    if not mapping.evidence_refs:
        raise ReceiptValidationError("receipt requires evidence for the approved mapping")
    if list(mapping.measurement_fact_ids or []) != measurement_fact_ids:
        raise ReceiptValidationError("caller fact IDs must exactly match the approved mapping")
    facts = (await session.execute(select(models.MeasurementFact).where(
        models.MeasurementFact.project_id == project_id,
        models.MeasurementFact.snapshot_id == mapping.snapshot_id,
        models.MeasurementFact.measurement_id.in_(measurement_fact_ids),
    ))).scalars().all()
    facts_by_id = {fact.measurement_id: fact for fact in facts}
    if set(facts_by_id) != set(measurement_fact_ids):
        raise ReceiptValidationError("Measurement Facts must belong to the mapping project snapshot")
    ordered_facts = [facts_by_id[fact_id] for fact_id in measurement_fact_ids]
    for fact in ordered_facts:
        _validate_fact(mapping, fact)
    approval = (await session.execute(select(models.RabMaterializationMappingAudit).where(
        models.RabMaterializationMappingAudit.mapping_id == mapping.id,
        models.RabMaterializationMappingAudit.action == "approved",
        models.RabMaterializationMappingAudit.revision_after == mapping.revision,
    ).order_by(models.RabMaterializationMappingAudit.created_at.desc(), models.RabMaterializationMappingAudit.id.desc()))).scalars().first()
    if approval is None:
        raise ReceiptValidationError("approved mapping requires its exact human approval audit event")
    return mapping, ordered_facts, approval


def _canonical_request(
    *, project_id: str, mapping: models.RabMaterializationMapping, facts: list[models.MeasurementFact],
    approval: models.RabMaterializationMappingAudit,
) -> dict[str, Any]:
    fact_payloads = [_fact_payload(fact) for fact in facts]
    return {
        "project_id": project_id,
        "snapshot_id": mapping.snapshot_id,
        "mapping": {
            "id": mapping.id,
            "revision": mapping.revision,
            "work_item_node_id": mapping.work_item_node_id,
            "calculation_type": mapping.calculation_type,
            "evidence_refs": list(mapping.evidence_refs or []),
            "human_approval_event_id": approval.id,
            "approved_by": approval.actor,
        },
        "measurement_fact_ids": [fact.measurement_id for fact in facts],
        "facts": fact_payloads,
    }


def verify_calculation_receipt(receipt: models.CalculationReceipt) -> bool:
    """Recompute the stored canonical request hash without invoking the engine."""
    return bool(receipt.canonical_request) and receipt.input_hash == _input_hash(receipt.canonical_request)


async def calculate_receipt(
    session: AsyncSession, *, project_id: str, mapping_id: str, measurement_fact_ids: list[str],
    idempotency_key: str, requested_by_service: str, requested_by_actor: str | None,
    core_engine_client: DeterministicCalculationClient,
) -> models.CalculationReceipt:
    """Calculate through the injected engine and persist one immutable receipt.

    The caller owns the surrounding transaction.  A retry with the same key or
    a matching complete canonical input returns the original receipt without an
    engine call.
    """
    existing = (await session.execute(select(models.CalculationReceipt).where(
        models.CalculationReceipt.project_id == project_id,
        models.CalculationReceipt.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if existing is not None:
        return existing
    mapping, facts, approval = await _approved_mapping_and_facts(
        session, project_id=project_id, mapping_id=mapping_id, measurement_fact_ids=measurement_fact_ids,
    )
    request = _canonical_request(project_id=project_id, mapping=mapping, facts=facts, approval=approval)
    input_hash = _input_hash(request)
    equivalent = (await session.execute(select(models.CalculationReceipt).where(
        models.CalculationReceipt.project_id == project_id,
        models.CalculationReceipt.mapping_id == mapping.id,
        models.CalculationReceipt.mapping_revision == mapping.revision,
        models.CalculationReceipt.input_hash == input_hash,
        models.CalculationReceipt.status == "complete",
    ))).scalar_one_or_none()
    if equivalent is not None:
        return equivalent
    response = core_engine_client.calculate(request)
    status = response.get("status")
    if status not in _ENGINE_STATUSES:
        raise ReceiptValidationError("Core Engine returned an unsupported calculation status")
    result: Decimal | None = None
    unit: str | None = None
    if status == "complete":
        if response.get("result") is None or not response.get("unit"):
            raise ReceiptValidationError("complete Core Engine response requires result and unit")
        try:
            result = Decimal(str(response["result"]))
        except (InvalidOperation, ValueError) as exc:
            raise ReceiptValidationError("Core Engine result must be decimal-compatible") from exc
        if not result.is_finite() or result < 0:
            raise ReceiptValidationError("Core Engine result must be a finite non-negative decimal")
        unit = str(response["unit"])
        if unit not in _RESULT_UNITS_BY_CALCULATION[mapping.calculation_type]:
            raise ReceiptValidationError("Core Engine result unit is incompatible with calculation type")
    elif response.get("result") is not None:
        raise ReceiptValidationError("blocked and needs_input responses cannot contain an authoritative result")
    prior = (await session.execute(select(models.CalculationReceipt).where(
        models.CalculationReceipt.project_id == project_id,
        models.CalculationReceipt.mapping_id == mapping.id,
        models.CalculationReceipt.status.in_(("complete", "blocked", "needs_input")),
    ).order_by(models.CalculationReceipt.created_at.desc()))).scalars().first()
    receipt = models.CalculationReceipt(
        receipt_id=str(uuid.uuid4()), project_id=project_id, snapshot_id=mapping.snapshot_id,
        mapping_id=mapping.id, mapping_revision=mapping.revision, work_item_node_id=mapping.work_item_node_id,
        measurement_fact_ids=list(measurement_fact_ids),
        fact_lineage=[{
            "measurement_id": fact.measurement_id,
            "supersedes_measurement_id": fact.supersedes_measurement_id,
            "created_at": _json_datetime(fact.created_at),
            "verification_status": fact.verification_status,
            "superseded_at": _json_datetime(fact.superseded_at),
            "measurement_type": fact.measurement_type,
            "value": str(fact.value),
            "unit": fact.unit,
            "evidence_refs": list(fact.evidence_refs or []),
            "formula_inputs": list(fact.formula_inputs or []),
        } for fact in facts],
        calculation_type=mapping.calculation_type, rule_id=response.get("rule_id") or response.get("formula"),
        engine_version=response.get("engine_version"), canonical_request=request, input_hash=input_hash,
        engine_calculation_id=response.get("calculation_id"), status=status, result=result, unit=unit,
        formula_id=response.get("formula_id") or response.get("formula"),
        substituted_formula=response.get("substituted_formula"), evidence_refs=list(mapping.evidence_refs or []),
        human_approval_event_id=approval.id, approved_by=approval.actor,
        requested_by_service=requested_by_service, requested_by_actor=requested_by_actor,
        idempotency_key=idempotency_key, parent_receipt_id=prior.receipt_id if prior else None,
    )
    session.add(receipt)
    await session.flush()
    session.add(models.CalculationReceiptAudit(
        receipt_id=receipt.receipt_id, action="created", actor=requested_by_actor,
        metadata_json={"input_hash": input_hash, "engine_calculation_id": receipt.engine_calculation_id},
    ))
    if prior is not None:
        now = datetime.now(timezone.utc)
        await session.execute(update(models.CalculationReceipt).where(
            models.CalculationReceipt.receipt_id == prior.receipt_id,
        ).values(status="superseded", superseded_at=now))
        session.add(models.CalculationReceiptAudit(
            receipt_id=prior.receipt_id, action="superseded", actor=requested_by_actor,
            metadata_json={"superseded_by_receipt_id": receipt.receipt_id},
        ))
    return receipt


async def advance_mapping_revision(
    session: AsyncSession, *, mapping: models.RabMaterializationMapping, action: str,
    actor: str, metadata: dict[str, Any] | None = None,
) -> models.RabMaterializationMappingAudit:
    """Shared mutation primitive for later human mapping routes.

    Stage 2A intentionally does not wire routes, but any accepted mapping edit
    or human decision must use this function to leave an exact revision audit.
    """
    before = mapping.revision
    mapping.revision = before + 1
    audit = models.RabMaterializationMappingAudit(
        mapping_id=mapping.id, action=action, actor=actor, revision_before=before,
        revision_after=mapping.revision, metadata_json=metadata or {},
    )
    session.add(audit)
    return audit
