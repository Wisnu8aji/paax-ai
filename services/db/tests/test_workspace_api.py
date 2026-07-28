import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.main import app

async def _setup_projects():
    from .conftest import TestSession
    async with TestSession() as session:
        session.add(models.Project(id="prj-1", owner_id="local-desktop-user", name="P1", status="active"))
        session.add(models.Project(id="prj-2", owner_id="other-user", name="P2", status="active"))
        session.add(models.ProjectMember(project_id="prj-1", user_id="local-desktop-user", role="owner"))
        session.add(models.ProjectMember(project_id="prj-2", user_id="other-user", role="owner"))
        await session.commit()

@pytest.mark.asyncio
async def test_actor_head_lifecycle():
    await _setup_projects()
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "local-desktop-user"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/workspace/head", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["actor_id"] == "local-desktop-user"
        assert data["active_project_id"] is None
        
        resp = await client.patch("/workspace/head", json={
            "active_project_id": "prj-1",
            "active_module": "drawing",
            "active_tab": "sheet-list"
        }, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_project_id"] == "prj-1"
        assert data["active_module"] == "drawing"
        assert data["revision"] > 0
        
        resp = await client.get("/workspace/head", headers=headers)
        assert resp.json()["active_module"] == "drawing"

@pytest.mark.asyncio
async def test_project_session_lifecycle():
    await _setup_projects()
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "local-desktop-user"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/workspace/project/missing/session", headers=headers)
        assert resp.status_code == 404
        
        resp = await client.get("/workspace/project/prj-1/session", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_document_id"] is None
        assert data["preferences"] == {}
        
        resp = await client.patch("/workspace/project/prj-1/session", json={
            "active_document_id": "doc-a",
            "selected_sheet_ids": ["s1", "s2"],
            "preferences": {"theme": "dark"}
        }, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_document_id"] == "doc-a"
        assert data["selected_sheet_ids"] == ["s1", "s2"]
        assert data["preferences"]["theme"] == "dark"
        assert data["revision"] > 0
