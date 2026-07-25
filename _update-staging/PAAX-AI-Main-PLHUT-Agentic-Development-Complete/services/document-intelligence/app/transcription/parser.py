"""Parse and validate DEM model output with one repair pass.

Validates against DemModelOutput (the model's actual responsibility --
sheet_identity/views/observations/evidence/completion), not the full
DrawingEvidenceSheet -- run_id/document_id/project_id/source/generation are
metadata the caller (page_loop.py) already knows and fills in after this
returns, never something the vision model is asked to produce (2026-07-15
redesign, see DemModelOutput's docstring in models.py)."""
from __future__ import annotations

from pydantic import ValidationError

from app.transcription.failure_classification import DemProviderError
from app.transcription.models import DemModelOutput
from app.transcription.providers.base import DemVisionProvider, PageContext


def parse_and_validate(
    raw_json: dict,
    provider: DemVisionProvider,
    image_bytes: bytes,
    page_context: PageContext,
    prompt_version: str,
) -> DemModelOutput:
    try:
        return DemModelOutput.model_validate(raw_json)
    except ValidationError:
        repaired_json = provider.extract_page(
            image_bytes=image_bytes,
            page_context=page_context,
            prompt_version=prompt_version,
        )
        try:
            return DemModelOutput.model_validate(repaired_json)
        except ValidationError as second_error:
            raise DemProviderError(
                f"DEM output invalid after repair pass: {second_error}",
                kind="invalid_output",
            ) from second_error
