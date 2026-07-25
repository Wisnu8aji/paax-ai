from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, headers={"X-Internal-Key": "test-internal-key"})


def _fact(identifier, value, field):
    return {"measurement_id": identifier, "project_id": "P-1", "snapshot_id": "S-1", "measurement_type": "length", "value": value, "unit": "mm", "source_method": "written_dimension", "formula_inputs": [field], "verification_status": "human_verified"}


def test_typed_volume_contract_has_manual_anchor_and_provenance():
    payload = {"project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["W", "D", "H"], "calculation_type": "concrete_column_volume", "inputs": [_fact("W", 400, "width"), _fact("D", 400, "depth"), _fact("H", 3500, "height")], "requested_by": "OWNER"}
    response = client.post("/calculations", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete" and body["result"] == 0.56 and body["unit"] == "m3"
    assert len(body["input_sources"]) == 3


def test_unapproved_or_missing_dimension_is_rejected_or_needs_input():
    payload = {"project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["W"], "calculation_type": "concrete_column_volume", "inputs": [_fact("W", 400, "width")], "requested_by": "OWNER"}
    assert client.post("/calculations", json=payload).json()["status"] == "needs_input"
    payload["inputs"][0]["verification_status"] = "candidate"
    assert client.post("/calculations", json=payload).status_code == 422


def _typed_fact(identifier, measurement_type, value, unit, formula_input):
    return {
        "measurement_id": identifier, "project_id": "P-1", "snapshot_id": "S-1",
        "measurement_type": measurement_type, "value": value, "unit": unit,
        "source_method": "written_dimension", "formula_inputs": [formula_input],
        "verification_status": "human_verified",
    }


def test_length_sums_multiple_wall_segments_with_manual_anchor():
    # Manual anchor: 2500mm + 3000mm + 1500mm = 2.5 + 3.0 + 1.5 = 7.0 m
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["L1", "L2", "L3"],
        "calculation_type": "length",
        "inputs": [
            _typed_fact("L1", "length", 2500, "mm", "length"),
            _typed_fact("L2", "length", 3000, "mm", "length"),
            _typed_fact("L3", "length", 1500, "mm", "length"),
        ],
        "requested_by": "OWNER",
    }
    response = client.post("/calculations", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["result"] == 7.0
    assert body["unit"] == "m"
    assert len(body["input_sources"]) == 3


def test_area_sums_multiple_room_slabs_with_manual_anchor():
    # Manual anchor: 12.5 m2 + 8.3 m2 = 20.8 m2
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["A1", "A2"],
        "calculation_type": "area",
        "inputs": [
            _typed_fact("A1", "area", "12.5", "m2", "area"),
            _typed_fact("A2", "area", "8.3", "m2", "area"),
        ],
        "requested_by": "OWNER",
    }
    response = client.post("/calculations", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["result"] == 20.8
    assert body["unit"] == "m2"


def test_count_sums_multiple_verified_instance_batches_with_manual_anchor():
    # Manual anchor: 5 + 8 + 2 = 15 unit
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["C1", "C2", "C3"],
        "calculation_type": "count",
        "inputs": [
            _typed_fact("C1", "count", 5, "unit", "count"),
            _typed_fact("C2", "count", 8, "unit", "count"),
            _typed_fact("C3", "count", 2, "unit", "count"),
        ],
        "requested_by": "OWNER",
    }
    response = client.post("/calculations", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["result"] == 15.0
    assert body["unit"] == "unit"


def test_length_needs_input_when_no_matching_typed_fact_is_present():
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["W"],
        "calculation_type": "length",
        "inputs": [_fact("W", 400, "width")],
        "requested_by": "OWNER",
    }
    body = client.post("/calculations", json=payload).json()
    assert body["status"] == "needs_input"


def test_length_operation_rejects_a_mismatched_measurement_type():
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1", "measurement_fact_ids": ["A1"],
        "calculation_type": "length",
        "inputs": [_typed_fact("A1", "area", "12.5", "m2", "length")],
        "requested_by": "OWNER",
    }
    body = client.post("/calculations", json=payload).json()
    assert body["status"] == "blocked"


def test_total_column_volume_multiplies_only_verified_count():
    payload = {
        "project_id": "P-1", "snapshot_id": "S-1",
        "measurement_fact_ids": ["W", "D", "H", "C"],
        "calculation_type": "concrete_column_total_volume",
        "inputs": [
            _typed_fact("W", "length", 250, "mm", "width"),
            _typed_fact("D", "length", 600, "mm", "depth"),
            _typed_fact("H", "length", 3900, "mm", "height"),
            _typed_fact("C", "count", 4, "unit", "count"),
        ],
        "requested_by": "OWNER",
    }
    body = client.post("/calculations", json=payload).json()
    assert body["status"] == "complete"
    assert body["result"] == 2.34
    assert body["unit"] == "m3"
    assert body["formula"] == "width × depth × height × verified_count"
