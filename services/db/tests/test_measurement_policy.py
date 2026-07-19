from decimal import Decimal

import pytest
from sqlalchemy import select

from paax_db import models
from paax_db.measurement_policy import MeasurementEligibilityError, require_measurement_eligibility
from paax_db.measurement_repository import supersede_measurement_fact
from paax_db.schemas import QuantityAssumptionCreate


def test_contextual_reference_cannot_create_count_and_missing_dimension_blocks_length():
    with pytest.raises(MeasurementEligibilityError, match="contextual"):
        require_measurement_eligibility(
            measurement_type="count", source_method="verified_instances", element_kind="contextual_reference",
            verification_status="confirmed", is_contextual_reference=True,
        )
    with pytest.raises(MeasurementEligibilityError, match="length/area"):
        require_measurement_eligibility(
            measurement_type="length", source_method="written_dimension", element_kind="physical_element",
            verification_status="confirmed", valid_unit=False, binding_valid=False,
        )


def test_volume_requires_engine_result_and_assumption_starts_unapproved():
    with pytest.raises(MeasurementEligibilityError, match="Core Engine"):
        require_measurement_eligibility(
            measurement_type="volume_input", source_method="written_dimension", element_kind="physical_element",
            verification_status="confirmed",
        )
    assumption = QuantityAssumptionCreate(
        id="A-1", project_id="P-1", value="400", unit="mm", scope={"element_type_id": "K1"},
        rationale="Verified drawing dimension", owner="estimator", explicit_human_source=True,
    )
    assert assumption.approval_status == "pending_approval"
    with pytest.raises(ValueError, match="evidence or explicit"):
        QuantityAssumptionCreate(
            id="A-2", project_id="P-1", value="400", unit="mm", scope={}, rationale="x", owner="estimator",
        )


@pytest.mark.asyncio
async def test_measurement_supersession_preserves_old_fact_and_audit():
    from .conftest import TestSession
    async with TestSession() as session:
        session.add(models.Project(id="P-SUP", owner_id="OWNER", name="Supersession"))
        session.add(models.ProjectGraphSnapshot(snapshot_id="S-SUP", project_id="P-SUP", schema_version="v1", source_manifest_hash="x", generation_metadata={}, effective_sheet_revision_ids=[]))
        session.add(models.MeasurementFact(measurement_id="M-OLD", project_id="P-SUP", snapshot_id="S-SUP", measurement_type="length", value=Decimal("400"), unit="mm", source_method="written_dimension", element_ids=[], evidence_refs=["EV-1"], formula_inputs=[], verification_status="human_verified", audit_metadata={}))
        await session.commit()
        replacement = models.MeasurementFact(measurement_id="M-NEW", project_id="P-SUP", snapshot_id="S-SUP", measurement_type="length", value=Decimal("450"), unit="mm", source_method="written_dimension", element_ids=[], evidence_refs=["EV-2"], formula_inputs=[], verification_status="human_verified", audit_metadata={})
        await supersede_measurement_fact(session, old_measurement_id="M-OLD", replacement=replacement, actor="OWNER")
        await session.commit()
        old = await session.get(models.MeasurementFact, "M-OLD")
        new = await session.get(models.MeasurementFact, "M-NEW")
        audits = (await session.execute(select(models.MeasurementFactAudit))).scalars().all()
        assert old.verification_status == "superseded"
        assert new.supersedes_measurement_id == "M-OLD"
        assert {audit.action for audit in audits} == {"superseded", "supersedes"}
