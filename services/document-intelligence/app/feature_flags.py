"""Feature flags for document-intelligence service.

All flags are controlled exclusively by environment variables.
Default values are SAFE (disabled) — never hardcoded to True.

Usage:
    from app.feature_flags import DI_FLAGS
    if DI_FLAGS.enable_rab_materialization:
        ...

Flags:
  DI_ENABLE_RAB_MATERIALIZATION
      Default: false.
      Gates whether occurrence data may be fed into RAB materialization.
      MUST remain false until Measurement Fact authority is implemented
      (Phase 2+ of the Drawing Intelligence Truth Rebuild).

  DI_ENABLE_PHYSICAL_QUANTITY
      Default: false.
      Gates display of occurrence_count as a physical count (pcs/ea).
      While false, occurrence data must be labelled "context groups"
      or "Detected References" — never as a physical measurement.

  DI_ENABLE_MOCK_FALLBACK
      Default: false.
      Controls whether the service is allowed to silently substitute
      mock/stub data when real data is not available.
      MUST be false in production. Only enable explicitly in isolated
      demo environments.

  DI_ENABLE_LIVE_AI_TESTS
      Default: false (PERMANENT — never override to true in CI/CD).
      Guard: if this flag is true in a test context the test suite
      will abort rather than call live AI provider APIs.
      Set via DI_ENABLE_LIVE_AI_TESTS env var only for local manual
      smoke tests where the developer explicitly accepts the cost.
"""
from __future__ import annotations

import os


def _bool_env(key: str, default: bool = False) -> bool:
    """Read a boolean environment variable.

    Accepts "1" / "true" / "yes" (case-insensitive) as True;
    everything else (including absent) defaults to *default*.
    """
    raw = os.getenv(key, "")
    if raw.lower() in ("1", "true", "yes"):
        return True
    if raw.lower() in ("0", "false", "no"):
        return False
    return default


class _FeatureFlags:
    """Immutable feature flag bag — evaluated once at module import."""

    @property
    def enable_rab_materialization(self) -> bool:
        return _bool_env("DI_ENABLE_RAB_MATERIALIZATION", default=False)

    @property
    def enable_physical_quantity(self) -> bool:
        return _bool_env("DI_ENABLE_PHYSICAL_QUANTITY", default=False)

    @property
    def enable_mock_fallback(self) -> bool:
        return _bool_env("DI_ENABLE_MOCK_FALLBACK", default=False)

    @property
    def enable_live_ai_tests(self) -> bool:
        return _bool_env("DI_ENABLE_LIVE_AI_TESTS", default=False)


DI_FLAGS = _FeatureFlags()
