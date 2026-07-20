from decimal import Decimal

import pytest
from sqlalchemy import select

from paax_db import models
from paax_db.schemas import MeasurementFactCreate


@pytest.mark.asyncio
async def test_measurement_fact_persists_typed_input_with_audit_and_provenance():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-MEASURE", owner_id="OWNER", name="Measurement project"))
        await session.flush()
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="SNAP-MEASURE", project_id="PROJECT-MEASURE", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[],
        ))
        await session.flush()
        session.add(models.MeasurementFact(
            measurement_id="M-COLUMN-W", project_id="PROJECT-MEASURE", snapshot_id="SNAP-MEASURE",
            measurement_type="length", value=Decimal("400"), unit="mm", source_method="written_dimension",
            element_ids=["COLUMN-K1"], evidence_refs=["EV-DIM-400"], formula_inputs=["width"],
            verification_status="human_verified", created_by="USER-1", audit_metadata={"source_revision": "REV-1"},
        ))
        await session.commit()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        assert fact.unit == "mm"
        assert fact.element_ids == ["COLUMN-K1"]
        assert fact.evidence_refs == ["EV-DIM-400"]
        assert fact.audit_metadata["source_revision"] == "REV-1"


@pytest.mark.asyncio
async def test_measurement_fact_value_and_unit_are_immutable_after_persistence():
    """A prior audit demonstrated value 1 -> 999 and unit m -> mm succeeding
    silently with no ORM guard. This proves the guard now rejects it."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-MEASURE-IMM", owner_id="OWNER", name="Immutable measurement project"))
        await session.flush()
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="SNAP-MEASURE-IMM", project_id="PROJECT-MEASURE-IMM", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[],
        ))
        await session.flush()
        session.add(models.MeasurementFact(
            measurement_id="M-IMM", project_id="PROJECT-MEASURE-IMM", snapshot_id="SNAP-MEASURE-IMM",
            measurement_type="length", value=Decimal("1"), unit="m", source_method="written_dimension",
        ))
        await session.commit()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        fact.value = Decimal("999")
        with pytest.raises(ValueError, match="immutable"):
            await session.commit()
        await session.rollback()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        fact.unit = "mm"
        with pytest.raises(ValueError, match="immutable"):
            await session.commit()
        await session.rollback()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        assert fact.value == Decimal("1")
        assert fact.unit == "m"


@pytest.mark.asyncio
async def test_measurement_fact_verification_status_and_superseded_at_remain_updatable():
    """The supersession workflow (measurement_repository.supersede_measurement_fact)
    must still be able to mark the old fact superseded."""
    from datetime import datetime, timezone

    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-MEASURE-SUP", owner_id="OWNER", name="Supersedable measurement project"))
        await session.flush()
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="SNAP-MEASURE-SUP", project_id="PROJECT-MEASURE-SUP", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[],
        ))
        await session.flush()
        session.add(models.MeasurementFact(
            measurement_id="M-SUP", project_id="PROJECT-MEASURE-SUP", snapshot_id="SNAP-MEASURE-SUP",
            measurement_type="length", value=Decimal("1"), unit="m", source_method="written_dimension",
        ))
        await session.commit()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        fact.verification_status = "superseded"
        fact.superseded_at = datetime.now(timezone.utc)
        await session.commit()

        fact = (await session.execute(select(models.MeasurementFact))).scalar_one()
        assert fact.verification_status == "superseded"
        assert fact.superseded_at is not None


def test_measurement_fact_boundary_rejects_incompatible_units_and_fractional_counts():
    with pytest.raises(ValueError, match="measurement_type and unit"):
        MeasurementFactCreate(
            measurement_id="M-1", project_id="P-1", snapshot_id="S-1", measurement_type="length",
            value="400", unit="m2", source_method="written_dimension",
        )

    with pytest.raises(ValueError, match="whole number"):
        MeasurementFactCreate(
            measurement_id="M-2", project_id="P-1", snapshot_id="S-1", measurement_type="count",
            value="1.5", unit="unit", source_method="verified_instances",
        )
