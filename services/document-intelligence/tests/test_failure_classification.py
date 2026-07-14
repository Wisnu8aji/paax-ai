from __future__ import annotations

from app.transcription.failure_classification import DemProviderError, classify_http_error


def test_classify_http_error_429_is_transient():
    assert classify_http_error(429) == "transient"


def test_classify_http_error_500_is_transient():
    assert classify_http_error(503) == "transient"


def test_classify_http_error_401_is_permanent():
    assert classify_http_error(401) == "permanent"


def test_classify_http_error_400_is_permanent():
    assert classify_http_error(400) == "permanent"


def test_classify_http_error_unknown_defaults_to_invalid_output():
    assert classify_http_error(200) == "invalid_output"


def test_dem_provider_error_carries_kind():
    error = DemProviderError("boom", kind="transient")
    assert error.kind == "transient"
    assert str(error) == "boom"
