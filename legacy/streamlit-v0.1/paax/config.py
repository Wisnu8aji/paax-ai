"""Configuration helpers for PAAX AI."""

import os
from collections.abc import Mapping

API_KEY_NAME = "GEMINI_API_KEY"

SUPPORTED_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
)
DEFAULT_MODEL = "gemini-2.5-flash"


class MissingApiKeyError(RuntimeError):
    """Raised when a Gemini API key is not configured."""


def _clean_api_key(value: object) -> str:
    """Normalize a configured API key without exposing it."""
    return value.strip() if isinstance(value, str) else ""


def get_api_key(
    streamlit_secrets: Mapping[str, object] | None = None,
    env: Mapping[str, str] | None = None,
) -> str:
    """Return the configured Gemini API key.

    Streamlit secrets take precedence over the supplied environment mapping.
    When no environment mapping is supplied, the process environment is used.
    """
    if streamlit_secrets is not None:
        streamlit_api_key = _clean_api_key(
            streamlit_secrets.get(API_KEY_NAME)
        )
        if streamlit_api_key:
            return streamlit_api_key

    environment = os.environ if env is None else env
    environment_api_key = _clean_api_key(environment.get(API_KEY_NAME))
    if environment_api_key:
        return environment_api_key

    raise MissingApiKeyError(
        "Gemini API key is missing. Set GEMINI_API_KEY in Streamlit "
        "secrets or the environment."
    )
