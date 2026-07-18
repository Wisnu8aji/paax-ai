from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.transcription.models import DemObservations, ObservationValue
from app.transcription.typed_observations import (
    DimensionObservation,
    SymbolObservation,
    TableCellObservation,
    TableObservation,
    TypedDemObservations,
    adapt_dem_observations,
)


def test_v1_fixture_still_parses_and_adapts_to_v2():
    legacy = DemObservations(
        texts=[ObservationValue(raw="ROOM", confidence=0.9, evidence_refs=["EV-TEXT"])],
        dimensions=[ObservationValue(raw="3000", numeric_value=3000, unit="mm", confidence=0.9, evidence_refs=["EV-DIM"])],
    )

    typed = adapt_dem_observations(legacy)

    assert legacy.texts[0].raw == "ROOM"
    assert typed.schema_version == "paax.dem.observations.v2"
    assert typed.texts[0].raw == "ROOM"
    assert isinstance(typed.dimensions[0], DimensionObservation)


def test_dimension_fixture_roundtrips_v2():
    dimension = DimensionObservation(
        raw="3000",
        numeric_value=3000,
        unit="mm",
        bbox=(0.1, 0.2, 0.3, 0.25),
        dimension_line=(0.1, 0.2, 0.3, 0.2),
        extension_points=[(0.1, 0.2), (0.3, 0.2)],
        orientation="horizontal",
        object_candidates=["WALL-A"],
        scale_context="1:100",
        confidence=0.96,
        evidence_refs=["EV-DIM-1"],
    )

    restored = DimensionObservation.model_validate_json(dimension.model_dump_json())

    assert restored == dimension
    assert restored.dimension_line == (0.1, 0.2, 0.3, 0.2)


def test_table_fixture_contains_cell_geometry_and_reading_metadata():
    cell = TableCellObservation(
        raw="D-01",
        row_index=0,
        column_index=0,
        cell_bbox=(0.1, 0.1, 0.2, 0.15),
        is_header=True,
        confidence=0.9,
        evidence_refs=["EV-TABLE-CELL"],
    )
    table = TableObservation(
        raw="DOOR SCHEDULE",
        bbox=(0.1, 0.1, 0.8, 0.5),
        row_count=2,
        column_count=3,
        header_cells=[cell],
        cells=[cell],
        merged_cells=[(0, 0, 0, 1)],
        reading_order=["D-01"],
        row_to_element_mapping_candidates=["DOOR:D-01"],
        confidence=0.92,
        evidence_refs=["EV-TABLE"],
    )

    restored = TableObservation.model_validate_json(table.model_dump_json())

    assert restored.row_count == 2
    assert restored.cells[0].cell_bbox == (0.1, 0.1, 0.2, 0.15)
    assert restored.row_to_element_mapping_candidates == ["DOOR:D-01"]


def test_symbol_fixture_carries_visual_signature_and_confidence_breakdown():
    symbol = SymbolObservation(
        raw="door swing",
        bbox=(0.2, 0.2, 0.3, 0.4),
        polygon=[(0.2, 0.2), (0.3, 0.2), (0.3, 0.4)],
        visual_signature="arc-with-leaf",
        rotation=90,
        scale=1.0,
        candidate_class="door",
        legend_reference="LEG-DOOR",
        confidence_breakdown={"shape": 0.9, "legend": 0.8},
        confidence=0.88,
        evidence_refs=["EV-SYMBOL"],
    )

    assert SymbolObservation.model_validate_json(symbol.model_dump_json()) == symbol


@pytest.mark.parametrize(
    ("status", "evidence_refs", "interpretation_method", "verification_record", "valid"),
    [
        ("extracted", ["EV-1"], None, None, True),
        ("extracted", [], None, None, False),
        ("ai_interpreted", ["EV-1"], "rule-v2", None, True),
        ("ai_interpreted", ["EV-1"], None, None, False),
        ("conflicting", ["EV-1", "EV-2"], None, None, True),
        ("conflicting", ["EV-1"], None, None, False),
        ("human_verified", ["EV-1"], None, {"verifier_id": "u-1", "verified_at": "2026-07-19T00:00:00Z"}, True),
        ("human_verified", ["EV-1"], None, None, False),
        ("missing", [], None, None, True),
    ],
)
def test_evidence_requirements_are_fail_closed(
    status: str,
    evidence_refs: list[str],
    interpretation_method: str | None,
    verification_record: dict | None,
    valid: bool,
):
    payload = {
        "raw": "sample",
        "confidence": 0.5,
        "status": status,
        "evidence_refs": evidence_refs,
        "interpretation_method": interpretation_method,
        "verification_record": verification_record,
    }
    if valid:
        observation = DimensionObservation(**payload)
        assert observation.status == status
    else:
        with pytest.raises(ValidationError, match="require"):
            DimensionObservation(**payload)


def test_typed_collection_roundtrips_with_schema_version():
    observations = TypedDemObservations(
        dimensions=[DimensionObservation(raw="100", confidence=0.8, evidence_refs=["EV-1"])]
    )

    restored = TypedDemObservations.model_validate_json(observations.model_dump_json())

    assert restored.schema_version == "paax.dem.observations.v2"
    assert restored.dimensions[0].numeric_value is None

