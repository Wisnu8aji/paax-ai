"""Document-level orchestration for independent DEM page extraction."""
from __future__ import annotations

import asyncio

from app.transcription.db_client import DemDbClient
from app.transcription.page_loop import process_page
from app.transcription.providers.base import DemVisionProvider

DEFAULT_CONCURRENCY = 2


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
) -> None:
    run = {"id": run_id, "document_id": document_id, "document_hash": document_hash}
    page_rows = [await db_client.create_page(run_id, page_index) for page_index in range(total_pages)]
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded_process(page_index: int, page_id: str) -> None:
        async with semaphore:
            await process_page(
                pdf_bytes=pdf_bytes,
                page_index=page_index,
                page_id=page_id,
                run=run,
                provider=provider,
                db_client=db_client,
                prompt_version=prompt_version,
            )

    await asyncio.gather(*(bounded_process(index, page_rows[index]["id"]) for index in range(total_pages)))
    status = await db_client.get_run_status(run_id)
    any_failed = any(page["status"] == "failed" for page in status["pages"])
    await db_client.update_run_status(run_id, "partially_failed" if any_failed else "dem_complete")
