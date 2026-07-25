"""Failure classification for the DEM Phase 2 vision-provider workflow."""
from __future__ import annotations

from typing import Literal


FailureKind = Literal["transient", "invalid_output", "permanent"]

_TRANSIENT_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
_PERMANENT_STATUS_CODES = {400, 401, 403, 404, 422}


class DemProviderError(Exception):
    """Provider or parser failure annotated with the safe handling policy."""

    def __init__(self, message: str, *, kind: FailureKind) -> None:
        super().__init__(message)
        self.kind: FailureKind = kind


def classify_http_error(status_code: int) -> FailureKind:
    if status_code in _TRANSIENT_STATUS_CODES:
        return "transient"
    if status_code in _PERMANENT_STATUS_CODES:
        return "permanent"
    return "invalid_output"
