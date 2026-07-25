"""dem.extract / dem.synthesize handlers for AsyncDurableWorker.

Each handler reads only what its job payload carries (object keys, IDs) --
never raw PDF bytes or a live provider instance passed in from the enqueuing
request -- so a lease picked up by any worker process/instance has everything
it needs from durable storage alone. Both handlers call the exact same
deterministic pipeline functions the codebase already has
(process_document / synthesize_and_post_snapshot_task); this module is wiring,
not new business logic.
"""
from __future__ import annotations

import os
from typing import Any

from app.artifact_storage import ArtifactStore, ArtifactUnavailable
from app.durable_worker_async import PoisonedJobError
from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.base import DemVisionProvider


def _select_vision_provider() -> DemVisionProvider:
    """Same provider selection process_page's callers already use in
    practice (env-driven Qwen adapter), pulled out so the worker's startup
    can fail closed instead of quietly running with no provider."""
    from app.transcription.providers.qwen import QwenDemAdapter

    provider = QwenDemAdapter.from_env()
    if provider is None:
        raise RuntimeError(
            "DRAWING_INTELLIGENCE_API_KEY is not configured -- the durable "
            "worker cannot process dem.extract jobs without a real vision "
            "provider. Set it, or inject a stub provider explicitly for "
            "deterministic/offline runs (see tests for the pattern)."
        )
    return provider


class DemJobHandlers:
    """Bundles the artifact store / DB client / vision provider a running
    worker process needs, so dem_routes.py's composition root and the worker
    entrypoint construct these dependencies exactly once and share the same
    fail-closed startup checks."""

    def __init__(
        self,
        *,
        artifact_store: ArtifactStore,
        db_client: DemDbClient | None = None,
        vision_provider: DemVisionProvider | None = None,
    ) -> None:
        self.artifact_store = artifact_store
        self.db_client = db_client or DemDbClient()
        self._vision_provider = vision_provider

    def _vision_provider_or_select(self) -> DemVisionProvider:
        if self._vision_provider is not None:
            return self._vision_provider
        return _select_vision_provider()

    async def handle_dem_extract(self, payload: dict[str, Any]) -> None:
        artifact_key = payload.get("artifact_key")
        if not artifact_key:
            raise PoisonedJobError("dem.extract payload is missing artifact_key")
        try:
            pdf_bytes = self.artifact_store.get(artifact_key)
        except ArtifactUnavailable as exc:
            # Let AsyncDurableWorker's own artifact pre-check normally catch
            # this before the handler ever runs; this is a defense-in-depth
            # re-raise in case a handler is invoked directly (e.g. in tests).
            raise PoisonedJobError(f"artifact permanently unavailable: {exc}") from exc

        provider = self._vision_provider_or_select()
        await process_document(
            pdf_bytes=pdf_bytes,
            run_id=payload["run_id"],
            document_id=payload["document_id"],
            document_hash=payload["document_hash"],
            total_pages=payload["total_pages"],
            provider=provider,
            db_client=self.db_client,
            prompt_version=payload["prompt_version"],
            resume=True,
            project_id=payload.get("project_id"),
            file_name=payload.get("file_name", "unknown.pdf"),
        )

    async def handle_dem_synthesize(self, payload: dict[str, Any]) -> None:
        from app.drawing_intelligence.pipeline import analyze_drawing_package
        from app.project_graph.synthesis_task import synthesize_and_post_snapshot_task

        run_id = payload["run_id"]
        project_id = payload["project_id"]
        run_status = await self.db_client.get_run_status(run_id)
        drawing_analysis = None
        drawing_analysis_artifact_key = None
        drawing_analysis_error = None
        try:
            run = await self.db_client.get_run(run_id)
            if not isinstance(run, dict):
                run = {}
            artifact_key = payload.get("artifact_key") or run.get("artifact_key")
            if artifact_key:
                pdf_bytes = self.artifact_store.get(artifact_key)
                dem_pages = {
                    int(page.get("page_index", index)): page["result"]
                    for index, page in enumerate(run_status.get("pages", []))
                    if page.get("status") == "complete" and page.get("result")
                }
                drawing_analysis = analyze_drawing_package(
                    pdf_bytes,
                    document_name=run.get("file_name") or payload.get("file_name") or "drawing.pdf",
                    dem_pages_data=dem_pages,
                    package_id=f"run-{run_id}",
                    mode=payload.get("analysis_mode") or os.environ.get("DI_PACKAGE_ANALYSIS_MODE", "fast"),
                )
                drawing_analysis_artifact_key = self.artifact_store.put(
                    "drawing-intelligence",
                    drawing_analysis.model_dump_json(indent=2).encode("utf-8"),
                    content_type="application/json",
                    object_key=f"runs/{run_id}/package-analysis.json",
                )
        except Exception as exc:
            # Package intelligence is additive. Existing DEM→PCKM synthesis is
            # preserved, while the failure is persisted in snapshot metadata.
            drawing_analysis_error = f"{type(exc).__name__}: {exc}"

        await synthesize_and_post_snapshot_task(
            run_id, project_id, run_status, self.db_client,
            drawing_analysis=drawing_analysis,
            drawing_analysis_artifact_key=drawing_analysis_artifact_key,
            drawing_analysis_error=drawing_analysis_error,
        )

    def as_handler_map(self) -> dict[str, Any]:
        return {
            "dem.extract": self.handle_dem_extract,
            "dem.synthesize": self.handle_dem_synthesize,
        }
