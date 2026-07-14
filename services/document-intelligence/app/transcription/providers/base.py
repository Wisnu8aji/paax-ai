"""Provider-agnostic contract for DEM vision extraction."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PageContext:
    document_id: str
    page_index: int
    page_number: int


class DemVisionProvider(Protocol):
    """Extract raw JSON for one rendered drawing page."""

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        ...
