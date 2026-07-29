from __future__ import annotations

import pytest
from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady,
    DispatchReceipt,
    EngineDispatch,
    build_engine_dispatch,
    calculation_from_response,
)
from app.drawing_intelligence.models import (
    ElementMeasurementFact,
    WorkItemCandidate,
)


def _make_candidate(
    work_item_id: str,
    category: str,
    facts: list[ElementMeasurementFact] | None = None,
    conflict_ids: list[str] | None = None,
    attributes: dict | None = None,
) -> WorkItemCandidate:
    return WorkItemCandidate(
        work_item_id=work_item_id,
        category=category,
        code="K1",
        label=f"{category.title()} Test",
        page_indices=[0],
        maturity="observed",
        calculation_readiness="ready",
        evidence_refs=["ev-1"],
        measurement_facts=facts or [],
        conflict_ids=conflict_ids or [],
        attributes=attributes or {},
    )


def test_build_engine_dispatch_column_tkg():
    facts = [
        ElementMeasurementFact(
            measurement_id="m-panjang",
            work_item_id="item-col-01",
            field="length",
            value=0.5,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-1"],
        ),
        ElementMeasurementFact(
            measurement_id="m-lebar",
            work_item_id="item-col-01",
            field="width",
            value=0.5,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-1"],
        ),
        ElementMeasurementFact(
            measurement_id="m-tinggi",
            work_item_id="item-col-01",
            field="height",
            value=4.0,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-1"],
        ),
    ]
    item = _make_candidate("item-col-01", "beton", facts=facts)

    dispatch = build_engine_dispatch(
        item,
        project_id="proj-101",
        snapshot_id="snap-1",
        requested_by="test-user",
    )

    # 1. Route & payload validation
    assert dispatch.endpoint == "/tkg/takeoff"
    assert "project_id" in dispatch.payload
    assert "measurement_fact_ids" in dispatch.payload

    # 2. Assert NO formula or coefficient in dispatch payload
    payload_str = str(dispatch.payload)
    assert "formula" not in dispatch.payload
    assert "coefficient" not in dispatch.payload
    assert "0.5 * 0.5 * 4.0" not in payload_str


def test_build_engine_dispatch_tanah():
    facts = [
        ElementMeasurementFact(
            measurement_id="m-panjang-tanah",
            work_item_id="item-tanah-01",
            field="length",
            value=2.0,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-tanah"],
        ),
        ElementMeasurementFact(
            measurement_id="m-lebar-tanah",
            work_item_id="item-tanah-01",
            field="width",
            value=2.0,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-tanah"],
        ),
        ElementMeasurementFact(
            measurement_id="m-dalam-tanah",
            work_item_id="item-tanah-01",
            field="depth",
            value=1.5,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-tanah"],
        ),
    ]
    attributes = {
        # engine_contract is required for anti-bypass validation (09C correction)
        "engine_contract": "takeoff.tanah",
        "core_engine_payload": {
            "footplats": [
                {"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}
            ]
        },
    }
    item = _make_candidate("item-tanah-01", "tanah", facts=facts, attributes=attributes)

    dispatch = build_engine_dispatch(
        item,
        project_id="proj-101",
        snapshot_id="snap-1",
        requested_by="test-user",
    )

    assert dispatch.endpoint == "/takeoff/tanah"
    assert "footplats" in dispatch.payload


def test_build_engine_dispatch_rejects_missing_fields_and_open_conflicts():
    # Missing required fields
    facts = [
        ElementMeasurementFact(
            measurement_id="m-panjang-only",
            work_item_id="item-col-incomplete",
            field="length",
            value=1.0,
            unit="m",
            source_method="written_dimension",
            verification_status="human_verified",
            evidence_refs=["ev-1"],
        )
    ]
    item_missing = _make_candidate("item-col-incomplete", "beton", facts=facts)

    with pytest.raises(CalculationNotReady) as exc_info:
        build_engine_dispatch(
            item_missing, project_id="proj-101", snapshot_id="snap-1", requested_by="user"
        )
    assert "missing approved measurement facts" in str(exc_info.value)

    # Open drawing conflict
    item_conflict = _make_candidate(
        "item-col-conflict", "beton", facts=facts, conflict_ids=["conflict-001"]
    )
    with pytest.raises(CalculationNotReady) as exc_info:
        build_engine_dispatch(
            item_conflict, project_id="proj-101", snapshot_id="snap-1", requested_by="user"
        )
    assert "open drawing conflicts must be resolved" in str(exc_info.value)


def test_calculation_from_response_core_engine_authority():
    facts = [
        ElementMeasurementFact(
            measurement_id="m-1", work_item_id="item-beton-01", field="length", value=1.0, unit="m",
            source_method="written_dimension", verification_status="human_verified", evidence_refs=["ev-1"]
        ),
        ElementMeasurementFact(
            measurement_id="m-2", work_item_id="item-beton-01", field="width", value=1.0, unit="m",
            source_method="written_dimension", verification_status="human_verified", evidence_refs=["ev-1"]
        ),
        ElementMeasurementFact(
            measurement_id="m-3", work_item_id="item-beton-01", field="height", value=1.0, unit="m",
            source_method="written_dimension", verification_status="human_verified", evidence_refs=["ev-1"]
        ),
    ]
    item = _make_candidate("item-beton-01", "beton", facts=facts)
    dispatch = build_engine_dispatch(item, project_id="proj-101", snapshot_id="snap-1", requested_by="test-user")

    # Valid response from Core Engine -> source_authority='core_engine'
    valid_response = {
        "domain": "beton",
        "status": "complete",
        "items": [
            {
                "kode": "K1",
                "work": "beton_kolom",
                "quantity": 1.0,
                "unit": "m3",
                "formula": "F-B01",
                "detail": "0.5m x 0.5m x 4.0m",
                "needs_review": False,
                "rule_id": "F-B01",
            }
        ],
        "engine_version": "core-engine-v1",
    }
    receipt = DispatchReceipt.create_verified(context=dispatch.context, response=valid_response)
    calc_valid = calculation_from_response(item, valid_response, receipt=receipt)
    assert calc_valid.source_authority == "core_engine"
    assert calc_valid.status == "complete"
    assert calc_valid.result == 1.0

    # Failed/partial response -> source_authority='none'
    invalid_response = {
        "domain": "beton",
        "items": [],
        "warnings": ["Core Engine error"],
    }
    calc_invalid = calculation_from_response(item, invalid_response)
    assert calc_invalid.source_authority == "none"
    assert calc_invalid.status in ("blocked", "needs_input")
    assert calc_invalid.result is None
