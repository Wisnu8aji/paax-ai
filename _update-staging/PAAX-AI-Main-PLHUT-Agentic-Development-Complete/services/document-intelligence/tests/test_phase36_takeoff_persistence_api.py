from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.api import advanced_intelligence_routes as routes
from app.drawing_intelligence.revision_intelligence import EntityLinkRepository
from app.drawing_intelligence.takeoff_workspace import TakeoffWorkspaceRepository

HEADERS = {"Authorization": "Bearer test-token-paax-web"}
HASH = "bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68"


def test_takeoff_persistence_optimistic_lock_undo_and_entity_links(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("TESTING", "1")
    routes._takeoff_repository = TakeoffWorkspaceRepository(tmp_path / "takeoff.json")
    routes._entity_link_repository = EntityLinkRepository(tmp_path / "links.json")
    client = TestClient(app)

    response = client.post("/drawings/intelligence/v2/takeoff/documents", headers=HEADERS, json={
        "project_id": "PLHUT-SURAKARTA", "source_document_hash": HASH,
        "source_filename": "PLHUT.pdf", "page_count": 88,
    })
    assert response.status_code == 200, response.text
    document = response.json()
    assert document["revision"] == 0

    measurement = {
        "measurement_id": "m1", "project_id": "PLHUT-SURAKARTA", "source_document_hash": HASH,
        "page_index": 42, "view_zone_id": "column-plan-l2", "kind": "count", "points": [],
        "count": 4, "status": "human_verified", "evidence_refs": ["page43-k2"],
    }
    response = client.post(f"/drawings/intelligence/v2/takeoff/documents/{document['takeoff_document_id']}/measurements",
                           headers=HEADERS, json={"measurement": measurement, "actor_id": "paax-web", "expected_revision": 0})
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["revision"] == 1 and saved["measurements"][0]["count"] == 4

    stale = client.post(f"/drawings/intelligence/v2/takeoff/documents/{document['takeoff_document_id']}/measurements",
                        headers=HEADERS, json={"measurement": measurement, "actor_id": "paax-web", "expected_revision": 0})
    assert stale.status_code == 409

    undone = client.post(f"/drawings/intelligence/v2/takeoff/documents/{document['takeoff_document_id']}/undo",
                         headers=HEADERS, json={"actor_id": "paax-web", "expected_revision": 1})
    assert undone.status_code == 200, undone.text
    assert undone.json()["measurements"] == []

    link = {
        "link_id": "link-1", "project_id": "PLHUT-SURAKARTA", "source_entity_type": "measurement",
        "source_entity_id": "m1", "target_entity_type": "rfi", "target_entity_id": "RFI-001",
        "source_revision_id": "rev-a",
    }
    first = client.post("/drawings/intelligence/v2/entity-links", headers=HEADERS, json=link)
    second = client.post("/drawings/intelligence/v2/entity-links", headers=HEADERS, json={**link, "link_id": "different-id"})
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["link_id"] == second.json()["link_id"] == "link-1"
    listed = client.get("/drawings/intelligence/v2/entity-links", headers=HEADERS,
                        params={"project_id": "PLHUT-SURAKARTA", "source_entity_id": "m1"})
    assert listed.status_code == 200 and len(listed.json()) == 1
