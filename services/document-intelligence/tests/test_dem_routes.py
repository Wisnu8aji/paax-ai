from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import dem_routes
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


def test_dem_routes_are_registered():
    included = [getattr(route, "original_router", None) for route in app.routes]
    assert dem_routes.router in included
