"""HTTP client for DEM job-orchestrator persistence in services/db."""
from __future__ import annotations

import os

import httpx


class DemDbClient:
    def __init__(
        self,
        base_url: str | None = None,
        internal_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("DB_API_URL", "http://localhost:8084")).rstrip("/")
        self.internal_key = internal_key or os.getenv("INTERNAL_SERVICE_KEY", "")
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Key": self.internal_key, "X-User-Id": "dem-job-orchestrator"}

    async def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            transport=self._transport,
            headers=self._headers(),
        )

    async def create_run(
        self,
        *,
        document_id: str,
        document_hash: str,
        file_name: str,
        total_pages: int,
        provider: str,
        prompt_version: str,
        project_id: str | None = None,
        artifact_key: str | None = None,
    ) -> dict:
        async with await self._client() as client:
            response = await client.post(
                "/dem/runs",
                json={
                    "project_id": project_id,
                    "document_id": document_id,
                    "document_hash": document_hash,
                    "file_name": file_name,
                    "total_pages": total_pages,
                    "provider": provider,
                    "prompt_version": prompt_version,
                    "artifact_key": artifact_key,
                },
            )
            response.raise_for_status()
            return response.json()

    async def create_page(self, run_id: str, page_index: int) -> dict:
        async with await self._client() as client:
            response = await client.post(
                "/dem/pages",
                params={"run_id": run_id, "page_index": page_index},
            )
            response.raise_for_status()
            return response.json()

    async def update_page(self, page_id: str, **fields) -> dict:
        async with await self._client() as client:
            response = await client.put(f"/dem/pages/{page_id}", json=fields)
            response.raise_for_status()
            return response.json()

    async def update_run_status(self, run_id: str, status: str) -> dict:
        async with await self._client() as client:
            response = await client.put(f"/dem/runs/{run_id}", json={"status": status})
            response.raise_for_status()
            return response.json()

    async def get_run_status(self, run_id: str) -> dict:
        async with await self._client() as client:
            response = await client.get(f"/dem/runs/{run_id}/status")
            response.raise_for_status()
            return response.json()

    async def get_run(self, run_id: str) -> dict:
        async with await self._client() as client:
            response = await client.get(f"/dem/runs/{run_id}")
            response.raise_for_status()
            return response.json()
