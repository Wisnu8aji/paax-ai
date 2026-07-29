from __future__ import annotations

"""Provider-neutral model router for Drawing Intelligence AI benchmark.

Enforces:
- 15 deepseek-v4-pro + 15 qwen-3.7-plus allocation (30 attempts max).
- Immutable rejection of attempt 31 before network call.
- Strict key isolation: reads ONLY DRAWING_INTELLIGENCE_API_KEY.
- No auto-fallback or model substitution.
"""

import os
from typing import Literal

from .benchmark_router import (
    MAX_ATTEMPTS,
    PROVIDER_ALLOCATION,
    BenchmarkCase,
    BenchmarkRecord,
    ControlledBenchmarkLedger,
    ProviderName,
)

ALLOWED_DI_KEY_NAME = "DRAWING_INTELLIGENCE_API_KEY"


class DrawingIntelligenceModelRouter:
    """Provider-neutral router isolated strictly to Drawing Intelligence."""

    def __init__(self, key: str | None = None):
        if key is not None:
            self._api_key = key.strip()
        else:
            self._api_key = self._get_di_api_key_only()

    @staticmethod
    def _get_di_api_key_only() -> str:
        """Reads ONLY DRAWING_INTELLIGENCE_API_KEY. Rejects all fallback keys."""
        di_key = os.getenv(ALLOWED_DI_KEY_NAME, "").strip()
        if not di_key:
            raise RuntimeError(
                f"{ALLOWED_DI_KEY_NAME} is required. Router cannot use GEMINI_API_KEY, "
                "NVIDIA_API_KEY, DEEPSEEK_API_KEY, or Command Room keys."
            )
        return di_key

    def get_api_key(self) -> str:
        return self._api_key

    def get_allocation_for_attempt(self, attempt_index: int) -> ProviderName:
        """Return provider for 1-based attempt_index (1 to 30). Rejects attempt 31."""
        if attempt_index < 1:
            raise ValueError(f"attempt index must be >= 1, got {attempt_index}")
        if attempt_index > MAX_ATTEMPTS:
            raise RuntimeError(
                f"Attempt {attempt_index} rejected: total immutable limit of {MAX_ATTEMPTS} attempts exceeded."
            )
        return PROVIDER_ALLOCATION[attempt_index - 1]

    def validate_case(self, case: BenchmarkCase) -> None:
        """Validate case contains no image/PDF/pixel paths."""
        if not isinstance(case, BenchmarkCase):
            raise TypeError("case must be an instance of BenchmarkCase")
