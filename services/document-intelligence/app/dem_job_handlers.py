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

import asyncio
import os
from typing import Any, Callable

from app.artifact_storage import ArtifactStore, ArtifactUnavailable
from app.durable_worker_async import PoisonedJobError
from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import MAX_VISION_CONCURRENCY, process_document
from app.transcription.providers.base import DemVisionProvider
from app.runtime_events import RuntimeEventPublisher


def _select_vision_provider() -> DemVisionProvider:
    """Same provider selection process_page's callers already use in
    practice (env-driven Qwen adapter), pulled out so the worker's startup
    can fail closed instead of quietly running with no provider."""
    from app.transcription.providers.qwen import QwenDemAdapter

    provider = QwenDemAdapter.from_env()
    if provider is None:
        if os.environ.get("DEM_VISION_PROVIDER") == "mock" or os.environ.get("TESTING") == "1":
            from app.transcription.providers.mock import MockDemAdapter
            return MockDemAdapter()
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
        event_publisher_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.artifact_store = artifact_store
        self.db_client = db_client or DemDbClient()
        self._vision_provider = vision_provider
        self._event_publisher_factory = event_publisher_factory
        self._event_publishers: dict[str, Any] = {}

    def _runtime_events(self, run_id: str) -> Any:
        publisher = self._event_publishers.get(run_id)
        if publisher is None:
            publisher = (
                self._event_publisher_factory(run_id)
                if self._event_publisher_factory is not None
                else RuntimeEventPublisher(run_id=run_id)
            )
            self._event_publishers[run_id] = publisher
        return publisher

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
        events = self._runtime_events(str(payload["run_id"]))
        vision_model = str(getattr(provider, "model", "mimo-v2.5") or "mimo-v2.5")
        deepseek_model = str(getattr(provider, "deepseek_model", "deepseek-v4-flash") or "deepseek-v4-flash")
        await events.emit(
            "run.started",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"label": "Drawing Intelligence runtime"},
        )
        await events.emit(
            "agent.started",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            stage="orchestration",
            payload_summary={"label": "DeepSeek agent"},
        )
        await events.emit(
            "task.started",
            task_id="T02",
            stage="T02",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"label": "Render Pages & Build Sheet Inventory"},
        )
        await events.emit(
            "task.progress",
            task_id="T02",
            stage="T02",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"progress": 0, "phase": "page pipeline ready"},
        )
        await events.emit(
            "task.started",
            task_id="T03",
            stage="T03",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"label": "Classify Sheets & Build SPECTRA"},
        )
        await events.emit(
            "subagent.started",
            task_id="T03",
            stage="T03",
            agent_id="vision-worker",
            worker_id="vision-worker-01",
            provider="opencode-go",
            model=vision_model,
            payload_summary={"label": "MiMo vision extraction", "parent_agent_id": "paax-agent"},
        )

        async def on_page_event(event_type: str, page_index: int, task_id: str, payload_summary: dict) -> None:
            # Events describe completed/started operations at the actual page
            # boundary. The UI projection redacts provider/model names; the
            # durable audit event keeps them for provenance.
            is_vision = task_id == "T03"
            worker_slot = ((page_index % MAX_VISION_CONCURRENCY) + 1) if is_vision else None
            await events.emit(
                event_type,
                task_id=task_id,
                stage=task_id,
                agent_id="paax-agent" if not is_vision else "vision-worker",
                worker_id=f"vision-worker-{worker_slot:02d}" if worker_slot is not None else None,
                provider="opencode-go",
                model=vision_model if is_vision else deepseek_model,
                payload_summary={"page_index": page_index, **payload_summary},
            )

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
            # Drawing pages are independent perception units. Keep at most
            # twenty in flight even if a caller supplies a larger value.
            concurrency=MAX_VISION_CONCURRENCY,
            on_page_event=on_page_event,
        )
        status = await self.db_client.get_run_status(str(payload["run_id"]))
        complete_pages = sum(1 for page in status.get("pages", []) if page.get("status") == "complete")
        await events.emit(
            "subagent.completed",
            task_id="T03",
            stage="T03",
            agent_id="vision-worker",
            worker_id="vision-worker-01",
            provider="opencode-go",
            model=vision_model,
            payload_summary={"label": "MiMo vision extraction", "completed_pages": complete_pages},
        )
        await events.emit(
            "task.completed",
            task_id="T03",
            stage="T03",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"completed_pages": complete_pages, "progress": 1},
        )
        await events.emit(
            "task.completed",
            task_id="T02",
            stage="T02",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"completed_pages": complete_pages, "progress": 1},
        )
        await events.emit(
            "agent.completed",
            agent_id="paax-agent",
            provider="opencode-go",
            model=deepseek_model,
            payload_summary={"completed_pages": complete_pages},
        )

    async def handle_dem_synthesize(self, payload: dict[str, Any]) -> None:
        from app.drawing_intelligence.pipeline import analyze_drawing_package
        from app.project_graph.synthesis_task import synthesize_and_post_snapshot_task

        run_id = payload["run_id"]
        project_id = payload["project_id"]
        events = self._runtime_events(str(run_id))
        await events.emit(
            "task.started",
            task_id="T10",
            stage="T10",
            agent_id="paax-agent",
            provider="opencode-go",
            model="deepseek-v4-flash",
            payload_summary={"label": "Calculate & Compose QUANTA"},
        )
        run_status = await self.db_client.get_run_status(run_id)
        drawing_analysis = None
        drawing_analysis_artifact_key = None
        drawing_analysis_error = None
        await events.emit(
            "tool.started",
            task_id="T10",
            stage="T10",
            agent_id="paax-agent",
            provider="opencode-go",
            model="deepseek-v4-flash",
            payload_summary={"tool": "drawing package analysis"},
        )
        await events.emit(
            "task.progress",
            task_id="T10",
            stage="T10",
            agent_id="paax-agent",
            provider="opencode-go",
            model="deepseek-v4-flash",
            payload_summary={"progress": 0.1, "phase": "package evidence analysis"},
        )
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
                drawing_analysis = await asyncio.to_thread(
                    analyze_drawing_package,
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
            await events.emit(
                "tool.completed",
                task_id="T10",
                stage="T10",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={
                    "tool": "drawing package analysis",
                    "status": "ok" if drawing_analysis is not None else "skipped",
                    "work_item_count": len(drawing_analysis.work_items) if drawing_analysis is not None else 0,
                },
            )
        except Exception as exc:
            # Package intelligence is additive. Existing DEM→PCKM synthesis is
            # preserved, while the failure is persisted in snapshot metadata.
            drawing_analysis_error = f"{type(exc).__name__}: {exc}"
            await events.emit(
                "tool.failed",
                task_id="T10",
                stage="T10",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={"tool": "drawing package analysis", "error": type(exc).__name__},
            )

        if drawing_analysis is not None:
            for item in drawing_analysis.work_items:
                calculation = item.calculation
                quantity = calculation.result if calculation is not None else None
                unit = calculation.unit if calculation is not None and calculation.unit else str(item.attributes.get("unit") or "-")
                formula_id = calculation.calculation_id if calculation is not None else None
                evidence_refs = list(item.evidence_refs)
                await events.emit(
                    "quanta.row_created",
                    task_id="T10",
                    stage="T10",
                    agent_id="paax-agent",
                    provider="opencode-go",
                    model="deepseek-v4-flash",
                    payload_summary={
                        "row_id": f"quanta:{item.work_item_id}",
                        "work_item": item.label,
                        "location": str(item.attributes.get("level") or "-"),
                        "unit": unit,
                        "qty": quantity,
                        "formula_ref": formula_id,
                        "status": "draft" if quantity is None else "needs-review",
                        "evidence_refs": evidence_refs,
                    },
                )
                if calculation is not None and quantity is not None:
                    await events.emit(
                        "formula.completed",
                        task_id="T10",
                        stage="T10",
                        agent_id="paax-agent",
                        provider="opencode-go",
                        model="deepseek-v4-flash",
                        payload_summary={
                            "formula_id": calculation.calculation_id,
                            "formula": calculation.formula,
                            "result": quantity,
                            "status": calculation.status,
                        },
                    )

        await events.emit(
            "tool.started",
            task_id="T10",
            stage="T10",
            agent_id="paax-agent",
            provider="opencode-go",
            model="deepseek-v4-flash",
            payload_summary={"tool": "snapshot synthesis and graph publish"},
        )
        try:
            await synthesize_and_post_snapshot_task(
                run_id, project_id, run_status, self.db_client,
                drawing_analysis=drawing_analysis,
                drawing_analysis_artifact_key=drawing_analysis_artifact_key,
                drawing_analysis_error=drawing_analysis_error,
            )
        except Exception as exc:
            await events.emit(
                "tool.failed",
                task_id="T10",
                stage="T10",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={"tool": "snapshot synthesis and graph publish", "error": type(exc).__name__},
            )
            raise
        await events.emit(
            "tool.completed",
            task_id="T10",
            stage="T10",
            agent_id="paax-agent",
            provider="opencode-go",
            model="deepseek-v4-flash",
            payload_summary={"tool": "snapshot synthesis and graph publish", "status": "ok"},
        )
        try:
            final_status = await self.db_client.get_run_status(str(run_id))
        except Exception:
            final_status = {}
        if final_status.get("status") == "synthesis_complete":
            await events.emit(
                "task.completed",
                task_id="T10",
                stage="T10",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={"progress": 1},
            )
            await events.emit(
                "run.completed",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={"status": "synthesis_complete"},
            )
        elif final_status.get("status") == "synthesis_failed":
            await events.emit(
                "task.failed",
                task_id="T10",
                stage="T10",
                agent_id="paax-agent",
                provider="opencode-go",
                model="deepseek-v4-flash",
                payload_summary={"error": "synthesis_failed"},
            )

    def as_handler_map(self) -> dict[str, Any]:
        return {
            "dem.extract": self.handle_dem_extract,
            "dem.synthesize": self.handle_dem_synthesize,
        }
