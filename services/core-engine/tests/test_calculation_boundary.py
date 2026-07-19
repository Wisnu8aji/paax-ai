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
