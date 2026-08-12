"""Production entrypoint for the DEM durable-job worker.

Usage:
    python -m app.durable_worker_main

Runs AsyncDurableWorker against the DB-backed durable queue and configured
object storage, processing dem.extract/dem.synthesize jobs until the process
is stopped. This is the actual production executor -- FastAPI BackgroundTasks
is never used for this work; a job enqueued via DbDurableJobStore.enqueue only
gets processed by a running instance of this entrypoint (or another compatible
worker leasing from the same queue).

Fails startup immediately (before leasing any job) if:
- JOB_QUEUE_BACKEND is not "durable-db" (the in-memory queue has no
  cross-process visibility, so a worker leasing from it would never see
  jobs enqueued by a different process -- pointless outside a single-process
  dev/test run);
- the configured artifact store backend is not reachable/misconfigured
  (checked by constructing it -- ArtifactStore/S3ArtifactStore already raise
  on missing required config, e.g. ARTIFACT_STORE_S3_BUCKET);
- INTERNAL_SERVICE_KEY is not set (the worker calls services/db as a trusted
  internal service identity; production must never fall back to a bypass --
  see app/auth.py's TESTING=1-gated fallback, which this explicitly refuses
  to rely on).
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
import uuid

from app.env import load_repo_env_local

# Load repo .env.local BEFORE any env-dependent imports or build_worker/main()
# calls -- identical to the pattern in app/main.py (FastAPI API service).
# Without this, the worker launched by Start-PLHUT-Local.ps1 never sees
# DRAWING_INTELLIGENCE_API_KEY and immediately poisons every job with
# "DRAWING_INTELLIGENCE_API_KEY is not configured".
load_repo_env_local()

from app.artifact_storage import ArtifactStore, LocalArtifactStore, S3ArtifactStore
from app.dem_job_handlers import DemJobHandlers
from app.durable_jobs import DbDurableJobStore
from app.durable_worker_async import AsyncDurableWorker


logger = logging.getLogger("app.durable_worker_main")


class WorkerStartupError(RuntimeError):
    pass


def _artifact_store_or_fail() -> ArtifactStore:
    backend = os.environ.get("ARTIFACT_STORE_BACKEND", "local")
    if backend == "s3":
        try:
            return S3ArtifactStore()
        except KeyError as exc:
            raise WorkerStartupError(f"S3 artifact store is misconfigured: missing {exc}") from exc
    if os.environ.get("ENV", "development") == "production":
        raise WorkerStartupError(
            "ARTIFACT_STORE_BACKEND=local is not durable and must not run in "
            "production. The worker refuses to start rather than silently "
            "read/write artifacts that are not shared across instances."
        )
    from pathlib import Path
    return LocalArtifactStore(Path(__file__).resolve().parents[1] / ".artifacts")


def _job_queue_or_fail() -> DbDurableJobStore:
    backend = os.environ.get("JOB_QUEUE_BACKEND", "memory")
    if backend != "durable-db":
        raise WorkerStartupError(
            f"JOB_QUEUE_BACKEND={backend!r} has no cross-process visibility -- "
            "a production worker must lease from the DB-backed queue "
            "(JOB_QUEUE_BACKEND=durable-db) so jobs enqueued by any API "
            "process/instance are actually reachable here."
        )
    return DbDurableJobStore()


def _require_internal_service_key() -> None:
    if not os.environ.get("INTERNAL_SERVICE_KEY"):
        raise WorkerStartupError(
            "INTERNAL_SERVICE_KEY is not set -- the worker authenticates to "
            "services/db as a trusted internal service identity and must not "
            "silently fall back to a test/dev bypass in production."
        )


def build_worker(worker_id: str | None = None) -> AsyncDurableWorker:
    _require_internal_service_key()
    artifact_store = _artifact_store_or_fail()
    job_queue = _job_queue_or_fail()
    handlers = DemJobHandlers(artifact_store=artifact_store).as_handler_map()
    return AsyncDurableWorker(
        queue=job_queue,
        artifacts=artifact_store,
        worker_id=worker_id or f"worker-{uuid.uuid4().hex[:12]}",
        handlers=handlers,
    )


async def _run() -> None:
    # Configure logging.  basicConfig sets the root handler (stderr / null device
    # when launched with RedirectStandardOutput=false by Start-WorkerProcess).
    logging.basicConfig(level=logging.INFO)
    # If Start-WorkerProcess passed a log-file path via PAAX_WORKER_LOG_FILE,
    # attach a FileHandler so all worker log output is captured in the .err.log
    # file that the startup script and operators inspect -- independent of whether
    # stdout/stderr are connected to a pipe or the null device.
    _log_file = os.environ.get("PAAX_WORKER_LOG_FILE")
    if _log_file:
        try:
            _fh = logging.FileHandler(_log_file, encoding="utf-8")
            _fh.setLevel(logging.DEBUG)
            _fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
            logging.getLogger().addHandler(_fh)
        except OSError:
            pass  # Non-fatal: log path inaccessible, fall back to basicConfig handler

    worker = build_worker()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Windows' event loop does not support add_signal_handler for
            # these signals -- the process still exits on Ctrl+C via the
            # default KeyboardInterrupt handling, just without a graceful
            # in-loop stop_event flip.
            pass
    logger.info("durable worker %s starting (queue=durable-db)", worker.worker_id)
    await worker.run_forever(stop_event=stop_event)


def main() -> int:
    try:
        asyncio.run(_run())
    except WorkerStartupError as exc:
        logger.error("worker startup failed: %s", exc)
        return 1
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
