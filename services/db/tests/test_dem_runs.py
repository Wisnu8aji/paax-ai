"""Test dem_runs/dem_pages tables -- DEM Phase 2 job orchestrator persistence."""
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from paax_db.main import app


HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-abc"}


@pytest.mark.asyncio
async def test_dem_run_create_and_get():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-1",
                "document_id": "DOC-PLHUT-001",
                "document_hash": "sha256:abc123",
                "file_name": "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
                "total_pages": 3,
                "provider": "qwen",
                "prompt_version": "dem-extraction-v1.0.0",
            },
            headers=HEADERS,
        )
        assert response.status_code == 200
        run = response.json()
        assert run["status"] == "created"
        assert run["total_pages"] == 3

        response = await ac.get(f"/dem/runs/{run['id']}", headers=HEADERS)
        assert response.status_code == 200
        assert response.json()["id"] == run["id"]


@pytest.mark.asyncio
async def test_list_project_dem_sheets():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        proj_res = await ac.post(
            "/projects",
            json={"id": "proj-1", "name": "Project 1", "owner_id": "user-abc"},
            headers=HEADERS,
        )
        assert proj_res.status_code == 200

        run_res = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-1",
                "document_id": "DOC-1",
                "document_hash": "sha256:123",
                "file_name": "first_drawing.pdf",
                "total_pages": 2,
                "provider": "qwen",
                "prompt_version": "v1",
            },
            headers=HEADERS,
        )
        assert run_res.status_code == 200
        run1 = run_res.json()

        page0_res = await ac.post(
            f"/dem/pages?run_id={run1['id']}&page_index=0",
            headers=HEADERS,
        )
        assert page0_res.status_code == 200
        page0 = page0_res.json()

        update_res = await ac.put(
            f"/dem/pages/{page0['id']}",
            json={
                "status": "complete",
                "result": {
                    "sheet_identity": {
                        "title": {"value": "Ground Floor Plan"}
                    }
                }
            },
            headers=HEADERS,
        )
        assert update_res.status_code == 200

        proj2_res = await ac.post(
            "/projects",
            json={"id": "proj-2", "name": "Project 2", "owner_id": "user-abc"},
            headers=HEADERS,
        )
        assert proj2_res.status_code == 200

        run2_res = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-2",
                "document_id": "DOC-2",
                "document_hash": "sha256:456",
                "file_name": "second_drawing.pdf",
                "total_pages": 1,
                "provider": "qwen",
                "prompt_version": "v1",
            },
            headers=HEADERS,
        )
        assert run2_res.status_code == 200
        run2 = run2_res.json()

        page_run2_res = await ac.post(
            f"/dem/pages?run_id={run2['id']}&page_index=0",
            headers=HEADERS,
        )
        assert page_run2_res.status_code == 200

        sheets_res = await ac.get(
            "/projects/proj-1/dem/sheets",
            headers=HEADERS,
        )
        assert sheets_res.status_code == 200
        sheets = sheets_res.json()
        assert len(sheets) == 1
        assert sheets[0]["run_id"] == run1["id"]
        assert sheets[0]["page_index"] == 0
        assert sheets[0]["file_name"] == "first_drawing.pdf"
        assert sheets[0]["sheet_title"] == "Ground Floor Plan"
        assert sheets[0]["thumbnail_url"] == f"/drawings/dem/{run1['id']}/pages/0/image"

        empty_proj_res = await ac.post(
            "/projects",
            json={"id": "proj-empty", "name": "Empty Project", "owner_id": "user-abc"},
            headers=HEADERS,
        )
        assert empty_proj_res.status_code == 200
        
        sheets_empty_res = await ac.get(
            "/projects/proj-empty/dem/sheets",
            headers=HEADERS,
        )
        assert sheets_empty_res.status_code == 200
        assert sheets_empty_res.json() == []


@pytest.mark.asyncio
async def test_end_user_cannot_read_or_update_dem_run_of_another_project():
    os.environ["TESTING"] = "1"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        owner_headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "owner-a"}
        proj_res = await ac.post(
            "/projects",
            json={"id": "proj-scope-a", "name": "Scope A", "owner_id": "owner-a"},
            headers=owner_headers,
        )
        assert proj_res.status_code == 200

        run_res = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-scope-a",
                "document_id": "DOC-SCOPE-A",
                "document_hash": "sha256:scope-a",
                "file_name": "scope_a.pdf",
                "total_pages": 1,
                "provider": "qwen",
                "prompt_version": "v1",
            },
            headers=owner_headers,
        )
        assert run_res.status_code == 200
        run = run_res.json()

        outsider_token = {"Authorization": "Bearer test-token-outsider-b"}
        get_res = await ac.get(f"/dem/runs/{run['id']}", headers=outsider_token)
        assert get_res.status_code == 403

        put_res = await ac.put(
            f"/dem/runs/{run['id']}",
            json={"status": "tampered"},
            headers=outsider_token,
        )
        assert put_res.status_code == 403

        page_res = await ac.post(
            f"/dem/pages?run_id={run['id']}&page_index=0",
            headers=owner_headers,
        )
        assert page_res.status_code == 200
        page = page_res.json()

        page_put_res = await ac.put(
            f"/dem/pages/{page['id']}",
            json={"status": "tampered"},
            headers=outsider_token,
        )
        assert page_put_res.status_code == 403

        # The project owner, authenticated as an end user (not the internal
        # service), can still read/update their own run.
        owner_token = {"Authorization": "Bearer test-token-owner-a"}
        owner_get_res = await ac.get(f"/dem/runs/{run['id']}", headers=owner_token)
        assert owner_get_res.status_code == 200


@pytest.mark.asyncio
async def test_list_project_dem_runs():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create a project
        proj_res = await ac.post(
            "/projects",
            json={"id": "proj-runs-1", "name": "Project Runs 1", "owner_id": "user-abc"},
            headers=HEADERS,
        )
        assert proj_res.status_code == 200

        # Create two runs
        run1_res = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-runs-1",
                "document_id": "DOC-RUN-1",
                "document_hash": "sha256:run1",
                "file_name": "drawing_1.pdf",
                "total_pages": 5,
                "provider": "qwen",
                "prompt_version": "v1",
            },
            headers=HEADERS,
        )
        assert run1_res.status_code == 200
        run1 = run1_res.json()

        run2_res = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-runs-1",
                "document_id": "DOC-RUN-2",
                "document_hash": "sha256:run2",
                "file_name": "drawing_2.pdf",
                "total_pages": 2,
                "provider": "qwen",
                "prompt_version": "v1",
            },
            headers=HEADERS,
        )
        assert run2_res.status_code == 200
        run2 = run2_res.json()

        # Get runs list
        list_res = await ac.get(
            "/projects/proj-runs-1/dem/runs",
            headers=HEADERS,
        )
        assert list_res.status_code == 200
        runs = list_res.json()
        assert len(runs) == 2
        run_ids = {r["id"] for r in runs}
        assert run_ids == {run1["id"], run2["id"]}


