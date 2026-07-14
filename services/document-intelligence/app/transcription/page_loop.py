"""DEM per-page processing with failure classification and idempotency."""
from __future__ import annotations

import hashlib

from app.transcription.db_client import DemDbClient
from app.transcription.failure_classification import DemProviderError
from app.transcription.page_renderer import render_page_to_png
from app.transcription.parser import parse_and_validate
from app.transcription.providers.base import DemVisionProvider, PageContext

MAX_TRANSIENT_ATTEMPTS = 3


async def process_page(
    pdf_bytes: bytes,
    page_index: int,
    page_id: str,
    run: dict,
    provider: DemVisionProvider,
    db_client: DemDbClient,
    prompt_version: str,
    existing_page: dict | None = None,
) -> None:
    input_hash = hashlib.sha256(pdf_bytes).hexdigest()
    if (
        existing_page is not None
        and existing_page.get("status") == "complete"
        and existing_page.get("input_hash") == input_hash
    ):
        return

    await db_client.update_page(page_id, status="rendering")
    image_bytes = render_page_to_png(pdf_bytes, page_index)
    await db_client.update_page(page_id, status="calling_model", input_hash=input_hash)
    context = PageContext(
        document_id=run["document_id"],
        page_index=page_index,
        page_number=page_index + 1,
    )
    try:
        raw_json = provider.extract_page(image_bytes, context, prompt_version)
        sheet = parse_and_validate(raw_json, provider, image_bytes, context, prompt_version)
    except DemProviderError as exc:
        current_attempts = (existing_page or {}).get("attempt_count", 0)
        if exc.kind == "transient" and current_attempts + 1 < MAX_TRANSIENT_ATTEMPTS:
            await db_client.update_page(page_id, status="retry_wait", failure_kind="transient", error=str(exc), attempt_count=current_attempts + 1)
            return
        next_attempts = current_attempts if exc.kind == "permanent" else current_attempts + 1
        await db_client.update_page(page_id, status="failed", failure_kind=exc.kind, error=str(exc), attempt_count=next_attempts)
        return

    await db_client.update_page(
        page_id,
        status="complete",
        result=sheet.model_dump(mode="json"),
        input_hash=input_hash,
    )
