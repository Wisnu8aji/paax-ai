import re
import pytest
from fastapi.testclient import TestClient
from paax_db.main import app
from unittest.mock import patch
import os

client = TestClient(app)

# Override internal key for tests
os.environ["INTERNAL_SERVICE_KEY"] = "test-internal-key"

@pytest.fixture
def auth_headers():
    return {
        "X-Internal-Key": "test-internal-key",
        "X-User-Id": "owner-123"
    }

def test_rule_based_fallback(auth_headers):
    # Ensure GEMINI_API_KEY is empty
    with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
        # We need a project first
        # But we can just test the generate_report logic by mocking the db query
        
        from paax_db.report_generator import generate_report
        import asyncio
        from unittest.mock import AsyncMock, MagicMock
        
        # Mock the async session and project
        mock_db = AsyncMock()
        mock_project = MagicMock()
        mock_project.progress = 42
        mock_project.warnings = ["Warn1", "Warn2"]
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_project
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Run report generation
        loop = asyncio.get_event_loop()
        report = loop.run_until_complete(generate_report("proj-1", mock_db))
        
        assert report.narrative_source == "rule-based-fallback"
        assert "42%" in report.summary
        assert "2 warning" in report.summary
        assert report.metrics_snapshot["progress"] == 42
        assert report.metrics_snapshot["warnings_count"] == 2

def test_anti_hallucination(auth_headers):
    # Mock GEMINI_API_KEY and httpx.AsyncClient
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake-key"}), \
         patch("httpx.AsyncClient") as mock_client:
             
        from paax_db.report_generator import generate_report
        import asyncio
        from unittest.mock import AsyncMock, MagicMock
        
        # Mock DB
        mock_db = AsyncMock()
        mock_project = MagicMock()
        mock_project.progress = 65
        mock_project.warnings = ["Warn1"]
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_project
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Mock Gemini Response
        fake_response = {
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": '{"summary": "Progres 65%, 1 warning terbuka, -2.5 deviasi", "highlights": ["65% progres"], "concerns": ["-2.5 deviasi", "1 warning"]}'
                    }]
                }
            }]
        }
        
        mock_resp = MagicMock()
        mock_resp.json.return_value = fake_response
        mock_resp.raise_for_status = MagicMock()
        
        mock_post = AsyncMock(return_value=mock_resp)
        # Setup AsyncClient mock
        instance = mock_client.return_value.__aenter__.return_value
        instance.post = mock_post
        
        loop = asyncio.get_event_loop()
        report = loop.run_until_complete(generate_report("proj-2", mock_db))
        
        assert report.narrative_source != "rule-based-fallback"
        
        # Anti-hallucination check: parse numbers from summary
        numbers_in_summary = re.findall(r'-?\d+(?:\.\d+)?', report.summary)
        
        metrics = report.metrics_snapshot
        valid_numbers = [
            str(metrics["progress"]),
            str(metrics["warnings_count"]),
            str(metrics["items_perlu_review"]),
            str(metrics["schedule_deviation"])
        ]
        
        for num in numbers_in_summary:
            assert num in valid_numbers, f"Hallucinated number {num} found in summary!"

def test_generate_endpoint_mocked(auth_headers):
    # Just to verify endpoint structure
    pass
