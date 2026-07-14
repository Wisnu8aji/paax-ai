"""Document-level orchestration for independent DEM page extraction."""
from __future__ import annotations

import asyncio

from app.transcription.db_client import DemDbClient
from app.transcription.page_loop import MAX_TRANSIENT_ATTEMPTS, process_page
from app.transcription.providers.base import DemVisionProvider

DEFAULT_CONCURRENCY = 2
_TERMINAL_STATUSES = {"complete", "failed"}
# Backoff between retry_wait redrive passes (§7.5/§8: transient failures alone
# are eligible for identical retry -- this is what actually re-drives a page
# process_page left in retry_wait, since nothing else in the codebase reads
# that status). Exponential per redrive round, capped, not per-attempt --
# process_page still owns the attempt_count ceiling (MAX_TRANSIENT_ATTEMPTS).
_RETRY_BACKOFF_SECONDS = (1.0, 4.0, 16.0)


async def process_document(
    pdf_bytes: bytes,
    run_id: str,
    document_id: str,
    document_hash: str,
    total_pages: int,
    provider: DemVisionProvider,
    db_client: DemDbClient,
    prompt_version: str,
    concurrency: int = DEFAULT_CONCURRENCY,
    resume: bool = False,
    project_id: str | None = None,
    file_name: str = "unknown.pdf",
) -> None:
    # run carries every metadata field DrawingEvidenceSheet needs that the
    # vision model itself never sees (2026-07-15: model output is scoped to
    # DemModelOutput -- sheet_identity/observations/etc -- page_loop.py fills
    # in the rest from this dict after the model responds).
    run = {
        "id": run_id,
        "document_id": document_id,
        "document_hash": document_hash,
        "project_id": project_id,
        "file_name": file_name,
    }
    existing_by_index: dict[int, dict] = {}
    if resume:
        status = await db_client.get_run_status(run_id)
        existing_by_index = {page["page_index"]: page for page in status["pages"]}

    page_rows: list[dict] = []
    for page_index in range(total_pages):
        existing = existing_by_index.get(page_index)
        page_rows.append(existing if existing is not None else await db_client.create_page(run_id, page_index))
    page_id_by_index = {page_index: page_rows[page_index]["id"] for page_index in range(total_pages)}
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded_process(page_index: int, existing_page: dict | None) -> None:
        async with semaphore:
            await process_page(
                pdf_bytes=pdf_bytes,
                page_index=page_index,
                page_id=page_id_by_index[page_index],
                run=run,
                provider=provider,
                db_client=db_client,
                prompt_version=prompt_version,
                existing_page=existing_page,
            )

    await asyncio.gather(*(
        bounded_process(index, existing_by_index.get(index)) for index in range(total_pages)
    ))

    # retry_wait redrive (§7.3/§8): process_page only advances a transient
    # failure to retry_wait and returns -- nothing else observes that status,
    # so without this loop a page can sit in retry_wait forever while the run
    # below is reported dem_complete. Bounded by MAX_TRANSIENT_ATTEMPTS (same
    # ceiling process_page itself enforces per page) so this cannot loop
    # indefinitely even if a provider stays down the whole run.
    for backoff_seconds in _RETRY_BACKOFF_SECONDS:
        status = await db_client.get_run_status(run_id)
        pending = [
            page for page in status["pages"]
            if page["status"] == "retry_wait" and page["attempt_count"] < MAX_TRANSIENT_ATTEMPTS
        ]
        if not pending:
            break
        await asyncio.sleep(backoff_seconds)
        await asyncio.gather(*(
            bounded_process(page["page_index"], page) for page in pending
        ))

    status = await db_client.get_run_status(run_id)
    # "failed" is terminal but still marks the run partially_failed; anything
    # NOT in _TERMINAL_STATUSES (e.g. a retry_wait page that exhausted the
    # redrive loop above without reaching complete/failed) is treated the
    # same way -- either case means the run did not cleanly succeed.
    any_problem = any(
        page["status"] == "failed" or page["status"] not in _TERMINAL_STATUSES
        for page in status["pages"]
    )
    await db_client.update_run_status(run_id, "partially_failed" if any_problem else "dem_complete")
