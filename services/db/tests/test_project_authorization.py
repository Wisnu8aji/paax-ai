import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.main import app


@pytest.mark.asyncio
async def test_cross_project_retrieval_is_denied_even_to_internal_service_impersonation():
    headers_a = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    headers_b = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-B"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "A"}, headers=headers_a)).status_code == 200
        assert (await client.post("/projects", json={"id": "PROJECT-B", "owner_id": "ignored", "name": "B"}, headers=headers_b)).status_code == 200
        denied = await client.post("/projects/PROJECT-B/project-graph/retrieve", json={"query": "x"}, headers=headers_a)
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_invalid_internal_identity_is_denied():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/projects/A", headers={"X-Internal-Key": "wrong"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_unscoped_internal_identity_cannot_bypass_project_membership():
    owner = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "A"}, headers=owner)).status_code == 200
        response = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "x"}, headers={"X-Internal-Key": "test-internal-key"})
    assert response.status_code == 403
