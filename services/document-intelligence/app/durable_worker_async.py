"""Production async worker driving a real AsyncDurableJobQueue (DbDurableJobStore).

Unlike DurableWorker (durable_worker.py), which is hard-typed to
InMemoryDurableJobStore's synchronous interface and has no caller in
production code, this worker is the actual process a deployment runs to
process dem.extract/dem.synthesize jobs enqueued via DbDurableJobStore. It
never imports InMemoryDurableJobStore -- process restart and multi-instance
delivery safety come entirely from the DB-backed queue's SKIP LOCKED lease
and server-enforced state transitions (see services/db/src/paax_db/main.py's
durable-jobs endpoints).

Job payloads carry only IDs and object keys, never raw bytes or live
credentials -- a lease can be picked up by any worker process/instance
because nothing in a job's payload is process-local.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

import httpx

from app.artifact_storage import ArtifactStore, ArtifactUnavailable
from app.durable_jobs import AsyncDurableJobQueue


class PoisonedJobError(RuntimeError):
    """Raised by a handler to mark a failure as permanent (never retry),
    matching document_loop.py's failure classification: some errors (bad
    auth, corrupt input) will never succeed just by trying again."""


JobHandler = Callable[[dict[str, Any]], Awaitable[None]]


class AsyncDurableWorker:
    """Leases jobs from an AsyncDurableJobQueue, dispatches to a registered
    handler by job_type, heartbeats while the handler runs, and reports the
    outcome back to the queue. One worker instance processes one job at a
    time (run_forever's polling loop); running multiple OS processes of this
    same worker is how concurrency is achieved -- the DB-backed lease with
    SKIP LOCKED is what makes that safe."""

    def __init__(
        self,
        queue: AsyncDurableJobQueue,
        artifacts: ArtifactStore,
        worker_id: str,
        handlers: dict[str, JobHandler],
        *,
        lease_seconds: int = 60,
        heartbeat_interval_seconds: float = 20.0,
        max_attempts: int = 3,
    ) -> None:
        self.queue = queue
        self.artifacts = artifacts
        self.worker_id = worker_id
        self.handlers = handlers
        self.lease_seconds = lease_seconds
        self.heartbeat_interval_seconds = heartbeat_interval_seconds
        self.max_attempts = max_attempts

    async def _heartbeat_loop(self, job_id: str) -> None:
        logger = logging.getLogger("app.durable_worker_async")
        try:
            while True:
                await asyncio.sleep(self.heartbeat_interval_seconds)
                try:
                    await self.queue.heartbeat(job_id, self.worker_id, lease_seconds=self.lease_seconds)
                except httpx.TransportError as exc:
                    # A single connect/read timeout must not surface through
                    # run_once's cleanup path and kill the worker process. The
                    # DB lease remains valid until its expiry; the next
                    # heartbeat gets another chance to renew it.
                    logger.warning(
                        "Transient heartbeat failure for job %s; will retry: %s",
                        job_id,
                        exc,
                    )
        except asyncio.CancelledError:
            pass

    async def run_once(self) -> bool:
        """Lease and process at most one job. Returns False if the queue was
        empty (nothing to do this poll)."""
        logger = logging.getLogger("app.durable_worker_async")
        try:
            leased = await self.queue.lease(self.worker_id, lease_seconds=self.lease_seconds)
        except httpx.TransportError as exc:
            # A single connect/read timeout on the control-plane lease must
            # not surface through run_forever and kill the worker process.
            # Nothing was claimed, so the normal poll-and-sleep loop is the
            # recovery.
            logger.warning("Transient lease failure; will retry next poll: %s", exc)
            return False
        if leased is None:
            return False

        job_id, job_type, payload = leased["id"], leased["job_type"], leased["payload"]
        try:
            await self.queue.transition_running(job_id, self.worker_id)
        except httpx.TransportError as exc:
            # The lease is already claimed server-side, but the transition to
            # "running" never landed. Neither complete nor retry is legal for
            # a "leased" job (the server rejects both), so reporting either
            # outcome would fabricate the job's fate. Abandon the lease
            # instead and let server-side lease expiry re-expose the job to
            # the next lease poll -- durable at-least-once semantics without
            # killing the worker process.
            logger.warning(
                "Transient transition failure for job %s; abandoning lease (expiry will re-lease it): %s",
                job_id,
                exc,
            )
            return False

        heartbeat_task = asyncio.ensure_future(self._heartbeat_loop(job_id))
        try:
            artifact_key = payload.get("artifact_key")
            if artifact_key:
                # Fail fast (as retryable, not as handler-crash) if the
                # artifact this job needs is not reachable from this worker
                # instance's configured object storage -- an artifact that
                # never becomes available must not silently look "successful".
                try:
                    self.artifacts.get(artifact_key)
                except ArtifactUnavailable as exc:
                    await self.queue.retry(job_id, self.worker_id, error=f"artifact unavailable: {exc}", max_attempts=self.max_attempts)
                    return True

            handler = self.handlers.get(job_type)
            if handler is None:
                await self.queue.retry(job_id, self.worker_id, error=f"unsupported durable job type: {job_type}", max_attempts=1)
                return True

            try:
                await handler(payload)
            except PoisonedJobError as exc:
                # Permanent failure: skip the bounded-retry policy entirely,
                # matching document_loop.py's "permanent" classification --
                # retrying a request that can never succeed just wastes time
                # and looks like the system is stuck looping.
                await self.queue.retry(job_id, self.worker_id, error=str(exc), max_attempts=1)
                return True

            await self.queue.complete(job_id, self.worker_id)
        except Exception as exc:
            await self.queue.retry(job_id, self.worker_id, error=str(exc), max_attempts=self.max_attempts)
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        return True

    async def run_forever(self, *, poll_interval_seconds: float = 2.0, stop_event: asyncio.Event | None = None) -> None:
        logger = logging.getLogger("app.durable_worker_async")
        while stop_event is None or not stop_event.is_set():
            try:
                processed = await self.run_once()
            except httpx.TransportError as exc:
                # run_once already absorbs lease/transition transport
                # failures; anything that escapes (e.g. the reporting
                # complete/retry call failing while a handler error is being
                # reported) must also never kill the worker process. A lost
                # request is never interpreted as job success -- the durable
                # lease/retry protocol re-exposes the job once the queue is
                # reachable again.
                logger.warning("Transient queue transport failure; worker will retry: %s", exc)
                await asyncio.sleep(poll_interval_seconds)
                continue
            if not processed:
                await asyncio.sleep(poll_interval_seconds)
