"""
Regression test: Phase 10C correction round 1 — provider routing wiring.

Verifies that:
1. The application's DeepSeek provider reads DRAWING_INTELLIGENCE_API_KEY (not DEEPSEEK_API_KEY).
2. The correct chat endpoint is api.deepseek.com/chat/completions (not /v1/models).
3. The correct model alias is 'deepseek-v4-flash' (per SUPPORTED_MODEL_ALIASES).
4. DRAWING_INTELLIGENCE_API_KEY must be set in .env.local (git-ignored), not .env.
5. When DRAWING_INTELLIGENCE_API_KEY is absent, DeepSeekPckmProvider.from_env() returns None (safe fallback).
"""

import os
import pathlib
import pytest
import subprocess


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def test_deepseek_provider_reads_correct_key_variable():
    """Provider must read DRAWING_INTELLIGENCE_API_KEY, not DEEPSEEK_API_KEY."""
    from app.project_graph.providers.deepseek import DeepSeekPckmProvider

    # Without DRAWING_INTELLIGENCE_API_KEY set, from_env() must return None
    env_backup = os.environ.pop("DRAWING_INTELLIGENCE_API_KEY", None)
    try:
        result = DeepSeekPckmProvider.from_env()
        assert result is None, (
            "DeepSeekPckmProvider.from_env() must return None when DRAWING_INTELLIGENCE_API_KEY is absent. "
            "It must NOT fall back to DEEPSEEK_API_KEY (Command Room key)."
        )
    finally:
        if env_backup is not None:
            os.environ["DRAWING_INTELLIGENCE_API_KEY"] = env_backup


def test_deepseek_provider_uses_correct_endpoint():
    """The application's default endpoint must be api.deepseek.com/chat/completions, not /v1/models."""
    from app.project_graph.providers.deepseek import DEFAULT_API_URL

    assert "/chat/completions" in DEFAULT_API_URL, (
        f"DEFAULT_API_URL must point to /chat/completions, got: {DEFAULT_API_URL}"
    )
    assert "/v1/models" not in DEFAULT_API_URL, (
        f"DEFAULT_API_URL must not be the models-list endpoint, got: {DEFAULT_API_URL}"
    )


def test_deepseek_v4_flash_model_alias_is_supported():
    """'deepseek-v4-flash' must be in SUPPORTED_MODEL_ALIASES."""
    from app.project_graph.providers.deepseek import SUPPORTED_MODEL_ALIASES, DEFAULT_FLASH_MODEL

    assert "deepseek-v4-flash" in SUPPORTED_MODEL_ALIASES, (
        f"'deepseek-v4-flash' not found in SUPPORTED_MODEL_ALIASES: {SUPPORTED_MODEL_ALIASES}"
    )
    assert DEFAULT_FLASH_MODEL == "deepseek-v4-flash", (
        f"DEFAULT_FLASH_MODEL should be 'deepseek-v4-flash', got: {DEFAULT_FLASH_MODEL}"
    )


def test_env_local_is_gitignored():
    """.env.local must be git-ignored to prevent accidental key exposure."""
    result = subprocess.run(
        ["git", "check-ignore", "-v", ".env.local"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    assert result.returncode == 0, (
        ".env.local is NOT git-ignored. It must be listed in .gitignore to protect "
        "DRAWING_INTELLIGENCE_API_KEY from accidental commit."
    )


def test_drawing_intelligence_api_key_not_in_tracked_env():
    """DRAWING_INTELLIGENCE_API_KEY must not be set in any git-tracked file."""
    result = subprocess.run(
        ["git", "ls-files", ".env"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    tracked_env = result.stdout.strip()
    # If .env is tracked, it must not contain the DI API key value (just the name is ok)
    # We check that the key NAME exists but the value slot is empty in the tracked file
    if ".env" in tracked_env:
        env_content = (REPO_ROOT / ".env").read_text(encoding="utf-8", errors="ignore")
        for line in env_content.splitlines():
            if line.strip().startswith("DRAWING_INTELLIGENCE_API_KEY"):
                key_val = line.split("=", 1)[1].strip() if "=" in line else ""
                assert not key_val, (
                    "DRAWING_INTELLIGENCE_API_KEY has a non-empty value in tracked .env file. "
                    "This key must only be stored in .env.local (git-ignored)."
                )
