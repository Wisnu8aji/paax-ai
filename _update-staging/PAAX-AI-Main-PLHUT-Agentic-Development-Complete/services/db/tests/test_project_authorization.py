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


@pytest.mark.asyncio
async def test_authorize_actor_endpoint_lets_a_trusted_service_check_a_real_users_membership():
    """document-intelligence's dem_routes.py calls this on behalf of the real
    end-user, using its own trusted service identity (X-Internal-Key + the
    dem:authorize-actor scope) -- the actor being checked (member-a) is a
    different identity entirely from the calling service."""
    from .conftest import TestSession

    service = {"X-Internal-Key": "test-internal-key", "X-User-Id": "dem-job-orchestrator"}
    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-AUTH", owner_id="OWNER-AUTH", name="Auth"))
        session.add(models.ProjectMember(project_id="PROJECT-AUTH", user_id="member-a", role="estimator"))
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        authorized = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "member-a", "project_id": "PROJECT-AUTH"},
            headers=service,
        )
        assert authorized.status_code == 200
        assert authorized.json()["authorized"] is True

        denied = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "not-a-member", "project_id": "PROJECT-AUTH"},
            headers=service,
        )
        assert denied.status_code == 403


@pytest.mark.asyncio
async def test_authorize_actor_endpoint_rejects_a_non_service_caller():
    """A Firebase end-user JWT (empty internal_scopes) must not be able to
    ask this endpoint to authorize on behalf of a *different* actor -- only
    a trusted internal service (which already proved it is a known caller
    via X-Internal-Key) may pose this question."""
    import os

    os.environ["TESTING"] = "1"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "someone-else", "project_id": "PROJECT-AUTH"},
            headers={"Authorization": "Bearer test-token-OWNER-AUTH"},
        )
    assert response.status_code == 403
