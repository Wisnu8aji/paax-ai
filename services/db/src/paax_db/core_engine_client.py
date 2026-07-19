"""Authenticated, injectable HTTP boundary to the Core Engine."""
from __future__ import annotations
import hashlib
import json
from typing import Any, Protocol


class CoreEngineUnavailable(RuntimeError):
    pass


class Transport(Protocol):
    def post(self, path: str, *, json: dict[str, Any], headers: dict[str, str], timeout: float) -> Any: ...


class CoreEngineClient:
    def __init__(self, transport: Transport, *, internal_key: str, timeout_seconds: float = 3.0):
        self.transport, self.internal_key, self.timeout_seconds = transport, internal_key, timeout_seconds

    def calculate(self, request: dict[str, Any]) -> dict[str, Any]:
        identity = json.dumps(request, sort_keys=True, separators=(",", ":"))
        headers = {"X-Internal-Key": self.internal_key, "Idempotency-Key": hashlib.sha256(identity.encode()).hexdigest()}
        last_error = None
        for _ in range(2):
            try:
                response = self.transport.post("/calculations", json=request, headers=headers, timeout=self.timeout_seconds)
                status = getattr(response, "status_code", 200)
                if status >= 500:
                    raise CoreEngineUnavailable("core engine transient failure")
                if status >= 400:
                    raise ValueError(getattr(response, "text", "core engine rejected request"))
                return response.json()
            except (TimeoutError, ConnectionError, CoreEngineUnavailable) as exc:
                last_error = exc
        raise CoreEngineUnavailable("core engine unavailable; quantity remains blocked") from last_error
