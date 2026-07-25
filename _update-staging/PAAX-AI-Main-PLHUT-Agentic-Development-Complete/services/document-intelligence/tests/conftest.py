"""pytest configuration for services/document-intelligence/tests.

Enforces:
  1. No outbound network calls to live AI providers (§0.4 of the Drawing
     Intelligence Super Big Plan: all provider tests use mocks/stubs/fixtures).
  2. DI_ENABLE_LIVE_AI_TESTS must be False (default) for this suite to pass.
     If it is explicitly set to True the test run FAILS with a clear message —
     this prevents accidental live API spending in CI/CD.

Network-block approach: monkeypatches socket.socket so that any attempt to
create a TCP connection to a known AI-provider host raises RuntimeError.
This catches both httpx, requests, aiohttp, and raw socket usage.
"""
from __future__ import annotations

import os
import socket
from typing import Any
from unittest.mock import patch

import pytest


# ── Live AI guard ─────────────────────────────────────────────────────────────

_LIVE_AI_FLAG = os.getenv("DI_ENABLE_LIVE_AI_TESTS", "").lower()
_LIVE_AI_ENABLED = _LIVE_AI_FLAG in ("1", "true", "yes")


def pytest_configure(config: Any) -> None:  # noqa: ANN001
    """Abort the entire session if DI_ENABLE_LIVE_AI_TESTS=true."""
    if _LIVE_AI_ENABLED:
        pytest.exit(
            "\n"
            "BLOCKED: DI_ENABLE_LIVE_AI_TESTS=true is set.\n"
            "This test suite NEVER calls live AI provider APIs (§0.4).\n"
            "Unset DI_ENABLE_LIVE_AI_TESTS (or set it to false/0) to run the suite.\n",
            returncode=1,
        )


# ── Network block autouse fixture ─────────────────────────────────────────────

_AI_PROVIDER_HOSTS = frozenset(
    [
        # OpenRouter
        "openrouter.ai",
        # Anthropic
        "api.anthropic.com",
        # DashScope / Alibaba
        "dashscope.aliyuncs.com",
        "dashscope-intl.aliyuncs.com",
        # DeepSeek
        "api.deepseek.com",
        # Google AI / Gemini / Vertex
        "generativelanguage.googleapis.com",
        "aiplatform.googleapis.com",
        "ai.google.dev",
        # NVIDIA NIM
        "integrate.api.nvidia.com",
        "ai.api.nvidia.com",
        "build.nvidia.com",
        # OpenAI
        "api.openai.com",
    ]
)


class _BlockedSocket(socket.socket):
    """Drop-in socket replacement that rejects connections to AI provider hosts."""

    def connect(self, address: Any) -> None:  # type: ignore[override]
        host = address[0] if isinstance(address, (tuple, list)) else str(address)
        for blocked in _AI_PROVIDER_HOSTS:
            if blocked in host:
                raise RuntimeError(
                    f"[conftest] Blocked outbound connection to AI provider '{host}' "
                    f"(§0.4: use mocks/fixtures, not live API calls)."
                )
        super().connect(address)

    def connect_ex(self, address: Any) -> int:  # type: ignore[override]
        host = address[0] if isinstance(address, (tuple, list)) else str(address)
        for blocked in _AI_PROVIDER_HOSTS:
            if blocked in host:
                raise RuntimeError(
                    f"[conftest] Blocked outbound connection to AI provider '{host}' "
                    f"(§0.4: use mocks/fixtures, not live API calls)."
                )
        return super().connect_ex(address)


@pytest.fixture(autouse=True)
def _block_ai_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Auto-use fixture: block any socket attempt to live AI provider hosts."""
    monkeypatch.setattr(socket, "socket", _BlockedSocket)


# ── Real-key isolation ─────────────────────────────────────────────────────────
#
# app.main imports app.env.load_repo_env_local(), which reads <repo-root>/.env.local
# (if present, e.g. on a developer's own machine) and copies every KEY=VALUE line
# straight into os.environ at import time. Any test importing app.main therefore
# inherits real Command Room / Drawing Intelligence provider keys instead of the
# blank values CI sets explicitly. The hostname-block above only catches known
# provider hosts by substring; it cannot catch a genuine key being handed to a
# provider client. Blank these out for the whole test session so no test can
# accidentally construct a client that would authenticate against a live API.
_LIVE_KEY_ENV_VARS = (
    "DEEPSEEK_API_KEY",
    "DRAWING_INTELLIGENCE_API_KEY",
    "DRAWING_INTELLIGENCE_DEEPSEEK_MODEL",
    "NVIDIA_API_KEY",
    "NVIDIA_DRAWING_REVIEW_API_KEY",
    "NVIDIA_DEEP_REVIEW_API_KEY",
    "NVIDIA_DRAWING_FAST_API_KEY",
    "NVIDIA_DRAWING_PARSE_API_KEY",
    "NVIDIA_DRAWING_OCR_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
)


@pytest.fixture(autouse=True)
def _blank_real_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Auto-use fixture: guarantee no real AI provider key reaches a test.

    Tests that need a key present use monkeypatch.setenv() themselves for a
    fake value, which still wins because monkeypatch fixtures compose LIFO
    within a test -- this fixture only clears whatever load_repo_env_local()
    (or the developer's own shell) may have already set at import/session time.
    """
    for name in _LIVE_KEY_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
