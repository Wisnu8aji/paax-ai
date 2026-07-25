from __future__ import annotations

from app.project_graph.synthesis_types import (
    ModelUsage,
    PckmProviderResult,
    PckmSynthesisProvider,
    ResolutionCandidate,
)


class PckmProviderError(RuntimeError):
    """A provider failure with retry classification for PCKM synthesis."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


__all__ = [
    "ModelUsage",
    "PckmProviderError",
    "PckmProviderResult",
    "PckmSynthesisProvider",
    "ResolutionCandidate",
]
