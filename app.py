"""Streamlit entry point for PAAX AI v0.1."""

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from paax.config import (
    DEFAULT_MODEL,
    SUPPORTED_MODELS,
    MissingApiKeyError,
    get_api_key,
)
from paax.gemini import (
    EmptyGeminiResponseError,
    GeminiServiceError,
    generate_response,
)
from paax.prompts import SYSTEM_INSTRUCTION

GREETING = (
    "Halo, saya PAAX AI v0.1. Tulis pesan apa saja, "
    "saya akan bantu jawab."
)


def load_api_key() -> str:
    """Load the API key while allowing environment-only configuration."""
    try:
        return get_api_key(streamlit_secrets=st.secrets)
    except StreamlitSecretNotFoundError:
        return get_api_key(streamlit_secrets={})


def initialize_chat() -> None:
    """Initialize the active session with the assistant greeting."""
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": GREETING}
        ]


def reset_chat() -> None:
    """Reset the active conversation while preserving other settings."""
    st.session_state.messages = [
        {"role": "assistant", "content": GREETING}
    ]


def main() -> None:
    """Render and run the PAAX AI Streamlit application."""
    st.set_page_config(page_title="PAAX AI v0.1", page_icon="🤖")
    initialize_chat()

    st.title("PAAX AI v0.1")
    st.caption("A simple LLM-powered chatbot using Gemini API.")

    with st.sidebar:
        st.header("Settings")
        selected_model = st.selectbox(
            "Model",
            options=SUPPORTED_MODELS,
            index=SUPPORTED_MODELS.index(DEFAULT_MODEL),
        )

        if st.button("Reset chat", use_container_width=True):
            reset_chat()
            st.rerun()

        st.divider()
        st.write(
            "PAAX AI v0.1 is a bilingual Indonesian-English chatbot "
            "powered by the Gemini API."
        )
        st.warning(
            "Privacy note: do not enter sensitive or confidential data."
        )

    try:
        api_key = load_api_key()
    except MissingApiKeyError:
        api_key = None
        st.error(
            "Gemini API key is not configured. Set GEMINI_API_KEY in "
            "Streamlit secrets or an environment variable."
        )

    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    prompt = st.chat_input(
        "Type your message...",
        disabled=api_key is None,
    )
    if not prompt or api_key is None:
        return

    user_message = {"role": "user", "content": prompt}
    st.session_state.messages.append(user_message)
    with st.chat_message("user"):
        st.markdown(prompt)

    try:
        with st.spinner("PAAX AI is thinking..."):
            assistant_response = generate_response(
                api_key=api_key,
                model_name=selected_model,
                messages=st.session_state.messages,
                system_instruction=SYSTEM_INSTRUCTION,
            )
    except EmptyGeminiResponseError:
        st.error(
            "Gemini returned an empty response. Please try again."
        )
    except GeminiServiceError:
        st.error(
            "PAAX AI could not contact Gemini. Please try again later."
        )
    else:
        st.session_state.messages.append(
            {"role": "assistant", "content": assistant_response}
        )
        with st.chat_message("assistant"):
            st.markdown(assistant_response)


if __name__ == "__main__":
    main()
