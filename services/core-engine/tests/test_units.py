from decimal import Decimal

import pytest

from app.units import convert, scale_aware_distance
from paax_schemas.measurement import Area, Length, MeasurementFact, Volume


def test_dimensions_are_typed_inputs_and_convert_without_calculating_final_volume():
    width = convert(Length(value="400", unit="mm"), "m")
    depth = convert(Length(value="400", unit="mm"), "m")
    height = convert(Length(value="3500", unit="mm"), "m")

    assert (width.value, depth.value, height.value) == (
        Decimal("0.4"), Decimal("0.4"), Decimal("3.5"),
    )
    # The Core Engine calculation endpoint (Fase 14) will derive this result;
    # Fase 13 only preserves the dimensional input and its unit provenance.
    assert Volume(value="0.56", unit="m3").value == Decimal("0.56")


def test_conversion_rejects_incompatible_dimension_and_invalid_scale_evidence():
    with pytest.raises(ValueError, match="incompatible"):
        convert(Length(value="400", unit="mm"), "m2")

    with pytest.raises(ValueError, match="scale-aware"):
        scale_aware_distance(
            Length(value="10", unit="mm"),
            scale_denominator=100,
            scale_evidence_ref=None,
            scale_verified=False,
        )


def test_measurement_fact_rejects_incompatible_unit_at_public_boundary():
    with pytest.raises(ValueError, match="Input should be"):
        MeasurementFact(
            measurement_id="M-1", project_id="P-1", snapshot_id="S-1",
            measurement_type="length", value="400", unit="m2",
            source_method="written_dimension",
        )

    assert Area(value="160000", unit="mm2").unit == "mm2"
