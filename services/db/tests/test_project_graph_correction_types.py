import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
from paax_db.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "service-account"}


@pytest.mark.asyncio
async def test_correction_api_rejects_unknown_type_before_snapshot_write():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/projects/project-1/project-graph/corrections", json={
            "id": "corr-1", "snapshot_id": "snapshot-1", "target_type": "node", "target_id": "node-1",
            "correction_type": "override", "proposed_value": {}, "rationale": "reviewed evidence",
        }, headers=HEADERS)
    assert response.status_code == 400
