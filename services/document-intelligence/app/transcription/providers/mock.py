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
        if not self.response:
            p = page_context.page_number
            sheet_num = f"A-{p:02d}"
            title = f"Sheet {p}"
            return {
                "sheet_identity": {
                    "sheet_number": {"value": sheet_num, "confidence": 1.0},
                    "title": {"value": title, "confidence": 1.0},
                    "discipline": {"value": "Architectural", "confidence": 1.0, "status": "extracted"},
                },
                "completion": {
                    "sections_expected": 1,
                    "sections_completed": 1,
                    "is_complete": True,
                },
            }
        return self.response
