"""Parse and validate DEM model output with one repair pass."""
from __future__ import annotations

from pydantic import ValidationError

from app.transcription.failure_classification import DemProviderError
from app.transcription.models import DrawingEvidenceSheet
from app.transcription.providers.base import DemVisionProvider, PageContext


def parse_and_validate(
    raw_json: dict,
    provider: DemVisionProvider,
    image_bytes: bytes,
    page_context: PageContext,
    prompt_version: str,
) -> DrawingEvidenceSheet:
    try:
        return DrawingEvidenceSheet.model_validate(raw_json)
    except ValidationError:
        repaired_json = provider.extract_page(
            image_bytes=image_bytes,
            page_context=page_context,
            prompt_version=prompt_version,
        )
        try:
            return DrawingEvidenceSheet.model_validate(repaired_json)
        except ValidationError as second_error:
            raise DemProviderError(
                f"DEM output invalid after repair pass: {second_error}",
                kind="invalid_output",
            ) from second_error
