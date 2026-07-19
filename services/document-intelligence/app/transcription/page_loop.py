"""DEM per-page processing with failure classification and idempotency."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from app.transcription.db_client import DemDbClient
from app.transcription.evidence_namespacing import namespace_evidence_ids
from app.transcription.failure_classification import DemProviderError
from app.transcription.models import DemGeneration, DemSource, DrawingEvidenceSheet
from app.transcription.page_renderer import render_page
from app.transcription.parser import parse_and_validate
from app.transcription.providers.base import DEM_RETRY_POLICY, DemVisionProvider, PageContext

MAX_TRANSIENT_ATTEMPTS = DEM_RETRY_POLICY.max_transient_attempts


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
    rendered = render_page(pdf_bytes, page_index)
    await db_client.update_page(page_id, status="calling_model", input_hash=input_hash)
    context = PageContext(
        document_id=run["document_id"],
        page_index=page_index,
        page_number=page_index + 1,
    )
    started_at = datetime.now(timezone.utc).isoformat()
    try:
        raw_json = provider.extract_page(rendered.png_bytes, context, prompt_version)
        model_output = parse_and_validate(raw_json, provider, rendered.png_bytes, context, prompt_version)
        model_output = namespace_evidence_ids(model_output, run_id=run["id"], page_index=page_index)
    except DemProviderError as exc:
        current_attempts = (existing_page or {}).get("attempt_count", 0)
        if DEM_RETRY_POLICY.should_retry(failure_kind=exc.kind, prior_attempts=current_attempts):
            await db_client.update_page(page_id, status="retry_wait", failure_kind="transient", error=str(exc), attempt_count=current_attempts + 1)
            return
        next_attempts = current_attempts if exc.kind == "permanent" else current_attempts + 1
        await db_client.update_page(page_id, status="failed", failure_kind=exc.kind, error=str(exc), attempt_count=next_attempts)
        return

    # Assemble the full DrawingEvidenceSheet here -- run-level metadata the
    # vision model was never asked to produce (2026-07-15 redesign) plus the
    # model's own observations (model_output).
    sheet = DrawingEvidenceSheet(
        run_id=run["id"],
        document_id=run["document_id"],
        project_id=run.get("project_id") or run["document_id"],
        source=DemSource(
            document_hash=run["document_hash"],
            file_name=run.get("file_name", "unknown.pdf"),
            page_index=page_index,
            page_number=page_index + 1,
            render_uri=f"inline://{run['id']}/page-{page_index:04d}.png",
            width_px=rendered.width_px,
            height_px=rendered.height_px,
            page_transform=rendered.page_transform,
        ),
        generation=DemGeneration(
            provider="qwen",
            model_alias="qwen3.7-plus",
            prompt_version=prompt_version,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc).isoformat(),
        ),
        sheet_identity=model_output.sheet_identity,
        views=model_output.views,
        observations=model_output.observations,
        evidence=model_output.evidence,
        ambiguities=model_output.ambiguities,
        conflicts=model_output.conflicts,
        unclassified=model_output.unclassified,
        completion=model_output.completion,
    )

    await db_client.update_page(
        page_id,
        status="complete",
        result=sheet.model_dump(mode="json"),
        input_hash=input_hash,
    )
