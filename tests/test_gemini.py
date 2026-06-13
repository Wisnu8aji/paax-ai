from unittest.mock import Mock, patch

import pytest

from paax.gemini import (
    EmptyGeminiResponseError,
    GeminiServiceError,
    convert_messages_for_gemini,
    generate_response,
)

TEST_API_KEY = "test-api-key"
TEST_MODEL = "gemini-test-model"
TEST_SYSTEM_INSTRUCTION = "Be helpful."


def test_user_role_conversion():
    converted = convert_messages_for_gemini(
        [{"role": "user", "content": "Hello"}]
    )

    assert converted == [
        {"role": "user", "parts": [{"text": "Hello"}]}
    ]


def test_assistant_role_converts_to_model():
    converted = convert_messages_for_gemini(
        [{"role": "assistant", "content": "Hi"}]
    )

    assert converted == [
        {"role": "model", "parts": [{"text": "Hi"}]}
    ]


def test_message_content_whitespace_is_stripped():
    converted = convert_messages_for_gemini(
        [{"role": "user", "content": "  Hello there  "}]
    )

    assert converted[0]["parts"][0]["text"] == "Hello there"


def test_empty_messages_are_ignored():
    converted = convert_messages_for_gemini(
        [
            {"role": "user", "content": ""},
            {"role": "assistant", "content": "   "},
            {"role": "user", "content": "Hello"},
        ]
    )

    assert converted == [
        {"role": "user", "parts": [{"text": "Hello"}]}
    ]


def test_unsupported_role_raises_value_error():
    with pytest.raises(ValueError, match="Unsupported message role"):
        convert_messages_for_gemini(
            [{"role": "system", "content": "Hello"}]
        )


@patch("paax.gemini.types.GenerateContentConfig")
@patch("paax.gemini.genai.Client")
def test_generate_response_returns_stripped_text(
    mock_client_class,
    mock_config_class,
):
    client = mock_client_class.return_value
    client.models.generate_content.return_value = Mock(
        text="  Gemini response  "
    )

    result = generate_response(
        api_key=TEST_API_KEY,
        model_name=TEST_MODEL,
        messages=[{"role": "user", "content": "Hello"}],
        system_instruction=TEST_SYSTEM_INSTRUCTION,
    )

    assert result == "Gemini response"


@patch("paax.gemini.genai.Client")
def test_empty_gemini_response_raises_error(mock_client_class):
    client = mock_client_class.return_value
    client.models.generate_content.return_value = Mock(text="   ")

    with pytest.raises(EmptyGeminiResponseError):
        generate_response(
            api_key=TEST_API_KEY,
            model_name=TEST_MODEL,
            messages=[{"role": "user", "content": "Hello"}],
            system_instruction=TEST_SYSTEM_INSTRUCTION,
        )


@patch("paax.gemini.genai.Client")
def test_sdk_exception_is_wrapped_as_service_error(mock_client_class):
    client = mock_client_class.return_value
    client.models.generate_content.side_effect = RuntimeError(
        "SDK request failed"
    )

    with pytest.raises(GeminiServiceError) as error:
        generate_response(
            api_key=TEST_API_KEY,
            model_name=TEST_MODEL,
            messages=[{"role": "user", "content": "Hello"}],
            system_instruction=TEST_SYSTEM_INSTRUCTION,
        )

    assert isinstance(error.value.__cause__, RuntimeError)
    assert TEST_API_KEY not in str(error.value)


@patch("paax.gemini.types.GenerateContentConfig")
@patch("paax.gemini.genai.Client")
def test_generate_response_passes_model_and_config_correctly(
    mock_client_class,
    mock_config_class,
):
    client = mock_client_class.return_value
    client.models.generate_content.return_value = Mock(text="Done")
    config = mock_config_class.return_value
    messages = [{"role": "user", "content": "  Hello  "}]

    generate_response(
        api_key=TEST_API_KEY,
        model_name=TEST_MODEL,
        messages=messages,
        system_instruction=TEST_SYSTEM_INSTRUCTION,
        temperature=0.4,
        top_p=0.8,
        max_output_tokens=600,
    )

    mock_client_class.assert_called_once_with(api_key=TEST_API_KEY)
    mock_config_class.assert_called_once_with(
        system_instruction=TEST_SYSTEM_INSTRUCTION,
        temperature=0.4,
        top_p=0.8,
        max_output_tokens=600,
    )
    client.models.generate_content.assert_called_once_with(
        model=TEST_MODEL,
        contents=[
            {"role": "user", "parts": [{"text": "Hello"}]}
        ],
        config=config,
    )
