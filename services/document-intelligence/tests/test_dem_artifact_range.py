from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore, sign_artifact_key
from app.main import app


HEADERS = {"X-Internal-Key": "test-internal-key"}
PDF_BYTES = b"%PDF-1.7\nrange-test-payload\n"


class _SpyStreamingStore:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.get_calls = 0
        self.stat_calls = 0
        self.range_calls: list[tuple[int, int]] = []
        self.bytes_yielded = 0

    def stat(self, key: str):
        self.stat_calls += 1
        return type("Metadata", (), {"size": len(self.payload), "etag": '"spy-etag"', "content_type": "application/pdf"})()

    def iter_range(self, key: str, start: int, end: int, *, chunk_size: int = 64 * 1024):
        self.range_calls.append((start, end))
        for offset in range(start, end + 1, chunk_size):
            chunk = self.payload[offset:min(end + 1, offset + chunk_size)]
            self.bytes_yielded += len(chunk)
            yield chunk

    def get(self, key: str) -> bytes:
        self.get_calls += 1
        raise AssertionError("artifact route must not call get()")


@pytest.fixture
def artifact_fixture(tmp_path, monkeypatch):
    monkeypatch.setenv("ARTIFACT_SIGNING_SECRET", "range-test-secret")
    store = LocalArtifactStore(tmp_path)
    artifact_key = store.put(
        "original-pdf", PDF_BYTES, content_type="application/pdf", object_key="runs/run-range/source.pdf"
    )
    run = {"id": "run-range", "project_id": "PROJECT-A", "artifact_key": artifact_key}
    token = sign_artifact_key(
        artifact_key,
        secret=b"range-test-secret",
        expires_at=4_102_444_800,
        project_id="PROJECT-A",
    )
    return store, run, token


async def get_artifact(token: str, headers: dict[str, str] | None = None):
    request_headers = {**HEADERS, **(headers or {})}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(f"/drawings/dem/run-range/artifact?token={token}", headers=request_headers)


@pytest.mark.asyncio
async def test_authorized_artifact_returns_full_pdf_with_cache_validators(artifact_fixture):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token)

    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == str(len(PDF_BYTES))
    assert response.headers["etag"].startswith('"')


@pytest.mark.asyncio
async def test_authorized_artifact_serves_a_single_valid_byte_range(artifact_fixture):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": "bytes=5-10"})

    assert response.status_code == 206
    assert response.content == PDF_BYTES[5:11]
    assert response.headers["content-range"] == f"bytes 5-10/{len(PDF_BYTES)}"
    assert response.headers["content-length"] == "6"
    assert response.headers["accept-ranges"] == "bytes"


@pytest.mark.asyncio
async def test_authorized_artifact_serves_a_suffix_byte_range(artifact_fixture):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": "bytes=-4"})

    assert response.status_code == 206
    assert response.content == PDF_BYTES[-4:]
    assert response.headers["content-range"] == f"bytes {len(PDF_BYTES) - 4}-{len(PDF_BYTES) - 1}/{len(PDF_BYTES)}"


@pytest.mark.asyncio
async def test_authorized_artifact_returns_not_modified_before_reading_range(artifact_fixture):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        full = await get_artifact(token)
        response = await get_artifact(token, {"If-None-Match": full.headers["etag"], "Range": "bytes=0-4"})

    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == full.headers["etag"]
    assert response.headers["accept-ranges"] == "bytes"


@pytest.mark.asyncio
async def test_not_modified_uses_metadata_without_any_payload_read(artifact_fixture):
    _, run, token = artifact_fixture
    store = _SpyStreamingStore(PDF_BYTES)
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"If-None-Match": '"spy-etag"'})

    assert response.status_code == 304
    assert store.stat_calls == 1
    assert store.range_calls == []
    assert store.get_calls == 0


@pytest.mark.asyncio
async def test_partial_artifact_streams_only_requested_bytes_without_full_read(artifact_fixture):
    _, run, token = artifact_fixture
    store = _SpyStreamingStore(PDF_BYTES)
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": "bytes=4-8"})

    assert response.status_code == 206
    assert response.content == PDF_BYTES[4:9]
    assert store.range_calls == [(4, 8)]
    assert store.bytes_yielded == 5
    assert store.get_calls == 0


@pytest.mark.asyncio
async def test_full_artifact_streams_all_bytes_without_full_store_get(artifact_fixture):
    _, run, token = artifact_fixture
    store = _SpyStreamingStore(PDF_BYTES)
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token)

    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert store.range_calls == [(0, len(PDF_BYTES) - 1)]
    assert store.bytes_yielded == len(PDF_BYTES)
    assert store.get_calls == 0


@pytest.mark.asyncio
async def test_if_range_validator_mismatch_falls_back_to_full_stream(artifact_fixture):
    _, run, token = artifact_fixture
    store = _SpyStreamingStore(PDF_BYTES)
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": "bytes=4-8", "If-Range": '"stale-etag"'})

    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert store.range_calls == [(0, len(PDF_BYTES) - 1)]
    assert store.get_calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("range_value", ["bytes=999-1000", "bytes=5-3", "items=0-2", "bytes=0-1,3-4"])
async def test_authorized_artifact_rejects_unsatisfiable_or_malformed_ranges(artifact_fixture, range_value):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": range_value})

    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{len(PDF_BYTES)}"


@pytest.mark.asyncio
async def test_authorized_artifact_returns_404_when_stored_pdf_is_missing(artifact_fixture):
    store, run, token = artifact_fixture
    store.delete(run["artifact_key"])
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token)

    assert response.status_code == 404
    assert response.json()["detail"] == "artifact unavailable"


@pytest.mark.asyncio
async def test_artifact_range_keeps_token_bound_to_original_project(artifact_fixture):
    store, run, token = artifact_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value={**run, "project_id": "PROJECT-B"})
    ), patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        response = await get_artifact(token, {"Range": "bytes=0-4"})

    assert response.status_code == 403
