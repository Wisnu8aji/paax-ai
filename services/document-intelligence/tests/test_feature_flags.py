"""Tests for app.feature_flags — env-var gating and default-false policy.

All tests are deterministic: no network calls, no AI calls.
Values are manually anchored from the flag specification.
"""

import os

import pytest


# ── helpers ───────────────────────────────────────────────────────────────────


def _reload_flags():
    """Re-import feature_flags so property calls pick up fresh env state."""
    # Properties re-read os.getenv each call, so a simple import is enough;
    # but we reload to ensure the module is clean in edge cases.
    import importlib
    import app.feature_flags as ff_module

    importlib.reload(ff_module)
    return ff_module.DI_FLAGS


# ── default values (all flags must default to False) ─────────────────────────


class TestFeatureFlagDefaults:
    """Every flag must default to False when the env var is absent."""

    def test_rab_materialization_default_false(self, monkeypatch):
        monkeypatch.delenv("DI_ENABLE_RAB_MATERIALIZATION", raising=False)
        flags = _reload_flags()
        assert flags.enable_rab_materialization is False

    def test_physical_quantity_default_false(self, monkeypatch):
        monkeypatch.delenv("DI_ENABLE_PHYSICAL_QUANTITY", raising=False)
        flags = _reload_flags()
        assert flags.enable_physical_quantity is False

    def test_mock_fallback_default_false(self, monkeypatch):
        monkeypatch.delenv("DI_ENABLE_MOCK_FALLBACK", raising=False)
        flags = _reload_flags()
        assert flags.enable_mock_fallback is False

    def test_live_ai_tests_default_false(self, monkeypatch):
        monkeypatch.delenv("DI_ENABLE_LIVE_AI_TESTS", raising=False)
        flags = _reload_flags()
        assert flags.enable_live_ai_tests is False


# ── truthy values ─────────────────────────────────────────────────────────────


class TestFeatureFlagTruthy:
    """Flags must turn True for '1', 'true', 'yes' (case-insensitive)."""

    @pytest.mark.parametrize("value", ["1", "true", "True", "TRUE", "yes", "Yes", "YES"])
    def test_rab_materialization_enabled_by_truthy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_RAB_MATERIALIZATION", value)
        flags = _reload_flags()
        assert flags.enable_rab_materialization is True

    @pytest.mark.parametrize("value", ["1", "true", "yes"])
    def test_physical_quantity_enabled_by_truthy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_PHYSICAL_QUANTITY", value)
        flags = _reload_flags()
        assert flags.enable_physical_quantity is True

    @pytest.mark.parametrize("value", ["1", "true", "yes"])
    def test_mock_fallback_enabled_by_truthy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_MOCK_FALLBACK", value)
        flags = _reload_flags()
        assert flags.enable_mock_fallback is True

    @pytest.mark.parametrize("value", ["1", "true", "yes"])
    def test_live_ai_enabled_by_truthy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_LIVE_AI_TESTS", value)
        flags = _reload_flags()
        assert flags.enable_live_ai_tests is True


# ── falsy values ──────────────────────────────────────────────────────────────


class TestFeatureFlagFalsy:
    """Flags must be False for '0', 'false', 'no', empty string, garbage."""

    @pytest.mark.parametrize("value", ["0", "false", "False", "FALSE", "no", "No", "NO", "", "garbage", "off"])
    def test_rab_materialization_disabled_by_falsy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_RAB_MATERIALIZATION", value)
        flags = _reload_flags()
        assert flags.enable_rab_materialization is False

    @pytest.mark.parametrize("value", ["0", "false", "no"])
    def test_physical_quantity_disabled_by_falsy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_PHYSICAL_QUANTITY", value)
        flags = _reload_flags()
        assert flags.enable_physical_quantity is False

    @pytest.mark.parametrize("value", ["0", "false", "no"])
    def test_mock_fallback_disabled_by_falsy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_MOCK_FALLBACK", value)
        flags = _reload_flags()
        assert flags.enable_mock_fallback is False

    @pytest.mark.parametrize("value", ["0", "false", "no"])
    def test_live_ai_disabled_by_falsy(self, monkeypatch, value):
        monkeypatch.setenv("DI_ENABLE_LIVE_AI_TESTS", value)
        flags = _reload_flags()
        assert flags.enable_live_ai_tests is False


# ── independence — flags are isolated ────────────────────────────────────────


class TestFeatureFlagIsolation:
    """Setting one flag must not affect others."""

    def test_flags_are_independent(self, monkeypatch):
        monkeypatch.setenv("DI_ENABLE_RAB_MATERIALIZATION", "true")
        monkeypatch.delenv("DI_ENABLE_PHYSICAL_QUANTITY", raising=False)
        monkeypatch.delenv("DI_ENABLE_MOCK_FALLBACK", raising=False)
        monkeypatch.delenv("DI_ENABLE_LIVE_AI_TESTS", raising=False)
        flags = _reload_flags()
        assert flags.enable_rab_materialization is True
        assert flags.enable_physical_quantity is False
        assert flags.enable_mock_fallback is False
        assert flags.enable_live_ai_tests is False
