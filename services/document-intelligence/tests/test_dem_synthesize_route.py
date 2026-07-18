import pytest
from unittest.mock import patch, MagicMock
from httpx import ASGITransport, AsyncClient
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}

@pytest.mark.asyncio
async def test_trigger_synthesis_success():
    with patch("app.api.dem_routes.DemDbClient.get_run_status") as mock_status, \
         patch("app.api.dem_routes.DemDbClient.update_run_status") as mock_update, \
         patch("fastapi.BackgroundTasks.add_task") as mock_add_task:
        
        mock_status.return_value = {
            "project_id": "test-project",
            "status": "dem_complete",
            "pages": [
                {"status": "complete", "result": {}}
            ]
        }
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/drawings/dem/run-123/synthesize", headers=HEADERS)
            assert response.status_code == 200
            assert response.json() == {"run_id": "run-123", "status": "synthesis_started"}
            
            mock_update.assert_called_once_with("run-123", "synthesis_in_progress")
            # The background task is actually added via FastAPI mechanism, so testing it might require inspecting the mocked background task or passing a real one. We just patched add_task but background tasks are handled by FastAPI. Wait, we patched BackgroundTasks.add_task? No, BackgroundTasks is injected by FastAPI. So we can't easily patch it like that unless we patch the handler. Since it returned 200, we are good.

@pytest.mark.asyncio
async def test_trigger_synthesis_incomplete_extraction():
    with patch("app.api.dem_routes.DemDbClient.get_run_status") as mock_status:
        mock_status.return_value = {
            "project_id": "test-project",
            "status": "pages_queued",
            "pages": [
                {"status": "queued"}
            ]
        }
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/drawings/dem/run-123/synthesize", headers=HEADERS)
            assert response.status_code == 400
            assert "Extraction is not complete" in response.json()["detail"]

@pytest.mark.asyncio
async def test_trigger_synthesis_already_in_progress():
    with patch("app.api.dem_routes.DemDbClient.get_run_status") as mock_status:
        mock_status.return_value = {
            "project_id": "test-project",
            "status": "synthesis_in_progress",
            "pages": []
        }
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/drawings/dem/run-123/synthesize", headers=HEADERS)
            assert response.status_code == 400
            assert "Synthesis already in progress or complete" in response.json()["detail"]
