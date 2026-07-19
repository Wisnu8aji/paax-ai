"""Provider-agnostic contract for DEM vision extraction."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PageContext:
    document_id: str
    page_index: int
    page_number: int

@dataclass(frozen=True)
class ProviderRetryPolicy:
    """Canonical DEM-only retry policy; PCKM keeps its separate service contract."""
    max_transient_attempts: int = 3

    def should_retry(self, *, failure_kind: str, prior_attempts: int) -> bool:
        return failure_kind == "transient" and prior_attempts + 1 < self.max_transient_attempts

DEM_RETRY_POLICY = ProviderRetryPolicy()


class DemVisionProvider(Protocol):
    """Extract raw JSON for one rendered drawing page."""

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        ...
