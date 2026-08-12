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
        self.base_url = (base_url or os.getenv("DB_API_URL", "http://localhost:8001")).rstrip("/")
        self.internal_key = internal_key or os.getenv("INTERNAL_SERVICE_KEY", "")
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Key": self.internal_key, "X-User-Id": "dem-job-orchestrator"}

    async def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            transport=self._transport,
            headers=self._headers(),
            timeout=httpx.Timeout(30.0, connect=30.0),
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
        requested_by: str | None = None,
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
                    "requested_by": requested_by,
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

    async def get_canonical_package_index(self, project_id: str, run_id: str) -> dict:
        """Read the DB-owned canonical index; this call never asks DI to rebuild it."""
        async with await self._client() as client:
            response = await client.get(
                f"/projects/{project_id}/drawing-intelligence/package-analysis",
                params={"run_id": run_id},
            )
            response.raise_for_status()
            return response.json()

    async def authorize_artifact(self, project_id: str, artifact_key: str, *, actor_id: str, action: str = "read") -> None:
        async with await self._client() as client:
            path = "artifact-delete-access" if action == "delete" else "artifact-access"
            response = await client.post(f"/internal/projects/{project_id}/{path}", json={"artifact_key": artifact_key})
            response.raise_for_status()

    async def authorize_actor_for_project(self, actor_id: str, project_id: str, *, required_role: str | None = None) -> None:
        """Verify actor_id (the real end-user who made a document-intelligence
        request) is a member/owner of project_id, using services/db's
        authoritative ProjectMember/owner data. Raises httpx.HTTPStatusError
        (403) if not authorized -- callers should let that propagate or
        translate it to their own HTTPException(403)."""
        async with await self._client() as client:
            payload = {"actor_id": actor_id, "project_id": project_id}
            if required_role:
                payload["required_role"] = required_role
            response = await client.post(
                "/internal/authorize-actor",
                json=payload,
            )
            response.raise_for_status()

    async def get_artifact_retention(self, run_id: str) -> dict:
        async with await self._client() as client:
            response = await client.get(f"/dem/runs/{run_id}/artifact-retention")
            response.raise_for_status()
            return response.json()

    async def mark_artifact_deleted(self, run_id: str, *, actor_id: str) -> dict:
        async with await self._client() as client:
            response = await client.post(f"/internal/dem/runs/{run_id}/artifact-deleted")
            response.raise_for_status()
            return response.json()

    async def get_active_sheet_revisions(self, project_id: str) -> list[dict]:
        """Return the project's currently-effective sheet revisions, keyed by
        (document_id, sheet_id), so synthesis can tag evidence with a real
        revision_id instead of omitting it."""
        async with await self._client() as client:
            response = await client.get(f"/projects/{project_id}/sheet-revisions/active")
            response.raise_for_status()
            return response.json()
