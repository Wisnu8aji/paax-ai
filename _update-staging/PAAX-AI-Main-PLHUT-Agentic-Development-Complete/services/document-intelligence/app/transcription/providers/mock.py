"""Test-only DEM vision provider with no network calls."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.transcription.failure_classification import DemProviderError
from app.transcription.providers.base import PageContext


@dataclass
class MockDemAdapter:
    response: dict = field(default_factory=dict)
    error: DemProviderError | None = None

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        if self.error is not None:
            raise self.error
        return self.response
