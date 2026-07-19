"""Lazy, explicit Core Engine composition-root factory."""
from __future__ import annotations

import os
from typing import Any

import requests

from .core_engine_client import CoreEngineClient, Transport


class RequestsTransport:
    """Synchronous transport that performs no I/O until CoreEngineClient.calculate."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def post(self, path: str, *, json: dict[str, Any], headers: dict[str, str], timeout: float) -> Any:
        return requests.post(f"{self.base_url}{path}", json=json, headers=headers, timeout=timeout)


def build_core_engine_client(
    *, base_url: str | None = None, internal_key: str | None = None, transport: Transport | None = None,
) -> CoreEngineClient | None:
    """Return an authenticated client only when deployment explicitly configures it.

    ``CORE_ENGINE_BASE_URL`` is deliberately unset by default. Construction is
    side-effect free, so an unconfigured service cannot make an accidental call.
    """
    configured_base_url = base_url if base_url is not None else os.getenv("CORE_ENGINE_BASE_URL")
    configured_internal_key = internal_key if internal_key is not None else os.getenv("INTERNAL_SERVICE_KEY")
    if not configured_base_url or not configured_internal_key:
        return None
    return CoreEngineClient(transport or RequestsTransport(configured_base_url), internal_key=configured_internal_key)
