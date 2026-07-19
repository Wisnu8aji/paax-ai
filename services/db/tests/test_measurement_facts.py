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
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="SNAP-MEASURE", project_id="PROJECT-MEASURE", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[],
        ))
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
