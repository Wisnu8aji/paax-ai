import pytest

from paax.config import MissingApiKeyError, get_api_key


def test_api_key_loaded_from_streamlit_secrets():
    api_key = get_api_key(
        streamlit_secrets={"GEMINI_API_KEY": "streamlit-test-key"},
        env={},
    )

    assert api_key == "streamlit-test-key"


def test_api_key_loaded_from_environment_fallback():
    api_key = get_api_key(
        streamlit_secrets={},
        env={"GEMINI_API_KEY": "environment-test-key"},
    )

    assert api_key == "environment-test-key"


def test_empty_streamlit_secret_uses_environment_fallback():
    api_key = get_api_key(
        streamlit_secrets={"GEMINI_API_KEY": "   "},
        env={"GEMINI_API_KEY": "environment-test-key"},
    )

    assert api_key == "environment-test-key"


def test_streamlit_secrets_take_precedence_over_environment():
    api_key = get_api_key(
        streamlit_secrets={"GEMINI_API_KEY": "streamlit-test-key"},
        env={"GEMINI_API_KEY": "environment-test-key"},
    )

    assert api_key == "streamlit-test-key"


@pytest.mark.parametrize(
    ("streamlit_secrets", "env"),
    [
        ({"GEMINI_API_KEY": "  streamlit-test-key  "}, {}),
        ({}, {"GEMINI_API_KEY": "  environment-test-key  "}),
    ],
)
def test_api_key_whitespace_is_stripped(streamlit_secrets, env):
    api_key = get_api_key(streamlit_secrets=streamlit_secrets, env=env)

    assert api_key in {"streamlit-test-key", "environment-test-key"}


def test_missing_api_key_raises_error():
    with pytest.raises(MissingApiKeyError):
        get_api_key(streamlit_secrets={}, env={})


@pytest.mark.parametrize(
    ("streamlit_secrets", "env"),
    [
        ({"GEMINI_API_KEY": ""}, {}),
        ({"GEMINI_API_KEY": "   "}, {}),
        ({"GEMINI_API_KEY": None}, {}),
        ({}, {"GEMINI_API_KEY": ""}),
        ({}, {"GEMINI_API_KEY": "   "}),
    ],
)
def test_empty_api_key_raises_error(streamlit_secrets, env):
    with pytest.raises(MissingApiKeyError):
        get_api_key(streamlit_secrets=streamlit_secrets, env=env)
