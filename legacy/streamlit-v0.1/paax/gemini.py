"""Gemini API service helpers for PAAX AI."""

from google import genai
from google.genai import types


class GeminiServiceError(RuntimeError):
    """Raised when a Gemini API request fails."""


class EmptyGeminiResponseError(GeminiServiceError):
    """Raised when Gemini returns no usable response text."""


def convert_messages_for_gemini(messages: list[dict]) -> list[dict]:
    """Convert Streamlit-style chat messages into Gemini contents."""
    role_mapping = {
        "user": "user",
        "assistant": "model",
    }
    converted_messages = []

    for message in messages:
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            continue

        role = message.get("role")
        if role not in role_mapping:
            raise ValueError(f"Unsupported message role: {role!r}")

        converted_messages.append(
            {
                "role": role_mapping[role],
                "parts": [{"text": content.strip()}],
            }
        )

    return converted_messages


def generate_response(
    api_key: str,
    model_name: str,
    messages: list[dict],
    system_instruction: str,
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_output_tokens: int = 1200,
) -> str:
    """Generate a Gemini response for the supplied conversation."""
    contents = convert_messages_for_gemini(messages)

    try:
        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            top_p=top_p,
            max_output_tokens=max_output_tokens,
        )
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )
    except Exception as exc:
        raise GeminiServiceError(
            "The Gemini request failed. Please try again."
        ) from exc

    response_text = getattr(response, "text", None)
    if not isinstance(response_text, str) or not response_text.strip():
        raise EmptyGeminiResponseError(
            "Gemini returned an empty response."
        )

    return response_text.strip()
