"""Authenticated, injectable HTTP boundary to the Core Engine."""
from __future__ import annotations
import hashlib
import json
import time
from typing import Any, Callable, Protocol


class CoreEngineUnavailable(RuntimeError):
    pass


class Transport(Protocol):
    def post(self, path: str, *, json: dict[str, Any], headers: dict[str, str], timeout: float) -> Any: ...


class CoreEngineClient:
    def __init__(
        self, transport: Transport, *, internal_key: str, timeout_seconds: float = 3.0,
        telemetry: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.transport, self.internal_key, self.timeout_seconds, self.telemetry = transport, internal_key, timeout_seconds, telemetry

    def _emit(self, request: dict[str, Any], *, success: bool, attempts: int, started: float, calculation_id: str | None = None) -> None:
        if self.telemetry is None:
            return
        event = {
            "service": "db", "operation": "core_engine.calculation", "event_type": "pipeline_metric",
            "status": "completed" if success else "unavailable", "success": success, "metric_count": 1,
            "latency_ms": max(0, int((time.monotonic() - started) * 1000)),
            "project_id": request.get("project_id"), "snapshot_id": request.get("snapshot_id"),
            "calculation_id": calculation_id,
            "metadata": {"measurement_fact_count": len(request.get("measurement_fact_ids") or []), "attempt_count": attempts},
        }
        try:
            self.telemetry(event)
        except Exception:
            return

    def calculate(self, request: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        identity = json.dumps(request, sort_keys=True, separators=(",", ":"))
        headers = {"X-Internal-Key": self.internal_key, "Idempotency-Key": hashlib.sha256(identity.encode()).hexdigest()}
        last_error = None
        for attempt in range(1, 3):
            try:
                response = self.transport.post("/calculations", json=request, headers=headers, timeout=self.timeout_seconds)
                status = getattr(response, "status_code", 200)
                if status >= 500:
                    raise CoreEngineUnavailable("core engine transient failure")
                if status >= 400:
                    raise ValueError(getattr(response, "text", "core engine rejected request"))
                result = response.json()
                self._emit(request, success=True, attempts=attempt, started=started, calculation_id=result.get("calculation_id"))
                return result
            except (TimeoutError, ConnectionError, CoreEngineUnavailable) as exc:
                last_error = exc
        self._emit(request, success=False, attempts=2, started=started)
        raise CoreEngineUnavailable("core engine unavailable; quantity remains blocked") from last_error
