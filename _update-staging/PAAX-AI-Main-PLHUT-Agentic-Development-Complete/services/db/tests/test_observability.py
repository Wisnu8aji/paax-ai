import asyncio

from fastapi.testclient import TestClient

from paax_db.main import app


client = TestClient(app)


def _headers(**extra: str) -> dict[str, str]:
    return {
        "X-Internal-Key": "test-internal-key",
        "X-User-Id": "tenant-observability",
        **extra,
    }


def test_usage_event_inherits_correlation_and_redacts_sensitive_metadata():
    response = client.post(
        "/usage/log",
        headers=_headers(**{"X-Correlation-Id": "trace-f18-001"}),
        json={
            "tenant_id": "tenant-observability",
            "service": "document-intelligence",
            "operation": "dem.extraction.completed",
            "event_type": "pipeline_metric",
            "status": "completed",
            "run_id": "run-1",
            "project_id": "project-1",
            "snapshot_id": "snapshot-1",
            "calculation_id": "calculation-1",
            "metric_count": 3,
            "tokens_in": 12,
            "tokens_out": 7,
            "latency_ms": 45,
            "success": True,
            "metadata": {
                "pages_processed": 3,
                "api_key": "must-not-persist",
                "nested": {"prompt": "sensitive drawing text", "evidence_count": 9},
            },
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["correlation_id"] == "trace-f18-001"
    assert payload["run_id"] == "run-1"
    assert payload["project_id"] == "project-1"
    assert payload["snapshot_id"] == "snapshot-1"
    assert payload["calculation_id"] == "calculation-1"
    assert payload["event_type"] == "pipeline_metric"
    assert payload["status"] == "completed"
    assert payload["metric_count"] == 3
    assert payload["metadata"] == {"pages_processed": 3, "nested": {"evidence_count": 9}}
    assert "must-not-persist" not in response.text
    assert "sensitive drawing text" not in response.text


def test_correlation_middleware_generates_and_echoes_safe_trace_id():
    response = client.get("/health")

    assert response.status_code == 200
    correlation_id = response.headers["X-Correlation-Id"]
    assert correlation_id
    assert len(correlation_id) <= 128


def test_best_effort_telemetry_never_breaks_a_caller():
    from paax_db.usage_telemetry import emit_best_effort

    events = []

    async def unavailable(event):
        events.append(event)
        raise RuntimeError("telemetry unavailable")

    asyncio.run(emit_best_effort(unavailable, {"operation": "retrieval.completed"}))
    assert events == [{"operation": "retrieval.completed"}]
