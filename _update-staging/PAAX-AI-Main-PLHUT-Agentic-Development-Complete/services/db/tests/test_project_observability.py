from fastapi.testclient import TestClient
from paax_db.main import app

client = TestClient(app)

def test_project_observability_is_member_scoped_and_aggregates():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "owner-a"}
    assert client.post("/projects", headers=headers, json={"id":"P-OBS","owner_id":"owner-a","name":"Obs"}).status_code == 200
    for success, tokens in ((True, 4), (False, 6)):
        assert client.post("/usage/log", headers=headers, json={"tenant_id":"owner-a","project_id":"P-OBS","service":"db","operation":"x","success":success,"tokens_in":tokens,"tokens_out":1,"cost_microunits":2}).status_code == 200
    response = client.get("/projects/P-OBS/observability", headers=headers)
    assert response.status_code == 200 and response.json()["buckets"][0]["event_count"] == 2
    assert response.json()["buckets"][0]["error_count"] == 1
    denied = client.get("/projects/P-OBS/observability", headers={"X-Internal-Key":"test-internal-key","X-User-Id":"other"})
    assert denied.status_code == 403
